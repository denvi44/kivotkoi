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

/**
 * Tricolore.
 *
 * Le bleu officiel (#000091) tombe à 1,26:1 sur le fond d'encre : ses sièges
 * seraient invisibles. Éclairci à 3,07:1, seuil de WCAG 1.4.11, teinte
 * conservée. Le rouge (#E1000F) passe tel quel à 3,77.
 *
 * Disposition RADIALE : un rang par couleur, du bleu au centre au rouge en
 * périphérie. Une répartition en bandes verticales aurait suivi l'ordre du
 * drapeau, mais placé le bleu du côté de la gauche parlementaire — à rebours
 * de la convention partisane, sur un site qui range précisément les groupes
 * de gauche à droite. Le radial n'a pas d'orientation, donc pas d'ambiguïté.
 */
const BLEU = "#4141FF";
const BLANC = "#F4F1EA";
const ROUGE = "#E1000F";

/** Une couleur par rang, de l'intérieur vers l'extérieur. */
const COULEURS = [BLEU, BLANC, ROUGE];

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
        couleur: COULEURS[iRang] ?? BLANC,
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
             aria-label="Hémicycle stylisé aux couleurs du drapeau français">
          {GEOMETRIE.map((s) => (
            <circle key={s.cle} cx={s.x} cy={s.y} r="2.4" fill={s.couleur} />
          ))}
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
