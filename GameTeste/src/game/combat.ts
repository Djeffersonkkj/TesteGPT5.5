import type { GameState, PendingCombat } from "./types";
import {
  changeRelation,
  clamp,
  combatPower,
  getArea,
  getFaction,
  getMonkey,
  livingMonkeys,
  roll,
  sample,
  updateMonkeyStatus,
} from "./utils";

export interface CombatOption {
  id:
    | "direct"
    | "defend"
    | "intimidate"
    | "flee"
    | "ambush"
    | "focusLeader"
    | "protectWounded"
    | "useTool"
    | "negotiate";
  label: string;
  text: string;
}

export interface CombatRoundResult {
  state: GameState;
  finished: boolean;
}

function activeMonkeys(state: GameState, ids: string[]) {
  return ids.map((id) => getMonkey(state, id)).filter((monkey) => monkey.status !== "morto");
}

export function getCombatOptions(state: GameState): CombatOption[] {
  const combat = state.pendingCombat;
  if (!combat) {
    return [];
  }
  const players = activeMonkeys(state, combat.playerMonkeyIds);
  const area = getArea(state, combat.areaId);
  const hasTool = players.some((monkey) => monkey.inventory.length > 0);
  const stealth = players.reduce((sum, monkey) => sum + monkey.stealth, 0);
  const charisma = players.reduce((sum, monkey) => sum + monkey.charisma, 0);
  const brute = players.filter((monkey) => monkey.species === "Gorila" || monkey.species === "Mandril").length;
  const wounded = players.some((monkey) => monkey.status === "ferido" || monkey.hp < monkey.maxHp * 0.5);

  const options: CombatOption[] = [
    {
      id: "direct",
      label: brute >= 2 ? "Ataque esmagador" : "Ataque direto",
      text: "Aumenta dano, mas também expõe o grupo.",
    },
    {
      id: "defend",
      label: "Defender",
      text: "Reduz dano recebido e tenta cansar o inimigo.",
    },
    {
      id: "intimidate",
      label: brute >= 1 ? "Intimidação brutal" : "Tentar intimidar",
      text: "Usa presença e moral para quebrar a linha rival.",
    },
    {
      id: "flee",
      label: "Tentar fugir",
      text: "Pode encerrar o combate preservando vidas.",
    },
  ];

  if (stealth + area.stealthModifier * 3 >= players.length * 5) {
    options.push({
      id: "ambush",
      label: "Emboscada",
      text: "Explora furtividade e terreno para causar dano rápido.",
    });
  }
  if (players.some((monkey) => monkey.energy < 35)) {
    options.push({
      id: "protectWounded",
      label: wounded ? "Proteger feridos" : "Poupar energia",
      text: "Diminui perdas e conserva quem está no limite.",
    });
  }
  if (hasTool) {
    options.push({
      id: "useTool",
      label: "Usar ferramenta",
      text: "Gasta uma ferramenta para virar a rodada.",
    });
  }
  if (charisma >= players.length * 5) {
    options.push({
      id: "negotiate",
      label: "Negociar rendição",
      text: "Tenta encerrar a luta com custo político menor.",
    });
  }
  if (combat.round > 1) {
    options.push({
      id: "focusLeader",
      label: "Focar líder inimigo",
      text: "Arriscado, mas pode quebrar a moral adversária.",
    });
  }

  return options;
}

function damageRandom(monkeys: ReturnType<typeof activeMonkeys>, amount: number): string[] {
  const notes: string[] = [];
  let remaining = amount;
  while (remaining > 0 && monkeys.some((monkey) => monkey.status !== "morto")) {
    const target = sample(monkeys.filter((monkey) => monkey.status !== "morto"));
    const hit = Math.min(target.hp, Math.max(1, Math.ceil(Math.random() * 3)));
    target.hp = clamp(target.hp - hit, 0, target.maxHp);
    target.energy = clamp(target.energy - hit * 4, 0, target.maxEnergy);
    updateMonkeyStatus(target);
    remaining -= hit;
    if (target.status === "morto") {
      notes.push(`${target.name} caiu morto.`);
    } else if (target.status === "ferido" || target.status === "inconsciente") {
      notes.push(`${target.name} ficou ${target.status}.`);
    }
  }
  return notes;
}

function finishCombat(
  state: GameState,
  combat: PendingCombat,
  winner: "player" | "enemy" | "none",
  reason: string,
): void {
  const report = state.workingReport;
  const area = getArea(state, combat.areaId);
  const attacker = getFaction(state, combat.attackerFactionId);
  const defender = getFaction(state, combat.defenderFactionId);
  const playerCombatants = combat.playerMonkeyIds.map((id) => getMonkey(state, id));
  const enemyCombatants = combat.enemyMonkeyIds.map((id) => getMonkey(state, id));
  const playerDead = playerCombatants.filter((monkey) => monkey.status === "morto");
  const playerInjured = playerCombatants.filter(
    (monkey) => monkey.status === "ferido" || monkey.status === "inconsciente",
  );
  const enemyDead = enemyCombatants.filter((monkey) => monkey.status === "morto");
  const playerWon =
    winner === "player" &&
    ((combat.playerSide === "attacker" && combat.attackerFactionId === state.playerFactionId) ||
      (combat.playerSide === "defender" && combat.defenderFactionId === state.playerFactionId));

  if (report) {
    report.confirmed.push(reason);
    if (playerDead.length > 0) {
      report.casualtySummary.push(`${playerDead.map((monkey) => monkey.name).join(", ")} morreram em combate.`);
    }
    if (playerInjured.length > 0) {
      report.casualtySummary.push(`${playerInjured.map((monkey) => monkey.name).join(", ")} ficaram feridos.`);
    }
    if (enemyDead.length > 0) {
      report.confirmed.push(`${enemyDead.length} rival(is) morreram na luta.`);
    }
  }

  playerDead.forEach((monkey) => {
    getFaction(state, monkey.factionId).deaths += 1;
  });
  enemyDead.forEach((monkey) => {
    getFaction(state, monkey.factionId).deaths += 1;
  });

  if (winner === "none") {
    changeRelation(state, combat.attackerFactionId, combat.defenderFactionId, -4);
    state.pendingCombat = null;
    return;
  }

  if (playerWon) {
    getFaction(state, state.playerFactionId).battlesWon += 1;
    if (combat.playerSide === "attacker") {
      area.ownerFactionId = state.playerFactionId;
    }
    const stolen = Math.min(defender.food.bananas, 4 + Math.floor(Math.random() * 4));
    defender.food.bananas -= stolen;
    getFaction(state, state.playerFactionId).food.bananas += stolen;
    if (report) {
      report.confirmed.push(`Vitória em ${area.name}. A tribo tomou ${stolen} banana(s).`);
    }
    changeRelation(state, attacker.id, defender.id, -20);
  } else {
    const playerFaction = getFaction(state, state.playerFactionId);
    const lost = Math.min(playerFaction.food.bananas, 2 + Math.floor(Math.random() * 3));
    playerFaction.food.bananas -= lost;
    if (combat.playerSide === "defender") {
      area.ownerFactionId = combat.attackerFactionId;
    }
    if (report) {
      report.confirmed.push(`Derrota em ${area.name}. A tribo perdeu ${lost} banana(s) na retirada.`);
    }
    changeRelation(state, attacker.id, defender.id, -14);
  }

  state.pendingCombat = null;
}

export function resolveCombatRound(
  state: GameState,
  tactic: CombatOption["id"],
): CombatRoundResult {
  const combat = state.pendingCombat;
  if (!combat) {
    return { state, finished: true };
  }

  const area = getArea(state, combat.areaId);
  const playerGroup = activeMonkeys(state, combat.playerMonkeyIds);
  const enemyGroup = activeMonkeys(state, combat.enemyMonkeyIds);

  if (playerGroup.length === 0 || enemyGroup.length === 0) {
    finishCombat(
      state,
      combat,
      playerGroup.length > enemyGroup.length ? "player" : "enemy",
      "O combate terminou porque um dos lados não tinha mais lutadores de pé.",
    );
    return { state, finished: true };
  }

  const playerStealth = playerGroup.reduce((sum, monkey) => sum + monkey.stealth, 0);
  const playerCharisma = playerGroup.reduce((sum, monkey) => sum + monkey.charisma, 0);
  const enemyMorale = enemyGroup.reduce((sum, monkey) => sum + monkey.morale, 0);

  if (tactic === "flee") {
    const escapeChance = clamp((playerStealth + area.stealthModifier * 4) / (enemyMorale / 3 + 20), 0.18, 0.78);
    if (roll(escapeChance)) {
      combat.log.push("O grupo escapou por rotas de cipó antes que a luta engolisse todos.");
      finishCombat(state, combat, "none", "Seus macacos fugiram do confronto e preservaram a maioria das vidas.");
      return { state, finished: true };
    }
    combat.log.push("A fuga falhou; os rivais fecharam a saída.");
  }

  if (tactic === "negotiate") {
    const chance = clamp((playerCharisma + Math.random() * 20) / (enemyMorale / 2 + 30), 0.12, 0.7);
    if (roll(chance)) {
      combat.log.push("A negociação conteve a fúria por tempo suficiente para uma trégua curta.");
      changeRelation(state, combat.attackerFactionId, combat.defenderFactionId, 5);
      finishCombat(state, combat, "none", "Uma rendição negociada encerrou o combate sem conquista de território.");
      return { state, finished: true };
    }
    combat.log.push("A tentativa de negociação foi recebida com gritos e pedras.");
  }

  let playerModifier = 1;
  let enemyModifier = 1;
  let playerDamageReduction = 0;

  if (tactic === "direct") {
    playerModifier += 0.25;
    enemyModifier += 0.08;
    combat.log.push("Seus macacos avançaram em ataque direto.");
  } else if (tactic === "defend") {
    playerModifier -= 0.08;
    playerDamageReduction += 3;
    combat.log.push("O grupo formou uma linha defensiva e esperou o erro rival.");
  } else if (tactic === "intimidate") {
    const pressure = playerCharisma + playerGroup.filter((monkey) => monkey.species === "Gorila" || monkey.species === "Mandril").length * 8;
    playerModifier += pressure > enemyMorale / 2 ? 0.22 : -0.05;
    enemyModifier -= pressure > enemyMorale / 2 ? 0.12 : 0;
    combat.log.push("Gritos, peito batido e ameaças fizeram parte dos rivais hesitar.");
  } else if (tactic === "ambush") {
    playerModifier += 0.18 + area.stealthModifier * 0.04;
    playerDamageReduction += area.stealthModifier > 0 ? 2 : 0;
    combat.log.push("O grupo usou cobertura e atacou pelos flancos.");
  } else if (tactic === "protectWounded") {
    playerModifier -= 0.1;
    playerDamageReduction += 5;
    combat.log.push("Os mais fortes cobriram os feridos e pouparam energia.");
  } else if (tactic === "focusLeader") {
    playerModifier += 0.18;
    enemyModifier += 0.12;
    const leader = enemyGroup.find((monkey) => monkey.isLeader);
    if (leader) {
      leader.hp = clamp(leader.hp - 3, 0, leader.maxHp);
      leader.morale = clamp(leader.morale - 12, 0, 100);
      updateMonkeyStatus(leader);
      combat.log.push(`${leader.name}, líder rival, foi pressionado diretamente.`);
    }
  } else if (tactic === "useTool") {
    const carrier = playerGroup.find((monkey) => monkey.inventory.length > 0);
    if (carrier) {
      const tool = carrier.inventory.shift();
      playerModifier += 0.32;
      playerDamageReduction += 2;
      combat.log.push(`${carrier.name} usou ${tool} para virar a rodada.`);
    } else {
      combat.log.push("Nenhuma ferramenta estava pronta no grupo.");
    }
  }

  const terrainBonus = area.combatModifier * (combat.playerSide === "defender" ? 1.2 : 0.7);
  const playerScore =
    (combatPower(playerGroup) + terrainBonus + Math.random() * 12) * playerModifier;
  const enemyScore =
    (combatPower(enemyGroup) + area.combatModifier + Math.random() * 12) * enemyModifier;

  const enemyDamage = Math.max(1, Math.floor(playerScore / 13));
  const playerDamage = Math.max(0, Math.floor(enemyScore / 14) - playerDamageReduction);
  const enemyNotes = damageRandom(enemyGroup, enemyDamage);
  const playerNotes = damageRandom(playerGroup, playerDamage);

  combat.log.push(
    `Rodada ${combat.round}: rivais sofreram ${enemyDamage} dano; seu grupo sofreu ${playerDamage} dano.`,
  );
  [...enemyNotes, ...playerNotes].forEach((note) => combat.log.push(note));

  const livingPlayers = livingMonkeys(playerGroup);
  const livingEnemies = livingMonkeys(enemyGroup);
  const playerRemaining = combatPower(livingPlayers);
  const enemyRemaining = combatPower(livingEnemies);

  if (livingEnemies.length === 0 || livingPlayers.length === 0 || combat.round >= combat.maxRounds) {
    const winner = livingPlayers.length > 0 && playerRemaining >= enemyRemaining ? "player" : "enemy";
    const reason =
      winner === "player"
        ? `Seus macacos venceram o combate em ${area.name}.`
        : `Os rivais venceram o combate em ${area.name}.`;
    finishCombat(state, combat, winner, reason);
    return { state, finished: true };
  }

  combat.round += 1;
  state.pendingCombat = combat;
  return { state, finished: false };
}
