import React from "react";

/**
 * Entete — identité du site, au-dessus de toute donnée.
 *
 * Le logo reprend le motif de l'hémicycle : trois rangs de sièges en arc.
 * Les six sièges du rang extérieur portent les quatre positions de vote —
 * plein, cerclé, estompé, gris — ce qui fait de la marque un résumé de ce que
 * le site montre, plutôt qu'un ornement.
 *
 * Dessiné en SVG plutôt qu'en image : quelques centaines d'octets, net à
 * toute échelle, et il hérite des couleurs du thème sans second fichier.
 */

/* Trois rangs, rayons croissants. Les positions sont calculées une fois ici
   plutôt que codées en dur, pour que la géométrie reste modifiable. */
const RANGS = [
  { r: 13, n: 5, decalage: 0.5 },
  { r: 20, n: 7, decalage: 0.5 },
  { r: 27, n: 9, decalage: 0.5 },
];

/* Position de vote de chaque siège du rang extérieur, dans l'ordre.
   `null` = siège vide, qui reste gris. */
const POSITIONS = [
  "contre", "contre", "abstention", "pour", "pour", "pour", "pour", "absent", "absent",
];

function sieges() {
  const out = [];
  RANGS.forEach((rang, iRang) => {
    for (let i = 0; i < rang.n; i++) {
      const t = (i + rang.decalage) / rang.n;
      const theta = Math.PI * (1 - t);
      out.push({
        cle: `${iRang}-${i}`,
        x: 32 + rang.r * Math.cos(theta),
        y: 30 - rang.r * Math.sin(theta),
        position: iRang === RANGS.length - 1 ? POSITIONS[i] : null,
      });
    }
  });
  return out;
}

const GEOMETRIE = sieges();

export default function Entete() {
  return (
    <header className="site-entete">
      <a className="marque" href="/" aria-label="kivotkoi — accueil">
        <svg className="logo" viewBox="0 0 64 36" role="img"
             aria-label="Hémicycle stylisé : trois rangs de sièges en arc">
          {GEOMETRIE.map((s) => {
            const commun = { key: s.cle, cx: s.x, cy: s.y, r: 2.4 };
            if (s.position === "contre") {
              return <circle {...commun} fill="none" stroke="var(--contre)" strokeWidth="1.4" />;
            }
            if (s.position === "pour") return <circle {...commun} fill="var(--pour)" />;
            if (s.position === "abstention") {
              return <circle {...commun} fill="var(--abst)" opacity="0.45" />;
            }
            return <circle {...commun} fill="var(--absent)" />;
          })}
          {/* La tribune, trait sous l'arc. */}
          <path d="M 24 33.5 L 40 33.5" stroke="var(--line)" strokeWidth="1.6"
                strokeLinecap="round" />
        </svg>

        {/* Le nom se lit « qui vote quoi ». Les trois syllabes sont marquées
            par la graisse plutôt que par un séparateur : la coupure reste
            perceptible sans mutiler le mot, qui doit s'écrire et se retenir
            d'un bloc. */}
        <span className="mot">
          <span className="mot-nom disp" aria-label="kivotkoi">
            <span aria-hidden="true">ki</span>
            <span aria-hidden="true" className="pivot">vot</span>
            <span aria-hidden="true">koi</span>
          </span>
          <span className="mot-sous">Qui vote quoi à l'Assemblée nationale</span>
        </span>
      </a>

      <p className="site-baseline">
        Chaque scrutin public, la position de chaque député, à partir de l'open
        data officiel. Aucun commentaire, aucun résumé&nbsp;: les chiffres et
        leurs sources.
      </p>
    </header>
  );
}
