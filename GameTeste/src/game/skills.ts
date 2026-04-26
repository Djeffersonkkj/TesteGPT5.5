import { SPECIES_PROFILES } from "./constants";
import type {
  DailyReport,
  GameState,
  GroupActionType,
  Monkey,
  MonkeySkill,
  MonkeySpecies,
  MonkeyStats,
  PendingCombat,
} from "./types";
import { clamp, cloneState, livingFactionMonkeys, roll, updateMonkeyStatus } from "./utils";

export type EffectiveMonkeyStats = MonkeyStats;

export type SkillActionContext =
  | GroupActionType
  | "defend"
  | "flee"
  | "focusLeader"
  | "intimidate"
  | "protect"
  | "surrender"
  | "useTool"
  | "saveEnergy"
  | "ambush"
  | "desertion";

export interface SkillContext {
  action?: SkillActionContext;
  combatRound?: number;
}

type InitialMonkeyStats = Omit<MonkeyStats, "morale">;

const percent = (value: number, amount: number) => value * (1 + amount / 100);

function roundStat(stat: keyof MonkeyStats, value: number): number {
  if (stat === "foodConsumption") {
    return Math.round(value * 10) / 10;
  }
  return Math.max(1, Math.round(value));
}

function applyEffects(stats: MonkeyStats, effects: MonkeySkill["effects"], condition?: string): MonkeyStats {
  const next = { ...stats };
  effects
    .filter((effect) => effect.stat && (!condition || effect.condition === condition))
    .forEach((effect) => {
      const stat = effect.stat!;
      const current = next[stat];
      const value = effect.modifierType === "percent" ? percent(current, effect.value) : current + effect.value;
      next[stat] = roundStat(stat, value);
    });
  return next;
}

export function getDefaultSkillsForSpecies(species: MonkeySpecies): MonkeySkill[] {
  const skills: Record<MonkeySpecies, MonkeySkill[]> = {
    Gorila: [
      {
        id: "gorilla-stone-chest",
        name: "Peito de Pedra",
        description: "+25% HP máximo e +15% defesa.",
        trigger: "passive",
        effects: [
          { stat: "maxHp", modifierType: "percent", value: 25, condition: "base" },
          { stat: "defense", modifierType: "percent", value: 15, condition: "base" },
        ],
      },
      {
        id: "gorilla-natural-guard",
        name: "Guarda Natural",
        description: "Como Guarda ou Guerreiro, reduz em 15% o dano recebido por aliados feridos na mesma área.",
        trigger: "support",
        effects: [{ modifierType: "percent", value: -15, condition: "wounded-ally-damage" }],
      },
      {
        id: "gorilla-heavy-hunger",
        name: "Fome Pesada",
        description: "Consome +1 banana por dia.",
        trigger: "food",
        effects: [{ stat: "foodConsumption", modifierType: "flat", value: 1, condition: "base" }],
      },
    ],
    Chimpanzé: [
      {
        id: "chimp-tactical-mind",
        name: "Mente Tática",
        description: "Aliados na mesma ação recebem +5% de chance de sucesso.",
        trigger: "support",
        effects: [{ modifierType: "percent", value: 5, condition: "group-action" }],
      },
      {
        id: "chimp-command-voice",
        name: "Voz de Comando",
        description: "Com moral acima de 60, aumenta em +3 a moral de até 3 aliados da mesma área no fim do dia.",
        trigger: "daily",
        effects: [{ stat: "morale", modifierType: "flat", value: 3, condition: "daily-allies" }],
      },
      {
        id: "chimp-natural-diplomat",
        name: "Diplomata Natural",
        description: "+15% em negociar, recrutar ou evitar deserção.",
        trigger: "support",
        effects: [{ stat: "charisma", modifierType: "percent", value: 15, condition: "diplomacy" }],
      },
    ],
    "Macaco-prego": [
      {
        id: "capuchin-skilled-hands",
        name: "Mãos Habilidosas",
        description: "+20% em ações de criar ferramentas.",
        trigger: "support",
        effects: [{ stat: "intelligence", modifierType: "percent", value: 20, condition: "craft" }],
      },
      {
        id: "capuchin-tool-user",
        name: "Usar Ferramenta",
        description: "Ferramentas ofensivas ou defensivas recebem +15% de eficiência.",
        trigger: "combat",
        effects: [{ modifierType: "percent", value: 15, condition: "tool-efficiency" }],
      },
      {
        id: "capuchin-small-smart",
        name: "Pequeno e Esperto",
        description: "+10% furtividade e inteligência, mas -10% HP máximo.",
        trigger: "passive",
        effects: [
          { stat: "stealth", modifierType: "percent", value: 10, condition: "base" },
          { stat: "intelligence", modifierType: "percent", value: 10, condition: "base" },
          { stat: "maxHp", modifierType: "percent", value: -10, condition: "base" },
        ],
      },
    ],
    Mandril: [
      {
        id: "mandrill-color-fury",
        name: "Fúria Colorida",
        description: "+20% ataque na primeira rodada de combate.",
        trigger: "combat",
        effects: [{ stat: "attack", modifierType: "percent", value: 20, condition: "first-round" }],
      },
      {
        id: "mandrill-intimidation",
        name: "Intimidação",
        description: "+20% em intimidar e pode reduzir a moral inimiga se vencer pressão.",
        trigger: "combat",
        effects: [{ stat: "charisma", modifierType: "percent", value: 20, condition: "intimidate" }],
      },
      {
        id: "mandrill-unstable-temper",
        name: "Temperamento Instável",
        description: "Se a moral estiver abaixo de 35, tem 8% de chance diária de perder um pouco de lealdade.",
        trigger: "daily",
        effects: [{ stat: "morale", modifierType: "flat", value: -3, condition: "low-morale-daily" }],
      },
    ],
    Gibão: [
      {
        id: "gibbon-canopy-movement",
        name: "Movimento pelas Copas",
        description: "+20% em exploração, movimentação e fuga.",
        trigger: "exploration",
        effects: [{ stat: "stealth", modifierType: "percent", value: 20, condition: "exploration" }],
      },
      {
        id: "gibbon-hard-to-hit",
        name: "Difícil de Acertar",
        description: "15% de chance de evitar dano em combate.",
        trigger: "combat",
        effects: [{ modifierType: "percent", value: -100, condition: "avoid-damage" }],
      },
      {
        id: "gibbon-silent-scout",
        name: "Batedor Silencioso",
        description: "Ao explorar, aumenta a chance de gerar informações confirmadas em vez de rumores.",
        trigger: "exploration",
        effects: [{ modifierType: "percent", value: 15, condition: "confirmed-info" }],
      },
    ],
  };

  return skills[species].map((skill) => ({
    ...skill,
    effects: skill.effects.map((effect) => ({ ...effect })),
  }));
}

export function getInitialStatsForSpecies(species: MonkeySpecies, isLeader = false): InitialMonkeyStats {
  const profile = SPECIES_PROFILES[species];
  const leaderHpBonus = isLeader ? 2 : 0;
  const leaderStatBonus = isLeader ? 1 : 0;
  const base: MonkeyStats = {
    maxHp: profile.maxHp + leaderHpBonus,
    attack: profile.attack + leaderStatBonus,
    defense: profile.defense + leaderStatBonus,
    stealth: profile.stealth,
    intelligence: profile.intelligence + leaderStatBonus,
    charisma: profile.charisma + (isLeader ? 2 : 0),
    morale: 0,
    foodConsumption: profile.foodConsumption,
  };
  const adjusted = getDefaultSkillsForSpecies(species).reduce(
    (stats, skill) => applyEffects(stats, skill.effects, "base"),
    base,
  );
  const { morale: _morale, ...initial } = adjusted;
  return initial;
}

export function getMonkeyEffectiveStats(monkey: Monkey, context: SkillContext = {}): EffectiveMonkeyStats {
  let stats: MonkeyStats = {
    maxHp: monkey.maxHp,
    attack: monkey.attack,
    defense: monkey.defense,
    stealth: monkey.stealth,
    intelligence: monkey.intelligence,
    charisma: monkey.charisma,
    morale: monkey.morale,
    foodConsumption: monkey.foodConsumption,
  };

  const skills = monkey.skills ?? getDefaultSkillsForSpecies(monkey.species);

  if (context.combatRound === 1 && context.action === "attack") {
    stats = applyEffects(
      stats,
      skills.flatMap((skill) => skill.effects),
      "first-round",
    );
  }
  if (context.action === "intimidate") {
    stats = applyEffects(
      stats,
      skills.flatMap((skill) => skill.effects),
      "intimidate",
    );
  }
  if (context.action === "craft") {
    stats = applyEffects(
      stats,
      skills.flatMap((skill) => skill.effects),
      "craft",
    );
  }
  if (context.action === "negotiate" || context.action === "recruit" || context.action === "desertion") {
    stats = applyEffects(
      stats,
      skills.flatMap((skill) => skill.effects),
      "diplomacy",
    );
  }
  if (context.action === "explore" || context.action === "steal" || context.action === "flee" || context.action === "ambush") {
    stats = applyEffects(
      stats,
      skills.flatMap((skill) => skill.effects),
      "exploration",
    );
  }

  return stats;
}

export function hasSkill(monkey: Monkey, skillId: string): boolean {
  return (monkey.skills ?? []).some((skill) => skill.id === skillId);
}

export function getGroupActionSkillMultiplier(members: Monkey[], actionType: GroupActionType): number {
  const living = members.filter((monkey) => monkey.status !== "morto" && monkey.hp > 0);
  let bonus = 0;

  if (living.some((monkey) => hasSkill(monkey, "chimp-tactical-mind"))) {
    bonus += 0.05;
  }
  if (actionType === "craft" && living.some((monkey) => hasSkill(monkey, "capuchin-skilled-hands"))) {
    bonus += 0.2;
  }
  if (
    (actionType === "negotiate" || actionType === "recruit") &&
    living.some((monkey) => hasSkill(monkey, "chimp-natural-diplomat"))
  ) {
    bonus += 0.15;
  }
  if (
    (actionType === "explore" || actionType === "steal") &&
    living.some((monkey) => hasSkill(monkey, "gibbon-canopy-movement"))
  ) {
    bonus += actionType === "explore" ? 0.2 : 0.1;
  }

  return 1 + Math.min(0.25, bonus);
}

export function getCombatTeamSupportBonus(participants: Monkey[], factionId: string): number {
  return participants.some(
    (monkey) =>
      monkey.factionId === factionId &&
      monkey.status !== "morto" &&
      monkey.hp > 0 &&
      hasSkill(monkey, "chimp-tactical-mind"),
  )
    ? 0.05
    : 0;
}

export function getToolEfficiencyMultiplier(monkey: Monkey): number {
  return hasSkill(monkey, "capuchin-tool-user") ? 1.15 : 1;
}

export function getGuardDamageReduction(target: Monkey, participants: Monkey[]): number {
  const wounded = target.status === "ferido" || target.status === "inconsciente" || target.hp < target.maxHp * 0.5;
  if (!wounded) {
    return 0;
  }

  const protectedByGorilla = participants.some(
    (monkey) =>
      monkey.id !== target.id &&
      monkey.factionId === target.factionId &&
      monkey.locationId === target.locationId &&
      monkey.hp > 0 &&
      monkey.status !== "morto" &&
      (monkey.role === "Guarda" || monkey.role === "Guerreiro") &&
      hasSkill(monkey, "gorilla-natural-guard"),
  );

  return protectedByGorilla ? 0.15 : 0;
}

export function shouldAvoidDamage(monkey: Monkey): boolean {
  return hasSkill(monkey, "gibbon-hard-to-hit") && roll(0.15);
}

export function getFleeSkillBonus(monkeys: Monkey[]): number {
  const hasGibbon = monkeys.some((monkey) => hasSkill(monkey, "gibbon-canopy-movement"));
  const hasChimp = monkeys.some((monkey) => hasSkill(monkey, "chimp-tactical-mind"));
  return Math.min(0.25, (hasGibbon ? 0.12 : 0) + (hasChimp ? 0.05 : 0));
}

export function hasSilentScout(monkeys: Monkey[]): boolean {
  return monkeys.some((monkey) => hasSkill(monkey, "gibbon-silent-scout"));
}

export function applyCombatSkillModifiers(combatState: PendingCombat, participants: Monkey[]): PendingCombat {
  const chimpSupport = getCombatTeamSupportBonus(participants, combatState.playerSide === "attacker" ? combatState.attackerFactionId : combatState.defenderFactionId);
  if (chimpSupport <= 0 || combatState.enemyMorale === undefined) {
    return combatState;
  }

  return {
    ...combatState,
    enemyMorale: clamp(combatState.enemyMorale - Math.round(chimpSupport * 10), 0, 100),
  };
}

export function applyDailySkillEffects(gameState: GameState, report?: DailyReport): GameState {
  const state = cloneState(gameState);
  const boostedToday = new Set<string>();

  state.factions.forEach((faction) => {
    const living = livingFactionMonkeys(state, faction.id);
    living
      .filter((monkey) => hasSkill(monkey, "chimp-command-voice") && monkey.morale > 60)
      .forEach((chimp) => {
        const allies = living
          .filter(
            (ally) =>
              ally.id !== chimp.id &&
              ally.locationId === chimp.locationId &&
              !boostedToday.has(ally.id) &&
              ally.status !== "morto",
          )
          .sort((a, b) => a.morale - b.morale)
          .slice(0, 3);

        allies.forEach((ally) => {
          ally.morale = clamp(ally.morale + 3, 0, 100);
          boostedToday.add(ally.id);
          updateMonkeyStatus(ally);
        });

        if (faction.id === state.playerFactionId && allies.length > 0) {
          report?.confirmed.push(`${chimp.name} usou Voz de Comando e elevou a moral de ${allies.length} aliado(s).`);
        }
      });

    living
      .filter((monkey) => hasSkill(monkey, "mandrill-unstable-temper") && monkey.morale < 35)
      .forEach((mandrill) => {
        if (!roll(0.08)) {
          return;
        }
        mandrill.loyalty = clamp(mandrill.loyalty - 3, 0, 100);
        mandrill.morale = clamp(mandrill.morale - 1, 0, 100);
        updateMonkeyStatus(mandrill);
        if (faction.id === state.playerFactionId) {
          report?.suspicions.push(`${mandrill.name} teve um atrito menor por Temperamento Instável.`);
        }
      });
  });

  return state;
}
