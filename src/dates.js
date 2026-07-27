/**
 * dates.js — logique du calendrier des scrutins.
 *
 * Isolé de tout composant pour être testable : les calculs de calendrier sont
 * un nid à erreurs d'un jour, et un décalage se voit mal à l'écran alors qu'il
 * saute aux yeux dans une assertion.
 *
 * Les dates sont manipulées comme des chaînes `AAAA-MM-JJ`, jamais comme des
 * objets `Date`. Un `new Date("2026-07-21")` est interprété en UTC alors qu'un
 * `new Date(2026, 6, 21)` l'est en heure locale : mélanger les deux décale les
 * scrutins d'un jour pour tout visiteur à l'ouest de Greenwich.
 */

export const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Lundi en tête : convention française, contrairement au dimanche de `getDay`. */
export const JOURS = ["L", "M", "M", "J", "V", "S", "D"];
export const JOURS_LONGS = [
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
];

export const cleMois = (annee, mois) => `${annee}-${String(mois + 1).padStart(2, "0")}`;
export const cleJour = (annee, mois, jour) =>
  `${cleMois(annee, mois)}-${String(jour).padStart(2, "0")}`;

/** Découpe une date `AAAA-MM-JJ` sans passer par `Date`. */
export function decouper(iso) {
  const [a, m, j] = String(iso).split("-").map(Number);
  return { annee: a, mois: m - 1, jour: j };
}

/** Jour de la semaine, 0 = lundi. Algorithme de Sakamoto, sans objet `Date`. */
export function jourSemaine(annee, mois, jour) {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let a = annee;
  if (mois < 2) a -= 1;
  const dimanche0 = (a + Math.floor(a / 4) - Math.floor(a / 100)
    + Math.floor(a / 400) + t[mois] + jour) % 7;
  return (dimanche0 + 6) % 7; // ramène lundi à 0
}

export function joursDansMois(annee, mois) {
  const n = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois];
  const bissextile = (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
  return mois === 1 && bissextile ? 29 : n;
}

/**
 * Regroupe les scrutins par jour et par mois.
 *
 * @param {Array<{numero:number, date:string}>} scrutins
 * @returns {{parJour:Map<string,Array>, moisDisponibles:string[], max:number}}
 *          `moisDisponibles` est trié du plus récent au plus ancien, `max` sert
 *          à graduer l'intensité visuelle des jours chargés.
 */
export function grouper(scrutins) {
  const parJour = new Map();
  const mois = new Set();

  for (const s of scrutins ?? []) {
    if (typeof s?.date !== "string" || s.date.length < 10) continue;
    const jour = s.date.slice(0, 10);
    if (!parJour.has(jour)) parJour.set(jour, []);
    parJour.get(jour).push(s);
    mois.add(jour.slice(0, 7));
  }

  /* Du plus récent au plus ancien : on arrive sur un site d'actualité
     parlementaire pour voir ce qui vient de se passer. */
  for (const l of parJour.values()) l.sort((a, b) => b.numero - a.numero);

  let max = 0;
  for (const l of parJour.values()) max = Math.max(max, l.length);

  return {
    parJour,
    moisDisponibles: [...mois].sort().reverse(),
    max,
  };
}

/**
 * Grille d'un mois : six semaines de sept cases, jours débordants compris pour
 * que la grille garde une hauteur constante — sans quoi le contenu situé
 * dessous sautille au changement de mois.
 *
 * @returns {Array<Array<{iso:string, jour:number, dansLeMois:boolean, scrutins:Array}>>}
 */
export function grilleMois(annee, mois, parJour) {
  const decalage = jourSemaine(annee, mois, 1);
  const nbJours = joursDansMois(annee, mois);

  const precedentMois = mois === 0 ? 11 : mois - 1;
  const precedentAnnee = mois === 0 ? annee - 1 : annee;
  const nbPrecedent = joursDansMois(precedentAnnee, precedentMois);

  const suivantMois = mois === 11 ? 0 : mois + 1;
  const suivantAnnee = mois === 11 ? annee + 1 : annee;

  const cases = [];
  for (let i = 0; i < decalage; i++) {
    const j = nbPrecedent - decalage + i + 1;
    cases.push({ annee: precedentAnnee, mois: precedentMois, jour: j, dansLeMois: false });
  }
  for (let j = 1; j <= nbJours; j++) {
    cases.push({ annee, mois, jour: j, dansLeMois: true });
  }
  let j = 1;
  while (cases.length < 42) {
    cases.push({ annee: suivantAnnee, mois: suivantMois, jour: j++, dansLeMois: false });
  }

  const semaines = [];
  for (let s = 0; s < 6; s++) {
    semaines.push(cases.slice(s * 7, s * 7 + 7).map((c) => {
      const iso = cleJour(c.annee, c.mois, c.jour);
      return { ...c, iso, scrutins: parJour.get(iso) ?? [] };
    }));
  }
  return semaines;
}

/**
 * Mois précédent ou suivant qui contient effectivement des scrutins.
 * Sauter les mois vides évite de faire cliquer dans le vide pendant les
 * suspensions de session.
 *
 * @param {number} sens -1 vers le passé, +1 vers l'avenir
 * @returns {?{annee:number, mois:number}}
 */
export function moisVoisin(annee, mois, moisDisponibles, sens) {
  const courant = cleMois(annee, mois);
  /* `moisDisponibles` est trié du plus récent au plus ancien. */
  const candidats = sens < 0
    ? moisDisponibles.filter((m) => m < courant)
    : moisDisponibles.filter((m) => m > courant).reverse();

  const cible = candidats[0];
  if (!cible) return null;
  const [a, m] = cible.split("-").map(Number);
  return { annee: a, mois: m - 1 };
}

/** Libellé accessible d'une case, lu par les technologies d'assistance. */
export function libelleJour(iso, nombre) {
  const { annee, mois, jour } = decouper(iso);
  const semaine = JOURS_LONGS[jourSemaine(annee, mois, jour)];
  const date = `${semaine} ${jour} ${MOIS[mois]} ${annee}`;
  if (!nombre) return `${date}, aucun scrutin`;
  return `${date}, ${nombre} scrutin${nombre > 1 ? "s" : ""}`;
}
