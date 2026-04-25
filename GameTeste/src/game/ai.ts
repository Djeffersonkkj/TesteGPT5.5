import {
  GOLD_FACTION_ID,
  PLAYER_FACTION_ID,
  SHADOW_FACTION_ID,
  STONE_FACTION_ID,
} from "./constants";
import type { DailyReport, Faction, GameState } from "./types";
import {
  average,
  changeRelation,
  clamp,
  combatPower,
  countTerritories,
  foodTotal,
  getArea,
  getFaction,
  livingFactionMonkeys,
  roll,
  sample,
  updateMonkeyStatus,
} from "./utils";

function richestAreaFor(state: GameState, faction: Faction) {
  const owned = state.areas.filter((area) => area.ownerFactionId === faction.id);
  if (owned.length === 0) {
    return sample(state.areas);
  }
  return [...owned].sort((a, b) => b.currentFood - a.currentFood)[0];
}

function collectForFaction(state: GameState, faction: Faction, report: DailyReport): void {
  const area = richestAreaFor(state, faction);
  const workers = livingFactionMonkeys(state, faction.id).slice(0, 4);
  const skill = average(workers.map((monkey) => monkey.intelligence + monkey.energy / 20));
  const amount = Math.max(1, Math.min(area.currentFood, Math.floor(skill / 2 + Math.random() * 4)));
  area.currentFood -= amount;
  faction.food.bananas += amount;
  workers.forEach((monkey) => {
    monkey.energy = clamp(monkey.energy - 8, 0, monkey.maxEnergy);
    updateMonkeyStatus(monkey);
  });

  if (area.knownByPlayer && roll(0.45)) {
    report.rumors.push(`${faction.name} coletou comida em ${area.name}.`);
  }
}

function stoneTurn(state: GameState, faction: Faction, report: DailyReport): void {
  const hungry = foodTotal(faction) < livingFactionMonkeys(state, faction.id).length * 1.5;
  const target = [...state.areas]
    .filter((area) => area.ownerFactionId !== faction.id)
    .sort((a, b) => b.currentFood + b.combatModifier - (a.currentFood + a.combatModifier))[0];

  if ((hungry || roll(0.45)) && target) {
    const previousOwner = target.ownerFactionId;
    const attackers = livingFactionMonkeys(state, faction.id).slice(0, 5);
    const defenders = livingFactionMonkeys(state, previousOwner || PLAYER_FACTION_ID).filter(
      (monkey) => monkey.locationId === target.id,
    );
    const attackPower = combatPower(attackers) + 8;
    const defensePower = defenders.length > 0 ? combatPower(defenders) : target.dangerLevel * 2;

    if (attackPower > defensePower || roll(0.35)) {
      target.ownerFactionId = faction.id;
      attackers.forEach((monkey) => {
        monkey.locationId = target.id;
        monkey.energy = clamp(monkey.energy - 12, 0, monkey.maxEnergy);
      });
      if (previousOwner === state.playerFactionId) {
        report.confirmed.push(`${faction.name} avançou sobre ${target.name}.`);
      } else {
        report.rumors.push(`${faction.name} tomou posições em ${target.name}.`);
      }
      if (previousOwner) {
        changeRelation(state, faction.id, previousOwner, -8);
      }
      return;
    }
  }

  collectForFaction(state, faction, report);
}

function shadowTurn(state: GameState, faction: Faction, report: DailyReport): void {
  const player = getFaction(state, state.playerFactionId);
  const relation = faction.relations[state.playerFactionId] ?? 0;
  const guards = livingFactionMonkeys(state, state.playerFactionId)
    .filter((monkey) => monkey.role === "Guarda")
    .reduce((sum, monkey) => sum + monkey.intelligence + monkey.defense + monkey.energy / 25, 0);
  const stealth = average(livingFactionMonkeys(state, faction.id).map((monkey) => monkey.stealth)) + 8;

  if (player.food.bananas > 3 && (relation < 10 || roll(0.5))) {
    const amount = Math.min(player.food.bananas, 2 + Math.floor(Math.random() * 4));
    const detected = guards + Math.random() * 18 > stealth + Math.random() * 12;
    player.food.bananas -= amount;
    faction.food.bananas += amount;
    changeRelation(state, faction.id, state.playerFactionId, detected ? -15 : -7);

    if (detected) {
      report.confirmed.push(`Guardas flagraram agentes da Sombra das Copas tentando roubar ${amount} banana(s).`);
    } else {
      report.suspicions.push(`${amount} banana(s) desapareceram; marcas leves apontam para a Sombra das Copas.`);
    }
    return;
  }

  const weak = livingFactionMonkeys(state, state.playerFactionId).filter(
    (monkey) => monkey.loyalty < 45 || monkey.morale < 38,
  );
  if (weak.length > 0 && roll(0.35)) {
    const target = sample(weak);
    target.loyalty = clamp(target.loyalty - 8, 0, 100);
    report.suspicions.push(`${target.name} recebeu sussurros estranhos vindos do Bosque Alto.`);
    return;
  }

  collectForFaction(state, faction, report);
}

function goldTurn(state: GameState, faction: Faction, report: DailyReport): void {
  const player = getFaction(state, state.playerFactionId);
  const relation = faction.relations[state.playerFactionId] ?? 0;

  if (relation > -25 && roll(0.42)) {
    const delta = relation < 35 ? 5 : 2;
    changeRelation(state, faction.id, player.id, delta);
    report.rumors.push(`${faction.name} enviou sinais de paz e interesse em troca de comida.`);
    if (faction.food.bananas > 18 && player.food.bananas < 8 && roll(0.5)) {
      const gift = Math.min(3, faction.food.bananas);
      faction.food.bananas -= gift;
      player.food.bananas += gift;
      report.confirmed.push(`${faction.name} deixou ${gift} banana(s) perto do Rio Barrento.`);
    }
    return;
  }

  if (countTerritories(state, faction.id) < 3 && roll(0.35)) {
    const neutral = state.areas.find((area) => area.ownerFactionId === null);
    if (neutral) {
      neutral.ownerFactionId = faction.id;
      report.rumors.push(`${faction.name} convenceu peregrinos a ocupar ${neutral.name}.`);
      return;
    }
  }

  collectForFaction(state, faction, report);
}

export function resolveEnemyAI(state: GameState, report: DailyReport): void {
  state.factions
    .filter((faction) => !faction.isPlayer && faction.alive)
    .forEach((faction) => {
      if (faction.id === STONE_FACTION_ID) {
        stoneTurn(state, faction, report);
      } else if (faction.id === SHADOW_FACTION_ID) {
        shadowTurn(state, faction, report);
      } else if (faction.id === GOLD_FACTION_ID) {
        goldTurn(state, faction, report);
      }
    });
}
