/**
 * groupes.js — habillage des groupes politiques.
 *
 * L'open data de l'Assemblée nationale fournit l'acronyme et le libellé des
 * groupes, mais ni leur couleur ni leur position sur l'axe gauche–droite.
 * Ces deux informations sont éditoriales : elles vivent ici, pas dans
 * l'ingestion.
 *
 * `ORDRE` détermine le placement des sièges dans l'hémicycle, de la travée de
 * gauche (θ = π) à celle de droite (θ = 0). Un groupe absent de cette liste
 * n'est pas une erreur : il est placé en fin de rang, en gris, et signalé par
 * l'interface. C'est le comportement attendu en début de législature, quand un
 * groupe se constitue avant qu'on ait tranché de sa place.
 */

/* Acronymes tels que l'Assemblée les publie (champ `libelleAbrev` des organes
   de codeType « GP »), relevés le 26 juillet 2026 dans AMO10. Attention : ce
   ne sont pas les sigles d'usage courant. « LFI-NFP » et non « LFI »,
   « ECOS » et non « ECO », « UDDPLR » et non « UDR ». Un écart ici ne casse
   rien mais fait tomber le groupe en fin de rang, en gris. */
export const ORDRE = [
  "GDR", "LFI-NFP", "ECOS", "SOC", "LIOT", "DEM", "EPR", "HOR", "DR", "UDDPLR", "RN", "NI",
];

export const COULEURS = {
  GDR: "#B0173B",
  "LFI-NFP": "#CC2443",
  ECOS: "#3E9E48",
  SOC: "#E5476B",
  LIOT: "#9C8CB5",
  DEM: "#E8A33D",
  EPR: "#F0D040",
  HOR: "#7FC5E8",
  DR: "#2E6DB4",
  UDDPLR: "#1B4E8C",
  RN: "#1C2E6E",
  /* NI décalé du gris vers un kaki : « non inscrit » n'est pas une identité
     partisane à préserver, et l'ancien #6B6259 se confondait avec les sièges
     d'absents (ΔE 5,8, sous le seuil de confusion de 20). Désormais 22,8. */
  NI: "#A08B5E",
};

/** Couleur de repli pour un groupe inconnu du fichier ci-dessus. */
export const COULEUR_INCONNUE = "#6B6259";

/**
 * Trie les groupes issus des données selon ORDRE, en conservant ceux qui n'y
 * figurent pas (placés à la fin, par ordre alphabétique) plutôt que de les
 * jeter silencieusement.
 *
 * @param {Array<{id:string}>} groupes
 * @returns {{ordonnes: Array, inconnus: string[]}}
 */
export function ordonner(groupes) {
  const rang = new Map(ORDRE.map((id, i) => [id, i]));
  const inconnus = groupes.map((g) => g.id).filter((id) => !rang.has(id)).sort();

  const ordonnes = [...groupes].sort((a, b) => {
    const ra = rang.has(a.id) ? rang.get(a.id) : ORDRE.length + inconnus.indexOf(a.id);
    const rb = rang.has(b.id) ? rang.get(b.id) : ORDRE.length + inconnus.indexOf(b.id);
    return ra - rb;
  });

  return { ordonnes, inconnus };
}

export const couleurDe = (id) => COULEURS[id] ?? COULEUR_INCONNUE;
