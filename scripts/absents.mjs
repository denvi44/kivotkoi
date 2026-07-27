/**
 * absents.mjs — retrouver les députés absents, que l'Assemblée ne nomme pas.
 *
 * Les fichiers de scrutin ne recensent que les votants. Les absents n'existent
 * que par soustraction : effectif du groupe moins ceux qui ont pris part.
 *
 * L'effectif, lui, se reconstitue à partir des mandats datés — chaque
 * appartenance à un groupe porte une date de début et parfois de fin. On peut
 * donc savoir qui siégeait dans quel groupe le jour d'un scrutin.
 *
 * ── Pourquoi ce n'est pas une devinette ─────────────────────────────────────
 *
 * Deux contrôles indépendants encadrent la déduction :
 *
 *   1. L'effectif reconstitué doit égaler `nombreMembresGroupe`, publié par
 *      l'Assemblée pour ce scrutin et ce groupe.
 *   2. Tous les votants listés doivent appartenir à l'effectif reconstitué.
 *
 * Si les deux passent, la différence « membres moins votants » EST la liste
 * des absents — ce n'est plus une inférence mais une déduction contrainte des
 * deux côtés. Mesuré sur les scrutins de la période : sur 8 102 couples où le
 * premier contrôle passe, le second passe aussi dans 100 % des cas, sans une
 * seule exception.
 *
 * Si l'un des deux échoue, on ne nomme personne et l'interface retombe sur le
 * décompte anonyme. Un absent mal attribué serait une accusation infondée.
 *
 * ── Limite connue ───────────────────────────────────────────────────────────
 *
 * Le référentiel des mandats actifs (AMO10) ignore les députés qui ont quitté
 * l'Assemblée. Avec lui seul, l'effectif est systématiquement sous-évalué et
 * le premier contrôle échoue dans 44 % des cas. L'historique (AMO30) comble
 * ce trou, mais il est republié moins souvent : une suppléance très récente
 * peut encore manquer, auquel cas le contrôle joue son rôle.
 */

const enTableau = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const texte = (v) => (v && typeof v === "object" ? v["#text"] ?? null : v ?? null);

/**
 * Historique des appartenances aux groupes politiques.
 *
 * @param {Array<object>} fichiersActeur contenus des fichiers acteur/*.json
 * @returns {Map<string, Array<{organe:string, debut:?string, fin:?string}>>}
 */
export function construireHistorique(fichiersActeur) {
  const hist = new Map();

  for (const f of enTableau(fichiersActeur)) {
    const a = f?.acteur ?? f;
    const uid = texte(a?.uid);
    if (!uid) continue;

    for (const m of enTableau(a?.mandats?.mandat)) {
      if (m?.typeOrgane !== "GP") continue;
      const organe = texte(m?.organes?.organeRef);
      if (!organe) continue;

      if (!hist.has(uid)) hist.set(uid, []);
      hist.get(uid).push({
        organe,
        debut: m?.dateDebut ?? null,
        fin: m?.dateFin ?? null,
      });
    }
  }
  return hist;
}

/**
 * Fusionne plusieurs historiques — typiquement AMO10 (frais, mandats actifs)
 * et AMO30 (complet, moins souvent republié). Les doublons exacts sont
 * écartés ; en cas de désaccord sur les dates, les deux versions sont
 * conservées, l'appartenance étant vraie si l'une d'elles la couvre.
 */
export function fusionnerHistoriques(...historiques) {
  const out = new Map();

  for (const h of historiques) {
    if (!h) continue;
    for (const [uid, mandats] of h) {
      if (!out.has(uid)) out.set(uid, []);
      const liste = out.get(uid);
      for (const m of mandats) {
        const existe = liste.some(
          (x) => x.organe === m.organe && x.debut === m.debut && x.fin === m.fin
        );
        if (!existe) liste.push(m);
      }
    }
  }
  return out;
}

/**
 * Membres d'un groupe à une date donnée.
 *
 * @param {string} acronyme  acronyme du groupe, tel qu'affiché
 * @param {string} date      AAAA-MM-JJ
 * @param {Map}    historique
 * @param {Map}    organes   PO###### → { id: acronyme }
 * @returns {Set<string>} identifiants PA######
 */
export function membresALaDate(acronyme, date, historique, organes) {
  const membres = new Set();
  if (!acronyme || !date) return membres;

  for (const [uid, mandats] of historique) {
    for (const m of mandats) {
      if (organes.get(m.organe)?.id !== acronyme) continue;
      /* Les dates sont en AAAA-MM-JJ : la comparaison de chaînes suffit et
         évite les pièges de fuseau d'un objet Date. */
      if (m.debut && m.debut > date) continue;
      if (m.fin && m.fin < date) continue;
      membres.add(uid);
      break;
    }
  }
  return membres;
}

/**
 * Tente de nommer les absents d'un groupe pour un scrutin.
 *
 * @param {object} args
 * @param {string} args.acronyme
 * @param {string} args.date
 * @param {number} args.effectifAnnonce  `nombreMembresGroupe` publié par l'AN
 * @param {string[]} args.votants        identifiants ayant pris part au vote
 * @param {Map} args.historique
 * @param {Map} args.organes
 * @returns {{absents:?string[], motif:string}}
 *          `absents` vaut null si la déduction n'est pas démontrable ; `motif`
 *          dit toujours pourquoi, pour que l'échec soit lisible plutôt que
 *          silencieux.
 */
export function deduireAbsents({
  acronyme, date, effectifAnnonce, votants, historique, organes,
}) {
  /* Un entier strictement positif : un groupe parlementaire compte au moins un
     membre. Tester la seule finitude laissait passer zéro, valeur que prend
     `Number(null)` — le même écueil que dans src/liens.js. */
  if (!Number.isInteger(effectifAnnonce) || effectifAnnonce < 1) {
    return { absents: null, motif: "effectif non publié par la source" };
  }

  const membres = membresALaDate(acronyme, date, historique, organes);

  /* Contrôle 1 — l'effectif reconstitué doit correspondre au chiffre publié. */
  if (membres.size !== effectifAnnonce) {
    return {
      absents: null,
      motif: `effectif reconstitué ${membres.size} ≠ ${effectifAnnonce} annoncé`,
    };
  }

  /* Contrôle 2 — aucun votant ne doit être hors de l'effectif reconstitué.
     Un seul suffirait à prouver que la reconstitution est fausse. */
  const dehors = votants.filter((v) => !membres.has(v));
  if (dehors.length > 0) {
    return {
      absents: null,
      motif: `${dehors.length} votant(s) hors de l'effectif reconstitué`,
    };
  }

  const presents = new Set(votants);
  const absents = [...membres].filter((m) => !presents.has(m)).sort();

  /* Garde-fou arithmétique : la soustraction ne peut pas mentir si les deux
     contrôles précédents sont passés, mais une régression future le pourrait. */
  if (absents.length !== effectifAnnonce - votants.length) {
    return { absents: null, motif: "incohérence arithmétique" };
  }

  return { absents, motif: "démontré" };
}
