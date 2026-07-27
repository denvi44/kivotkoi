/**
 * decompte.js — les nombres affichés sous l'hémicycle.
 *
 * Ce fichier existe à cause d'une régression : la légende additionnait
 * `nonVotant`, `absent` et les absents déduits, puis étiquetait la somme
 * « non votants ». Sur le scrutin 8434, deux non-votants s'affichaient donc
 * comme 213 — l'exacte confusion que le reste du projet s'interdit, et que
 * `README.md` promet d'éviter en toutes lettres.
 *
 * Le calcul vivait en JSX, où rien ne le testait. Sorti ici, il est vérifiable
 * sans DOM : `test/decompte.test.mjs` vérifie qu'aucune entrée n'en absorbe
 * une autre et que la somme retombe sur l'effectif.
 *
 * Deux distinctions que ce module n'a pas le droit de perdre :
 *
 *   `nonVotant` — présent en séance, ne prend pas part au vote. Le président
 *                 de séance en est le cas courant ; ce n'est pas une absence.
 *   `absent`    — n'est pas là. À l'Assemblée, la source n'en publie que le
 *                 nombre ; au Sénat, elle publie les présents, d'où une liste.
 *
 * Les fondre fabrique un faux taux d'absentéisme, dans un sens comme dans
 * l'autre : ici on gonflait les non-votants, ailleurs on gonflerait les absents.
 */

/** En français le pluriel commence à deux : « 1 absent », « 2 absents ». */
export const pluriel = (mot, n) => (n >= 2 ? `${mot}s` : mot);

/**
 * Les entrées de la légende, dans l'ordre d'affichage.
 *
 * @param {object} compteurs  `scrutin.compteurs` — une clé par case.
 * @param {number} absentsDeduits  Absents reconstitués depuis l'effectif du
 *   groupe. Disjoints de `compteurs.absent`, qui compte la liste publiée.
 * @param {boolean} complet  Mode « hémicycle complet ». À false, les absents
 *   ne sont pas représentés : on ne les liste pas non plus, car « 0 absent »
 *   laisserait croire qu'il n'y en a aucun.
 * @returns {{cle: string, n: number, mot: string}[]}
 */
export function entreesLegende(compteurs, absentsDeduits = 0, complet = true) {
  const c = compteurs ?? {};
  const n = (k) => (Number.isFinite(c[k]) ? c[k] : 0);

  const entrees = [
    { cle: "pour", n: n("pour"), mot: "pour" },
    { cle: "contre", n: n("contre"), mot: "contre" },
    { cle: "abstention", n: n("abstention"), mot: pluriel("abstention", n("abstention")) },
    { cle: "nonVotant", n: n("nonVotant"), mot: pluriel("non votant", n("nonVotant")) },
  ];

  if (!complet) return entrees;

  /* `Number.isFinite(null)` vaut false, mais `Number(null)` vaut 0 : le test
     porte sur la valeur brute, jamais sur sa conversion. */
  const deduits = Number.isFinite(absentsDeduits) ? absentsDeduits : 0;
  const absents = n("absent") + deduits;
  entrees.push({ cle: "absent", n: absents, mot: pluriel("absent", absents) });

  return entrees;
}

/** L'effectif que la légende décrit — utile pour vérifier qu'il retombe juste. */
export const totalLegende = (entrees) => entrees.reduce((t, e) => t + e.n, 0);
