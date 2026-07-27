/**
 * senat.mjs — normalisation des scrutins du Sénat.
 *
 * Le Sénat expose deux ressources JSON complémentaires :
 *
 *   senat.fr/api-senat/senateurs.json
 *     → matricule, état civil, groupe (avec son rang gauche-droite), siège
 *
 *   senat.fr/scrutin-public/{session}/scr{session}-{n}.json
 *     → { votes: [ { matricule, vote: "p"|"c"|"a"|"n", siege } ] }
 *
 * Deux différences notables avec l'Assemblée, toutes deux à l'avantage du
 * Sénat :
 *
 *   - `groupe.ordre` donne le rang gauche-droite officiel. Côté Assemblée,
 *     cet ordre est un choix éditorial que `src/groupes.js` doit assumer.
 *   - Les absents SONT présents dans le fichier, avec le code « n ». L'Assemblée
 *     ne nomme que les votants et laisse deviner le reste par différence.
 *
 * La sortie adopte exactement la forme que `partitionner()` consomme déjà, de
 * sorte que l'invariant — un parlementaire dans exactement une case — soit
 * vérifié par le même code pour les deux chambres.
 *
 * ATTENTION LICENCE : au 27 juillet 2026, les fichiers de scrutin ne figurent
 * pas parmi les jeux listés sur data.senat.fr et ne sont donc couverts par
 * aucune licence explicite. Le référentiel des sénateurs, lui, relève de la
 * Licence Ouverte 2.0. Voir docs/JOURNAL.md ; ne rien publier avant réponse
 * du Sénat.
 */

/** Codes de vote du Sénat, vers le vocabulaire commun aux deux chambres. */
export const POSITIONS = {
  p: "pour",
  c: "contre",
  a: "abstention",
  n: "nonVotant",
};

/**
 * Table matricule → identité, depuis `api-senat/senateurs.json`.
 *
 * Le matricule (« 07033P ») est stable et se retrouve dans l'URL de la fiche
 * du sénateur. C'est lui qui sert de clé, jamais le nom — même règle qu'à
 * l'Assemblée, et pour les mêmes raisons.
 */
export function construireSenateurs(fichier) {
  const table = new Map();

  for (const s of Array.isArray(fichier) ? fichier : (fichier?.senateurs ?? [])) {
    const id = typeof s?.matricule === "string" ? s.matricule.trim().toUpperCase() : "";
    if (!id) continue;

    table.set(id, {
      id,
      nom: [s.prenom, s.nom].filter(Boolean).join(" ") || id,
      civilite: s.civilite ?? null,
      groupe: s.groupe?.code ?? null,
      groupeNom: s.groupe?.libelle ?? null,
      /* Rang gauche-droite publié par le Sénat : on n'a pas à le décider. */
      ordreGroupe: Number.isFinite(Number(s.groupe?.ordre)) ? Number(s.groupe.ordre) : null,
      siege: Number.isFinite(Number(s.siege)) ? Number(s.siege) : null,
      circonscription: s.circonscription?.libelle ?? s.circonscription?.code ?? null,
      url: s.url ?? null,
    });
  }

  if (table.size === 0) {
    throw new Error(
      "Aucun sénateur lisible. La forme de api-senat/senateurs.json a changé — " +
      "un tableau d'objets portant « matricule » était attendu."
    );
  }
  return table;
}

/**
 * Groupes politiques déduits du référentiel, ordonnés de la gauche vers la
 * droite d'après `groupe.ordre`.
 *
 * @returns {Array<{id, nom, ordre, sieges}>}
 */
export function groupesSenat(senateurs) {
  const par = new Map();

  for (const s of senateurs.values()) {
    if (!s.groupe) continue;
    if (!par.has(s.groupe)) {
      par.set(s.groupe, { id: s.groupe, nom: s.groupeNom, ordre: s.ordreGroupe, sieges: 0 });
    }
    par.get(s.groupe).sieges++;
  }

  return [...par.values()].sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999));
}

/**
 * Aplatit un fichier de scrutin en la liste que `partitionner()` consomme.
 *
 * @param {object} brut       contenu de scr{session}-{n}.json
 * @param {Map}    senateurs  table issue de `construireSenateurs`
 * @param {object} meta       { numero, date, titre, sort } tirés de l'index
 * @returns {{numero, date, titre, sort, votes, sieges, inconnus}}
 */
export function normaliserScrutinSenat(brut, senateurs, meta = {}) {
  const brutVotes = brut?.votes;
  if (!Array.isArray(brutVotes)) {
    throw new Error(
      `scrutin Sénat ${meta.numero ?? "?"} : champ « votes » absent ou non ` +
      `tabulaire. Clés présentes : ${Object.keys(brut ?? {}).join(", ") || "(aucune)"}.`
    );
  }
  if (brutVotes.length === 0) {
    throw new Error(`scrutin Sénat ${meta.numero ?? "?"} : aucun vote enregistré.`);
  }

  const votes = [];
  const sieges = {};        // matricule -> numéro de siège, pour la géométrie
  const inconnus = [];      // matricules absents du référentiel

  for (const v of brutVotes) {
    const id = typeof v?.matricule === "string" ? v.matricule.trim().toUpperCase() : "";
    if (!id) continue;

    const position = POSITIONS[String(v?.vote ?? "").toLowerCase()];
    if (!position) {
      /* Un code inconnu n'est jamais deviné : `partitionner()` le signalera
         et le scrutin sera écarté plutôt que publié avec un décompte faux. */
      votes.push({ id, nom: id, groupe: null, position: v?.vote ?? null });
      continue;
    }

    const s = senateurs.get(id);
    if (!s) inconnus.push(id);

    votes.push({
      id,
      nom: s?.nom ?? id,
      groupe: s?.groupe ?? null,
      position,
    });

    const siege = Number(v?.siege);
    if (Number.isFinite(siege)) sieges[id] = siege;
  }

  return {
    numero: Number(meta.numero),
    date: meta.date ?? null,
    titre: meta.titre ?? null,
    sort: meta.sort ?? null,
    votes,
    sieges,
    inconnus,
  };
}

/**
 * Analyse une page d'index de session (`scr{annee}.html`).
 *
 * Le Sénat ne publie pas d'index en JSON : il faut lire la page HTML qui
 * liste les scrutins de la session. On n'y cherche que ce qui est structurel
 * — le lien, le numéro, la date, le titre, le sort — sans dépendre de la mise
 * en forme.
 *
 * @returns {Array<{numero, session, date, titre, sort, url}>}
 */
export function analyserIndexSession(html, annee) {
  const resultats = [];
  const vu = new Set();

  /* Lecture séquentielle plutôt que par fenêtre : une même date coiffe
     plusieurs scrutins, et chercher en arrière sur une longueur fixe en perdait
     un sur trois. On avance dans le document en retenant la dernière date vue.

     Deux ancres, toutes deux structurelles :
       - le libellé de date, dans un `list-group-subtitle` ;
       - le lien vers scr{session}-{n}.html, relatif dans cette page. */
  const jeton = new RegExp(
    `(?:list-group-subtitle"[^>]*>\\s*(\\d{1,2}\\s+(?:${MOIS_FR.join("|")})\\s+\\d{4}))` +
    `|(?:href="(?:\\/scrutin-public\\/)?(\\d{4})\\/scr(?:\\d{4})-(\\d+)\\.html")`,
    "gi"
  );

  let dateCourante = null;
  let m;
  while ((m = jeton.exec(html)) !== null) {
    if (m[1]) { dateCourante = enIso(m[1]); continue; }

    const session = m[2];
    const numero = m[3];
    const cle = `${session}-${numero}`;
    if (vu.has(cle)) continue;
    vu.add(cle);

    /* Le titre commence après la fermeture de l'ancre et court jusqu'au renvoi
       vers le dossier législatif ou au badge de résultat. */
    const depuis = m.index + m[0].length;
    const apres = html.slice(depuis, depuis + 1400);
    const corps = apres.slice(apres.indexOf("</a>") + 4);

    resultats.push({
      numero: Number(numero),
      session,
      date: dateCourante,
      titre: extraireTitre(corps),
      sort: /Adoption/i.test(apres.slice(0, 900)) ? "adopté"
        : /Rejet/i.test(apres.slice(0, 900)) ? "rejeté"
        : null,
      url: `https://www.senat.fr/scrutin-public/${session}/scr${session}-${numero}.json`,
    });
  }

  if (resultats.length === 0) {
    throw new Error(
      `Aucun scrutin trouvé dans l'index de la session ${annee}. ` +
      `La structure de la page a changé.`
    );
  }
  return resultats.sort((a, b) => b.numero - a.numero);
}

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « 26 mai 2026 » → « 2026-05-26 ». */
function enIso(libelle) {
  const m = new RegExp(`(\\d{1,2})\\s+(${MOIS_FR.join("|")})\\s+(\\d{4})`, "i").exec(libelle);
  if (!m) return null;
  const jour = String(Number(m[1])).padStart(2, "0");
  const mois = String(MOIS_FR.indexOf(m[2].toLowerCase()) + 1).padStart(2, "0");
  return `${m[3]}-${mois}-${jour}`;
}

/* Entités rencontrées dans les titres du Sénat. Les numériques sont traitées
   à part, ce qui couvre le reste sans table exhaustive. */
const ENTITES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë",
  agrave: "à", acirc: "â", ccedil: "ç",
  icirc: "î", iuml: "ï", ocirc: "ô", ugrave: "ù", ucirc: "û",
  Eacute: "É", Egrave: "È", Agrave: "À", Ccedil: "Ç",
  rsquo: "'", lsquo: "'", laquo: "«", raquo: "»",
  deg: "°", hellip: "…", ndash: "–", mdash: "—",
};

const decoder = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (t, nom) => ENTITES[nom] ?? t);

/** Texte du lien jusqu'au renvoi « consulter le dossier législatif ». */
function extraireTitre(corps) {
  const brut = decoder(corps.replace(/<[^>]+>/g, " "));

  return brut
    .split(/consulter le dossier|Adoption|Rejet/i)[0]
    .replace(/\s+/g, " ")
    /* Le libellé de l'ancre — « Scrutin N° 340 : » — n'apporte rien : le
       numéro est déjà porté par le champ dédié. */
    .replace(/^\s*[:\s]*Scrutin\s*N°?\s*\d+\s*:?\s*/i, "")
    .replace(/^\s*:\s*/, "")
    .replace(/^sur\s+/i, "")
    .trim()
    .replace(/[\s\-–—.]+$/, "") || null;
}
