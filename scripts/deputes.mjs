/**
 * deputes.mjs — fiches individuelles des députés.
 *
 * Deux mises en garde méthodologiques, qui gouvernent toute la conception de
 * ce fichier :
 *
 * 1. NE PAS PARLER D'ABSENTÉISME. Sur douze mois, 99 % des scrutins sont des
 *    « scrutins publics ordinaires », dont la médiane est de 133 votants sur
 *    577. Ne pas y figurer est la norme, pas un manquement : ces scrutins se
 *    tiennent avec les députés présents en séance, et les groupes recourent
 *    aux délégations de vote. Un taux calculé sur l'ensemble afficherait ~77 %
 *    d'« absence » pour tout le monde — exact et trompeur. On ventile donc par
 *    type de scrutin, et on ne compare qu'à la médiane du groupe.
 *
 * 2. L'ABSENCE N'EST PAS PUBLIÉE. L'Assemblée ne nomme que les votants. On
 *    déduit la non-participation du silence : un député absent des listes d'un
 *    scrutin n'y a pas pris part. Ce raisonnement n'est valide que pour les
 *    scrutins couvrant sa période de mandat — d'où le suivi des dates.
 *
 * 3. UNE MOTION DE CENSURE N'EST PAS UNE MESURE DE PRÉSENCE. L'article 49 de
 *    la Constitution ne fait recenser que les voix *pour* : sur les treize
 *    motions des douze derniers mois, `contre` vaut 0 sans exception.
 *    S'abstenir, s'opposer et être absent y sont indiscernables. Voter une
 *    censure est donc une position politique, comptée comme telle et jamais
 *    mélangée aux taux de participation.
 *
 * La ligne du groupe, elle, n'est pas déduite : `positionMajoritaire` est
 * publiée par l'Assemblée pour chaque groupe et chaque scrutin.
 */

/** Types de scrutin, du plus au moins significatif quant à la présence. */
export const TYPES = {
  solennel: "scrutin public solennel",
  censure: "motion de censure",
  ordinaire: "scrutin public ordinaire",
};

const categorie = (libelle) =>
  libelle === TYPES.solennel ? "solennel"
  : libelle === TYPES.censure ? "censure"
  : "ordinaire";

/* Seules ces deux catégories mesurent une présence. La censure est suivie à
   part, comme une position politique. */
const CATEGORIES = ["solennel", "ordinaire"];

/** Mandats qu'on affiche : les groupes d'amitié noieraient le reste. */
const MANDATS_AFFICHES = new Set([
  "ASSEMBLEE", "GP", "PARPOL", "COMPER", "COMNL", "DELEG", "OFFPAR",
  "BUREAU", "MISINFO", "MISINFOPRE", "MISINFOCOM", "CMP", "CNPS", "CNPE",
  "GOUVERNEMENT", "MINISTERE",
]);

const LIBELLES = {
  ASSEMBLEE: "Mandat de député",
  GP: "Groupe parlementaire",
  PARPOL: "Parti politique",
  COMPER: "Commission permanente",
  COMNL: "Commission",
  DELEG: "Délégation",
  OFFPAR: "Office parlementaire",
  BUREAU: "Bureau de l'Assemblée",
  MISINFO: "Mission d'information",
  MISINFOPRE: "Mission d'information",
  MISINFOCOM: "Mission d'information",
  CMP: "Commission mixte paritaire",
  CNPS: "Conseil ou organisme",
  CNPE: "Conseil ou organisme",
  GOUVERNEMENT: "Gouvernement",
  MINISTERE: "Ministère",
};

const enTableau = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const texte = (v) => (v && typeof v === "object" ? v["#text"] ?? null : v ?? null);

/**
 * État civil, circonscription et mandats, depuis un fichier acteur d'AMO10.
 * `organes` sert à nommer les organes référencés ; un organe inconnu garde son
 * identifiant plutôt que de disparaître.
 */
export function profil(fichierActeur, organes) {
  const a = fichierActeur?.acteur ?? fichierActeur;
  const uid = texte(a?.uid);
  if (!uid) return null;

  const ec = a?.etatCivil?.ident ?? {};
  const fiche = {
    id: uid,
    nom: [ec.prenom, ec.nom].filter(Boolean).join(" ") || uid,
    civilite: ec.civ ?? null,
    profession: a?.profession?.libelleCourant ?? null,
    groupe: null,
    parti: null,
    circonscription: null,
    mandats: [],
  };

  for (const m of enTableau(a?.mandats?.mandat)) {
    const type = m?.typeOrgane;
    const ref = texte(m?.organes?.organeRef);
    const org = ref ? organes.get(ref) : null;
    const fin = m?.dateFin ?? null;
    const qualite = m?.infosQualite?.libQualite ?? null;

    if (type === "GP" && !fin) fiche.groupe = org?.libelleAbrev ?? ref;
    if (type === "PARPOL" && !fin) fiche.parti = org?.libelle ?? ref;

    if (type === "ASSEMBLEE") {
      const lieu = m?.election?.lieu ?? {};
      fiche.circonscription = [lieu.departement, lieu.numCirco && `${lieu.numCirco}e circ.`]
        .filter(Boolean).join(" — ") || null;
    }

    if (!MANDATS_AFFICHES.has(type)) continue;
    fiche.mandats.push({
      type,
      categorie: LIBELLES[type] ?? type,
      organe: org?.libelle ?? org?.libelleAbrev ?? ref ?? null,
      qualite: qualite && qualite !== "Membre" && qualite !== "Membre du" ? qualite : null,
      debut: m?.dateDebut ?? null,
      fin,
    });
  }

  /* Un même organe apparaît deux fois quand le député y exerce une fonction :
     une ligne « Membre » et une ligne « Vice-président ». On ne garde que la
     plus informative. */
  const parOrgane = new Map();
  for (const m of fiche.mandats) {
    const k = `${m.type}|${m.organe}|${m.fin ?? ""}`;
    const garde = parOrgane.get(k);
    if (!garde || (!garde.qualite && m.qualite)) parOrgane.set(k, m);
  }
  fiche.mandats = [...parOrgane.values()];

  /* En cours d'abord, puis du plus récent au plus ancien. */
  fiche.mandats.sort((x, y) =>
    (x.fin ? 1 : 0) - (y.fin ? 1 : 0) || String(y.debut).localeCompare(String(x.debut)));

  return fiche;
}

/**
 * Accumulateur : on lui présente chaque scrutin une fois, il en tire les
 * statistiques de tous les députés concernés.
 */
export function creerAccumulateur() {
  const parDepute = new Map();
  const totaux = { solennel: 0, censure: 0, ordinaire: 0 };

  const vide = () => ({
    participation: { solennel: 0, ordinaire: 0 },
    censuresVotees: 0,          // position politique, pas une présence
    positions: { pour: 0, contre: 0, abstention: 0, nonVotant: 0 },
    aligne: 0,
    diverge: 0,
    divergences: [],   // scrutins où le député s'écarte de la ligne du groupe
    premier: null,
    dernier: null,
  });

  const acc = (id) => {
    if (!parDepute.has(id)) parDepute.set(id, vide());
    return parDepute.get(id);
  };

  /**
   * @param {object} scrutin  { numero, date, titre, typeVote }
   * @param {object} groupes  { ACRONYME: { pour:[id], contre:[id], …, ligne } }
   */
  function ajouter(scrutin, groupes) {
    const cat = categorie(scrutin.typeVote);
    totaux[cat]++;

    for (const [gid, g] of Object.entries(groupes)) {
      for (const position of ["pour", "contre", "abstention", "nonVotant"]) {
        for (const id of g[position] ?? []) {
          const d = acc(id);
          if (cat === "censure") {
            if (position === "pour") d.censuresVotees++;
          } else {
            d.participation[cat]++;
          }
          d.positions[position]++;
          if (!d.premier || scrutin.date < d.premier) d.premier = scrutin.date;
          if (!d.dernier || scrutin.date > d.dernier) d.dernier = scrutin.date;

          /* Alignement : uniquement quand le groupe a une ligne publiée et que
             le député a exprimé un vote. Un « non votant » n'est ni un accord
             ni un désaccord. */
          if (!g.ligne || position === "nonVotant") continue;
          if (position === g.ligne) {
            d.aligne++;
          } else {
            d.diverge++;
            d.divergences.push({
              numero: scrutin.numero,
              date: scrutin.date,
              titre: scrutin.titre,
              groupe: gid,
              ligne: g.ligne,
              vote: position,
            });
          }
        }
      }
    }
  }

  /**
   * Clôture : convertit les compteurs en taux, et calcule la médiane par
   * groupe qui sert de point de comparaison.
   */
  function conclure(profils) {
    const fiches = new Map();

    for (const [id, d] of parDepute) {
      const p = profils.get(id);
      const taux = {};
      for (const c of CATEGORIES) {
        taux[c] = {
          participations: d.participation[c],
          scrutins: totaux[c],
          taux: totaux[c] ? d.participation[c] / totaux[c] : null,
        };
      }
      const exprimes = d.aligne + d.diverge;
      fiches.set(id, {
        ...(p ?? { id, nom: id, mandats: [] }),
        participation: taux,
        censure: { votees: d.censuresVotees, motions: totaux.censure },
        positions: d.positions,
        ligne: {
          exprimes,
          aligne: d.aligne,
          diverge: d.diverge,
          taux: exprimes ? d.aligne / exprimes : null,
        },
        /* Les divergences les plus récentes suffisent : au-delà, la liste
           alourdit le fichier sans rien apprendre. */
        divergences: d.divergences
          .sort((a, b) => b.numero - a.numero)
          .slice(0, 40),
        periode: { premier: d.premier, dernier: d.dernier },
      });
    }

    /* Médiane par groupe et par catégorie : un taux brut ne veut rien dire
       sans savoir ce que font les collègues du même groupe. */
    const medianes = {};
    const parGroupe = new Map();
    for (const f of fiches.values()) {
      if (!f.groupe) continue;
      if (!parGroupe.has(f.groupe)) parGroupe.set(f.groupe, []);
      parGroupe.get(f.groupe).push(f);
    }
    for (const [gid, membres] of parGroupe) {
      medianes[gid] = {};
      for (const c of CATEGORIES) {
        const v = membres.map((m) => m.participation[c].taux)
                         .filter((x) => x !== null).sort((a, b) => a - b);
        medianes[gid][c] = v.length
          ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2)
          : null;
      }
      const l = membres.map((m) => m.ligne.taux).filter((x) => x !== null).sort((a, b) => a - b);
      medianes[gid].ligne = l.length
        ? (l.length % 2 ? l[(l.length - 1) / 2] : (l[l.length / 2 - 1] + l[l.length / 2]) / 2)
        : null;
    }

    return { fiches, totaux, medianes };
  }

  return { ajouter, conclure };
}
