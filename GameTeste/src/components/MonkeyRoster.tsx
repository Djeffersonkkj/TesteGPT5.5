import { useMemo, useState } from "react";
import { ROLES } from "../game/constants";
import { assignMonkeyRole, assignRoleToMany } from "../game/actions";
import type { GameState, Monkey, Role } from "../game/types";

interface Props {
  state: GameState;
  onChange: (state: GameState) => void;
  onClearOrder: (monkeyId: string) => void;
  onSetPersistentRole: (monkeyId: string, role: Role | null) => void;
}

type StatusFilter = "todos" | "disponíveis" | "feridos" | "famintos" | "designados" | "sem ordem";
type RoleFilter = "todas" | "sem função" | Role;

function isTroubled(monkey: Monkey): boolean {
  return monkey.status === "ferido" || monkey.status === "faminto" || monkey.status === "exausto";
}

function matchesStatus(monkey: Monkey, filter: StatusFilter): boolean {
  if (filter === "todos") {
    return true;
  }
  if (filter === "disponíveis") {
    return monkey.status === "normal" || monkey.status === "ferido";
  }
  if (filter === "feridos") {
    return monkey.status === "ferido" || monkey.status === "inconsciente";
  }
  if (filter === "famintos") {
    return monkey.status === "faminto" || monkey.hunger > 65;
  }
  if (filter === "designados") {
    return Boolean(monkey.plannedAction);
  }
  return !monkey.plannedAction;
}

function roleLabel(monkey: Monkey): string {
  if (monkey.role) {
    return monkey.role;
  }
  return "Sem ordem";
}

export default function MonkeyRoster({
  state,
  onChange,
  onClearOrder,
  onSetPersistentRole,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("todas");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState<Role>("Coletor");

  const monkeys = useMemo(
    () =>
      state.monkeys
        .filter((monkey) => monkey.factionId === state.playerFactionId && monkey.status !== "morto")
        .sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.name.localeCompare(b.name)),
    [state],
  );

  const filtered = monkeys.filter((monkey) => {
    const roleMatch =
      roleFilter === "todas" ||
      (roleFilter === "sem função" ? !monkey.role : monkey.role === roleFilter);
    return roleMatch && matchesStatus(monkey, statusFilter);
  });

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const assignRole = (monkey: Monkey, role: Role) => {
    let next = assignMonkeyRole(state, monkey.id, role);
    if (monkey.persistentRole) {
      next = assignMonkeyRole(next, monkey.id, role);
      next.monkeys.find((item) => item.id === monkey.id)!.persistentRole = role;
    }
    onChange(next);
  };

  const applyBulk = () => {
    onChange(assignRoleToMany(state, selectedIds, bulkRole));
  };

  const fixBulk = () => {
    let next = assignRoleToMany(state, selectedIds, bulkRole);
    selectedIds.forEach((id) => {
      const monkey = next.monkeys.find((item) => item.id === id);
      if (monkey) {
        monkey.persistentRole = bulkRole;
      }
    });
    onChange(next);
  };

  const clearBulk = () => {
    let next = state;
    selectedIds.forEach((id) => {
      next = {
        ...next,
        monkeys: next.monkeys.map((monkey) =>
          monkey.id === id ? { ...monkey, role: null, plannedAction: null } : monkey,
        ),
      };
    });
    onChange(next);
  };

  return (
    <section className="panel roster-panel">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">funções diárias</p>
          <h2>Macacos</h2>
        </div>
        <span className="mini-help">{filtered.length}/{monkeys.length}</span>
      </div>

      <div className="toolbar">
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="todos">Todos</option>
            <option value="disponíveis">Disponíveis</option>
            <option value="feridos">Feridos</option>
            <option value="famintos">Famintos</option>
            <option value="designados">Designados</option>
            <option value="sem ordem">Sem ordem</option>
          </select>
        </label>
        <label>
          Função
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
            <option value="todas">Todas</option>
            <option value="sem função">Sem função</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="bulk-row">
        <select value={bulkRole} onChange={(event) => setBulkRole(event.target.value as Role)}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button className="ghost-button" disabled={selectedIds.length === 0} onClick={applyBulk}>
          Aplicar
        </button>
        <button className="ghost-button" disabled={selectedIds.length === 0} onClick={fixBulk}>
          Fixar
        </button>
        <button className="ghost-button" disabled={selectedIds.length === 0} onClick={clearBulk}>
          Limpar
        </button>
      </div>

      <div className="monkey-grid">
        {filtered.map((monkey) => {
          const assigned = Boolean(monkey.plannedAction);
          return (
            <article
              className={`monkey-card ${assigned ? "assigned" : "unassigned"} ${
                isTroubled(monkey) ? "troubled" : ""
              } ${monkey.persistentRole ? "persistent" : ""}`}
              key={monkey.id}
            >
              <div className="monkey-card-head">
                <label className="check-label">
                  <input
                    checked={selectedIds.includes(monkey.id)}
                    type="checkbox"
                    onChange={() => toggleSelected(monkey.id)}
                  />
                  <span>
                    <strong>{monkey.name}</strong>
                    {monkey.isLeader && <b className="leader-mark">Líder</b>}
                  </span>
                </label>
                <span className="assignment-pill">{assigned ? "Designado" : "Sem ordem"}</span>
              </div>

              <div className="monkey-meta">
                <span>{monkey.species}</span>
                <span>{monkey.status}</span>
                <span>{roleLabel(monkey)}</span>
              </div>

              <div className="bar-list">
                <div>
                  <span>HP</span>
                  <meter min={0} max={monkey.maxHp} value={monkey.hp} />
                  <b>{Math.ceil(monkey.hp)}</b>
                </div>
                <div>
                  <span>Energia</span>
                  <meter min={0} max={monkey.maxEnergy} value={monkey.energy} />
                  <b>{Math.ceil(monkey.energy)}</b>
                </div>
                <div>
                  <span>Moral</span>
                  <meter min={0} max={100} value={monkey.morale} />
                  <b>{Math.ceil(monkey.morale)}</b>
                </div>
                <div>
                  <span>Lealdade</span>
                  <meter min={0} max={100} value={monkey.loyalty} />
                  <b>{Math.ceil(monkey.loyalty)}</b>
                </div>
              </div>

              <div className="card-controls">
                <select value={monkey.role ?? ""} onChange={(event) => assignRole(monkey, event.target.value as Role)}>
                  <option value="" disabled>
                    Designar função
                  </option>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <label className="tiny-toggle">
                  <input
                    checked={Boolean(monkey.persistentRole)}
                    type="checkbox"
                    onChange={(event) =>
                      onSetPersistentRole(monkey.id, event.target.checked ? monkey.role ?? "Descansando" : null)
                    }
                  />
                  Manter
                </label>
                <button className="icon-button" title="Limpar ordem" onClick={() => onClearOrder(monkey.id)}>
                  ×
                </button>
              </div>

              <span className="location-line">
                {state.areas.find((area) => area.id === monkey.locationId)?.shortName ?? "?"}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
