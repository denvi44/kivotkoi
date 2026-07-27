import React, { useMemo, useRef } from "react";
import {
  MOIS, JOURS, grilleMois, moisVoisin, libelleJour, decouper,
} from "./dates.js";

/**
 * Calendrier — navigation par date plutôt que par défilement.
 *
 * Avec plus de cinq mille scrutins, une liste chronologique impose de faire
 * défiler pour se repérer dans le temps. Le calendrier rend la structure
 * temporelle immédiatement lisible : on voit d'un coup d'œil les jours de
 * séance, les semaines chargées et les suspensions.
 *
 * Accessibilité : seules les cases portant des scrutins sont des boutons.
 * Rendre les 42 cases focusables imposerait 42 arrêts de tabulation par mois,
 * dont l'essentiel sans contenu. Les flèches du clavier parcourent la grille
 * — c'est le motif attendu d'un composant `grid` (WAI-ARIA).
 */
export default function Calendrier({
  parJour, moisDisponibles, max, annee, mois, jourActif,
  onChoisirJour, onChangerMois,
}) {
  const grille = useMemo(() => grilleMois(annee, mois, parJour), [annee, mois, parJour]);
  const grilleRef = useRef(null);

  const precedent = moisVoisin(annee, mois, moisDisponibles, -1);
  const suivant = moisVoisin(annee, mois, moisDisponibles, 1);

  /* Déplacement aux flèches entre les jours qui portent des scrutins : sauter
     les cases vides évite une douzaine d'appuis pour rien. */
  const surTouche = (e) => {
    const pas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!pas) return;
    e.preventDefault();

    const cases = grille.flat().filter((c) => c.scrutins.length > 0);
    const i = cases.findIndex((c) => c.iso === jourActif);
    if (i === -1) { if (cases[0]) onChoisirJour(cases[0].iso); return; }

    const vise = Math.abs(pas) === 1 ? i + pas : i + Math.sign(pas);
    if (vise >= 0 && vise < cases.length) {
      onChoisirJour(cases[vise].iso);
      grilleRef.current
        ?.querySelector(`[data-iso="${cases[vise].iso}"]`)?.focus();
    }
  };

  return (
    <div className="cal">
      <div className="cal-tete">
        <button className="cal-nav" onClick={() => precedent && onChangerMois(precedent)}
                disabled={!precedent}
                aria-label={precedent
                  ? `Mois précédent avec scrutins : ${MOIS[precedent.mois]} ${precedent.annee}`
                  : "Aucun mois antérieur"}>
          ‹
        </button>
        <span className="cal-mois" aria-live="polite">
          {MOIS[mois]} <span className="mono">{annee}</span>
        </span>
        <button className="cal-nav" onClick={() => suivant && onChangerMois(suivant)}
                disabled={!suivant}
                aria-label={suivant
                  ? `Mois suivant avec scrutins : ${MOIS[suivant.mois]} ${suivant.annee}`
                  : "Aucun mois postérieur"}>
          ›
        </button>
      </div>

      <div className="cal-grille" role="grid" ref={grilleRef}
           aria-label={`Jours de scrutin, ${MOIS[mois]} ${annee}`}
           onKeyDown={surTouche}>
        <div className="cal-entetes" role="row">
          {JOURS.map((j, i) => (
            <span key={i} role="columnheader" className="cal-jour-nom" aria-hidden="true">{j}</span>
          ))}
        </div>

        {grille.map((semaine, s) => (
          <div className="cal-semaine" role="row" key={s}>
            {semaine.map((c) => {
              const n = c.scrutins.length;
              const actif = c.iso === jourActif;

              if (n === 0) {
                return (
                  <span key={c.iso} role="gridcell" className="cal-case vide"
                        data-hors={c.dansLeMois ? "0" : "1"} aria-hidden="true">
                    {c.jour}
                  </span>
                );
              }

              /* Intensité graduée : une semaine de session se distingue d'un
                 vote isolé sans avoir à lire les chiffres. */
              const intensite = max > 1 ? 0.28 + 0.72 * Math.min(1, n / max) : 1;

              return (
                <button key={c.iso} role="gridcell" className="cal-case pleine"
                        data-iso={c.iso}
                        data-hors={c.dansLeMois ? "0" : "1"}
                        data-on={actif ? "1" : "0"}
                        aria-selected={actif}
                        tabIndex={actif ? 0 : -1}
                        aria-label={libelleJour(c.iso, n)}
                        onClick={() => onChoisirJour(c.iso)}>
                  <span className="cal-num">{c.jour}</span>
                  <span className="cal-pastille" style={{ opacity: intensite }} />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="cal-legende mono">
        {jourActif
          ? (() => {
              const { jour, mois: m } = decouper(jourActif);
              const n = parJour.get(jourActif)?.length ?? 0;
              return `${jour} ${MOIS[m]} · ${n} scrutin${n > 1 ? "s" : ""}`;
            })()
          : "choisir un jour"}
      </p>
    </div>
  );
}
