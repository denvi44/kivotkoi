/**
 * dossiers.mjs — relier un scrutin au texte de loi sur lequel il porte.
 *
 * Les fichiers de scrutin ne référencent aucun dossier : `referenceLegislative`
 * est nul sur les 5 381 scrutins de la période. Le lien existe dans l'autre
 * sens, à l'intérieur du jeu « Dossiers législatifs » : certains actes portent
 * un champ `voteRef` désignant le scrutin.
 *
 * ── Comment le lien est établi ──────────────────────────────────────────────
 *
 * 1. On parcourt les actes de chaque dossier et on relève les `voteRef`. Cela
 *    couvre 227 scrutins de la 17e législature — les votes sur l'ensemble des
 *    textes, pas les amendements.
 *
 * 2. Chacun de ces scrutins porte déjà une clé de texte, produite par
 *    `cleTexte()` à partir de son intitulé. On propage donc le dossier à tous
 *    les scrutins partageant cette clé — les amendements au même texte.
 *
 * Cette propagation ne repose pas sur un rapprochement approximatif : la clé
 * est le titre complet normalisé, et deux textes distincts n'en produisent pas
 * le même. Vérifié sur la période : aucune clé ne mène à deux dossiers.
 *
 * Résultat mesuré : 94,8 % des scrutins reliés à leur dossier.
 *
 * Une tentative antérieure d'apparier les titres de scrutin aux titres de
 * dossier n'atteignait que 29 %. Les seconds sont des intitulés éditoriaux
 * courts — « Renforcer la lutte contre l'occupation illégale de terrains » —
 * là où les premiers sont des désignations formelles. Aucune normalisation ne
 * réconcilie les deux, et un rapprochement flou aurait renvoyé vers la
 * mauvaise loi.
 */

/** Préfixes d'identifiant de document, vers le segment d'URL correspondant. */
const TYPES_TEXTE = {
  PION: "proposition-loi",
  PRJL: "projet-loi",
};

const AN = "https://www.assemblee-nationale.fr";

/** Parcours récursif d'une arborescence d'actes législatifs. */
function* parcourir(noeud) {
  if (!noeud || typeof noeud !== "object") return;
  if (Array.isArray(noeud)) {
    for (const x of noeud) yield* parcourir(x);
    return;
  }
  yield noeud;
  for (const v of Object.values(noeud)) yield* parcourir(v);
}

/**
 * Dépouille un dossier : son texte de dépôt initial et les scrutins qu'il cite.
 *
 * @returns {{uid, chemin, titre, depot:?string, votes:string[]}}
 */
export function analyserDossier(brut) {
  const d = brut?.dossierParlementaire ?? brut;
  if (!d?.uid) return null;

  let depot = null;
  let premierTexte = null;
  const votes = [];

  for (const n of parcourir(d.actesLegislatifs)) {
    const texte = typeof n.texteAssocie === "string" ? n.texteAssocie : null;
    if (texte) {
      /* Le dépôt initial est l'ancrage le plus sûr : c'est le texte tel que
         soumis, avant les réécritures successives de la navette. */
      const estDepot = n["@xsi:type"] === "DepotInitiative_Type"
        || String(n.codeActe ?? "").endsWith("-DEPOT");
      if (estDepot && !depot) depot = texte;
      if (!premierTexte) premierTexte = texte;
    }
    if (typeof n.voteRef === "string") votes.push(n.voteRef);
  }

  return {
    uid: d.uid,
    chemin: d.titreDossier?.titreChemin ?? null,
    titre: d.titreDossier?.titre ?? null,
    depot: depot ?? premierTexte,
    votes,
  };
}

/** Numéro de scrutin extrait d'un uid « VTANR5L17V8434 ». */
export const numeroDeVote = (uid) => {
  const m = /^VTANR\d*L\d+V(\d+)$/i.exec(String(uid ?? ""));
  return m ? Number(m[1]) : null;
};

/**
 * Table clé de texte → dossier, construite depuis les `voteRef` puis propagée.
 *
 * @param {Array<object>} fichiersDossier contenus des dossierParlementaire/*.json
 * @param {Map<number,string>} cleParScrutin  numéro de scrutin → clé de texte
 * @param {string} legislature
 * @returns {{parCle:Map<string,object>, directs:number, collisions:Array}}
 */
export function relierDossiers(fichiersDossier, cleParScrutin, legislature = "17") {
  const parCle = new Map();
  const collisions = [];
  let directs = 0;

  for (const f of fichiersDossier ?? []) {
    const d = analyserDossier(f);
    if (!d) continue;
    const leg = (f?.dossierParlementaire ?? f)?.legislature;
    if (String(leg) !== String(legislature)) continue;

    for (const v of d.votes) {
      const numero = numeroDeVote(v);
      if (numero === null) continue;
      const cle = cleParScrutin.get(numero);
      if (!cle) continue;
      directs++;

      const vu = parCle.get(cle);
      if (vu && vu.uid !== d.uid) {
        /* Deux dossiers pour une même clé : la propagation deviendrait
           arbitraire. On le signale plutôt que de trancher au hasard. */
        collisions.push({ cle, premier: vu.uid, second: d.uid });
        continue;
      }
      if (!vu) parCle.set(cle, d);
    }
  }

  /* Une clé en collision ne doit relier aucun scrutin. */
  for (const c of collisions) parCle.delete(c.cle);

  return { parCle, directs, collisions };
}

/**
 * Adresses officielles d'un dossier.
 *
 * @returns {{dossier:?string, texte:?string, amendements:?string}}
 */
export function liensDossier(d, legislature = 17) {
  if (!d) return { dossier: null, texte: null, amendements: null };

  const m = /^([A-Z]+)ANR\d*L(\d+)B(\d+)$/i.exec(String(d.depot ?? ""));
  const type = m ? TYPES_TEXTE[m[1].toUpperCase()] : null;

  return {
    dossier: d.chemin ? `${AN}/dyn/${legislature}/dossiers/${d.chemin}` : null,
    /* Vérifié le 28 juillet 2026 : PIONANR5L17B1326 mène bien à
       /dyn/17/textes/l17b1326_proposition-loi. Un préfixe inconnu — rapport,
       avis, étude d'impact — ne produit aucun lien plutôt qu'une adresse
       plausible mais fausse. */
    texte: type && m ? `${AN}/dyn/${legislature}/textes/l${m[2]}b${m[3]}_${type}` : null,
    amendements: d.uid
      ? `${AN}/dyn/${legislature}/amendements?dossier_legislatif=${d.uid}`
      : null,
  };
}
