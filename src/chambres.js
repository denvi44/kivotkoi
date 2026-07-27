/**
 * chambres.js — ce qui distingue l'Assemblée du Sénat.
 *
 * Tout le reste du code est commun aux deux chambres : l'invariant de
 * partition, la géométrie de l'hémicycle, le calendrier, l'analyse nominative.
 * Seules varient les valeurs rassemblées ici.
 *
 * Différence de fond entre les deux sources, à ne pas perdre de vue :
 *
 *   - L'Assemblée ne nomme QUE les votants. Les absents se déduisent par
 *     différence avec `nombreMembresGroupe`, sans identité.
 *   - Le Sénat nomme TOUT LE MONDE, y compris les non-votants (code « n »).
 *
 * Un hémicycle du Sénat est donc nominativement complet, celui de l'Assemblée
 * comporte des sièges anonymes. L'interface doit le dire plutôt que de laisser
 * croire à une symétrie qui n'existe pas.
 */

export const CHAMBRES = {
  an: {
    id: "an",
    nom: "Assemblée nationale",
    nomCourt: "Assemblée",
    sieges: 577,
    rangs: 11,
    membre: "député",
    membres: "députés",
    /* L'ordre gauche-droite est un choix éditorial : voir src/groupes.js. */
    ordreEditorial: true,
    /* Les absents ne sont pas nommés par la source. */
    absentsNommes: false,
    licence: "Licence Ouverte / Open Licence 2.0 — Assemblée nationale",
    source: "data.assemblee-nationale.fr",
  },

  senat: {
    id: "senat",
    nom: "Sénat",
    nomCourt: "Sénat",
    sieges: 348,
    /* Moins de sièges, donc moins de rangs pour conserver une densité
       comparable à l'œil. */
    rangs: 9,
    membre: "sénateur",
    membres: "sénateurs",
    /* Le Sénat publie `groupe.ordre` : rien à décider. */
    ordreEditorial: false,
    absentsNommes: true,
    licence: "Sénat — voir docs/JOURNAL.md, licence des scrutins à confirmer",
    source: "senat.fr",
  },
};

/**
 * Couleurs des groupes du Sénat.
 *
 * Comme pour l'Assemblée, ce sont des choix d'affichage : l'open data ne
 * publie pas de couleur. Les valeurs visent 3:1 minimum sur le fond `--slate`
 * (#1F1B18), seuil de WCAG 1.4.11 pour un élément non textuel, et un écart
 * perceptuel suffisant entre groupes voisins.
 *
 * Un groupe absent de cette table n'est pas une erreur : il reçoit la couleur
 * de repli et l'interface le signale — situation normale quand un groupe se
 * constitue en cours de session.
 */
export const COULEURS_SENAT = {
  CRCE: "#B0304A",      // Communiste, Républicain, Citoyen et Écologiste – Kanaky
  "CRCE-K": "#B0304A",
  SER: "#E5476B",       // Socialiste, Écologiste et Républicain
  SOCR: "#E5476B",
  GEST: "#3E9E48",      // Écologiste – Solidarité et Territoires
  RDSE: "#C2A76B",      // Rassemblement Démocratique et Social Européen
  RDPI: "#E8A33D",      // Rassemblement des démocrates, progressistes et indépendants
  LREM: "#E8A33D",      // code historique du même groupe dans l'API
  UC: "#7FC5E8",        // Union Centriste
  LIRT: "#9C8CB5",      // Les Indépendants – République et Territoires
  INDEP: "#9C8CB5",
  LR: "#4C7FD0",        // Les Républicains
  NI: "#A08B5E",        // Non inscrits
  RASNAG: "#A08B5E",    // Réunion administrative des sénateurs n'appartenant à aucun groupe
};

export const COULEUR_INCONNUE = "#8A8074";

export const couleurSenat = (id) => COULEURS_SENAT[id] ?? COULEUR_INCONNUE;

/**
 * Ordonne les groupes d'une chambre de la gauche vers la droite.
 *
 * Au Sénat, l'ordre vient de la source (`groupe.ordre`) et cette fonction ne
 * fait que trier. À l'Assemblée, il faut le décider — d'où `src/groupes.js`,
 * qui reste la référence pour cette chambre.
 *
 * @param {Array<{id:string, ordre?:number}>} groupes
 */
export function ordonnerSenat(groupes) {
  const connus = groupes.filter((g) => Number.isFinite(g.ordre));
  const inconnus = groupes.filter((g) => !Number.isFinite(g.ordre));

  return {
    ordonnes: [
      ...connus.sort((a, b) => a.ordre - b.ordre),
      ...inconnus.sort((a, b) => String(a.id).localeCompare(String(b.id))),
    ],
    inconnus: inconnus.map((g) => g.id),
  };
}
