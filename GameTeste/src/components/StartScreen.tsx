import { useState } from "react";
import { ASSETS } from "../game/assets";
import { SPECIES_PROFILES } from "../game/constants";
import type { Species } from "../game/types";

interface Props {
  canContinue: boolean;
  onContinue: () => void;
  onStart: (leaderName: string, leaderSpecies: Species, factionName: string) => void;
}

const species = Object.keys(SPECIES_PROFILES) as Species[];

export default function StartScreen({ canContinue, onContinue, onStart }: Props) {
  const [leaderName, setLeaderName] = useState("Aru");
  const [factionName, setFactionName] = useState("");
  const [leaderSpecies, setLeaderSpecies] = useState<Species>("Chimpanzé");

  return (
    <main className="start-screen">
      <section className="start-panel">
        <div className="start-hero">
          <div>
            <p className="eyebrow">jogo de tabuleiro narrativo</p>
            <h1>Ilha dos Macacos</h1>
            <p className="start-copy">
              Comande uma facção de macacos por até 100 dias. Leia relatórios, distribua funções,
              dispute comida e sobreviva às outras tribos da ilha.
            </p>
          </div>
          <div className="start-art" aria-hidden="true">
            <img src={ASSETS.monkeys[0]} alt="" />
            <img src={ASSETS.factions.player} alt="" />
            <img src={ASSETS.monkeys[5]} alt="" />
          </div>
        </div>

        <div className="start-grid">
          <label>
            Nome do líder
            <input value={leaderName} onChange={(event) => setLeaderName(event.target.value)} />
          </label>
          <label>
            Nome da facção
            <input
              placeholder="opcional"
              value={factionName}
              onChange={(event) => setFactionName(event.target.value)}
            />
          </label>
          <label className="wide-field">
            Espécie do líder
            <select
              value={leaderSpecies}
              onChange={(event) => setLeaderSpecies(event.target.value as Species)}
            >
              {species.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="species-card">
          <strong>{leaderSpecies}</strong>
          <span>{SPECIES_PROFILES[leaderSpecies].text}</span>
        </div>

        <div className="start-actions">
          <button className="primary-button" onClick={() => onStart(leaderName, leaderSpecies, factionName)}>
            Iniciar campanha
          </button>
          {canContinue && (
            <button className="ghost-button" onClick={onContinue}>
              Continuar jogo salvo
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
