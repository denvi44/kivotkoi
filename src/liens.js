/**
 * liens.js — renvois vers les sources officielles.
 *
 * Toutes ces adresses se déduisent d'identifiants déjà présents dans les
 * données : le numéro du scrutin, le matricule du parlementaire, celui de
 * l'organe. Aucune n'est devinée, aucune ne dépend d'une recherche ou d'une
 * correspondance de chaînes — c'est ce qui les rend sûres.
 *
 * Ce que ces liens résolvent : le site publie *comment* on a voté, jamais
 * *ce que dit* le texte. Renvoyer vers la source évite d'avoir à résumer une
 * loi, exercice qui reviendrait à publier de l'interprétation.
 *
 * Ce qu'ils ne résolvent pas : il n'existe pas d'adresse déductible menant
 * directement au texte de loi. La page de scrutin de l'Assemblée y mène en un
 * clic, via le dossier législatif ; on s'arrête donc là plutôt que de fabriquer
 * une URL de recherche qui casserait à la première refonte.
 */

const AN = "https://www.assemblee-nationale.fr";
const SENAT = "https://www.senat.fr";

/**
 * Page d'analyse officielle d'un scrutin.
 * Vérifié le 27 juillet 2026 : `/dyn/17/scrutins/8422` répond « Analyse du
 * scrutin n°8422 » et renvoie vers le compte rendu de séance et le dossier.
 */
export function lienScrutin(chambre, numero, legislature = 17, session) {
  /* Un entier strictement positif, et rien d'autre. `Number(null)` et
     `Number("")` valent zéro : un test de finitude seul laissait passer
     l'absence de valeur et produisait « /scrutins/null ». */
  const n = Number(numero);
  if (!Number.isInteger(n) || n < 1) return null;

  if (chambre === "senat") {
    return session ? `${SENAT}/scrutin-public/${session}/scr${session}-${n}.html` : null;
  }
  const l = Number(legislature);
  if (!Number.isInteger(l) || l < 1) return null;
  return `${AN}/dyn/${l}/scrutins/${n}`;
}

/** Fiche officielle d'un parlementaire, depuis son matricule. */
export function lienParlementaire(chambre, id) {
  if (!id) return null;
  if (chambre === "senat") {
    /* Le Sénat compose l'adresse à partir du nom et du matricule ; l'API la
       fournit directement, on ne la reconstruit pas. */
    return null;
  }
  return /^PA\d+$/i.test(id) ? `${AN}/dyn/deputes/${id.toUpperCase()}` : null;
}

/** Page d'un groupe politique. */
export function lienGroupe(chambre, organeRef) {
  if (chambre === "senat" || !organeRef) return null;
  return /^PO\d+$/i.test(organeRef) ? `${AN}/dyn/org/${organeRef.toUpperCase()}` : null;
}

/** Visualisation officielle des votes dans l'hémicycle. */
export function lienHemicycle(chambre, uid) {
  if (chambre === "senat" || !uid) return null;
  return `${AN}/dyn/vos-deputes/hemicycle?scrutin=${encodeURIComponent(uid)}`;
}

/** Préfixes d'identifiant de document, vers le segment d'URL correspondant. */
const TYPES_TEXTE = {
  PION: "proposition-loi",
  PRJL: "projet-loi",
};

/**
 * Adresses d'un dossier législatif, construites à la volée.
 *
 * Les URL ne sont pas stockées : elles se déduisent de trois valeurs — le
 * slug du dossier, l'identifiant du texte déposé, l'uid. Les écrire en toutes
 * lettres sur chacun des 5 102 scrutins concernés faisait passer l'index de
 * 1,4 à 3,75 Mo, pour une information répétée une centaine de fois.
 *
 * @param {?{uid:string, chemin:?string, depot:?string}} d
 * @returns {{dossier:?string, texte:?string, amendements:?string}}
 */
export function liensTexte(d, legislature = 17) {
  if (!d) return { dossier: null, texte: null, amendements: null };

  const m = /^([A-Z]+)ANR\d*L(\d+)B(\d+)$/i.exec(String(d.depot ?? ""));
  const type = m ? TYPES_TEXTE[m[1].toUpperCase()] : null;

  return {
    dossier: d.chemin ? `${AN}/dyn/${legislature}/dossiers/${d.chemin}` : null,
    /* Vérifié le 28 juillet 2026 : PIONANR5L17B1326 mène bien à
       /dyn/17/textes/l17b1326_proposition-loi. Un préfixe inconnu — rapport,
       avis, étude d'impact — ne produit aucun lien plutôt qu'une adresse
       plausible menant ailleurs. */
    texte: type && m ? `${AN}/dyn/${legislature}/textes/l${m[2]}b${m[3]}_${type}` : null,
    amendements: d.uid
      ? `${AN}/dyn/${legislature}/amendements?dossier_legislatif=${d.uid}`
      : null,
  };
}
