#!/usr/bin/env node
/**
 * ingest.mjs — construit les données statiques du site.
 *
 * Source : open data de l'Assemblée nationale (Licence Ouverte / Etalab 2.0).
 *   - Scrutins  : repository/17/loi/scrutins/Scrutins.json.zip
 *   - Députés   : repository/17/amo/deputes_actifs_mandats_actifs_organes/
 *                 AMO10_deputes_actifs_mandats_actifs_organes.json.zip
 *
 * Pourquoi pas NosDéputés.fr : Regards Citoyens n'assure plus la maintenance
 * au-delà de la 16e législature. Au 26 juillet 2026, nosdeputes.fr/organismes/
 * groupe/json renvoie encore Renaissance et les groupes NUPES. La source ne
 * couvre donc pas la législature visée.
 *
 * Principe : rien n'est publié tant que l'invariant de partition n'est pas
 * vérifié. Si la source change de forme, ce script échoue en nommant les clés
 * qu'il a réellement trouvées, et le site précédent reste en ligne avec les
 * données de la veille — dégradation acceptable. Publier un décompte faux ne
 * l'est pas.
 *
 * Usage :
 *   node scripts/ingest.mjs [--legislature 17] [--mois 12] [--out ./public/donnees]
 *                           [--depuis 0] [--cache ./.cache]
 *   node scripts/ingest.mjs --inspecter   # imprime la forme réelle d'un scrutin
 */

import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import path from "node:path";

import {
  partitionner, compter, parGroupe, resumerAnomalies, CASES,
} from "./partition.mjs";
import { profil, creerAccumulateur } from "./deputes.mjs";
import { analyser, cleTexte } from "../src/intitule.js";
import {
  construireHistorique, fusionnerHistoriques, deduireAbsents,
} from "./absents.mjs";
import { relierDossiers } from "./dossiers.mjs";

const run = promisify(execFile);

const arg = (nom, defaut) => {
  const i = process.argv.indexOf(`--${nom}`);
  return i > -1 ? process.argv[i + 1] : defaut;
};
const drapeau = (nom) => process.argv.includes(`--${nom}`);

const LEGISLATURE = arg("legislature", "17");
const SORTIE = path.resolve(arg("out", "./public/donnees"));
const CACHE = path.resolve(arg("cache", "./.cache"));
const DEPUIS = Number(arg("depuis", 0));

/* Fenêtre glissante. La législature entière représente 8 400 scrutins et 86 Mo,
   recommittés à chaque ingestion : trop lourd pour un dépôt git quotidien, et
   l'index serait chargé à chaque visite. `--mois 0` lève la limite. */
const MOIS = Number(arg("mois", 12));
const DEPUIS_DATE = MOIS > 0
  ? new Date(Date.now() - MOIS * 30.44 * 864e5).toISOString().slice(0, 10)
  : "0000-00-00";

const RACINE = "https://data.assemblee-nationale.fr/static/openData/repository";
const JEUX = {
  scrutins: `${RACINE}/${LEGISLATURE}/loi/scrutins/Scrutins.json.zip`,
  acteurs: `${RACINE}/${LEGISLATURE}/amo/deputes_actifs_mandats_actifs_organes/` +
           `AMO10_deputes_actifs_mandats_actifs_organes.json.zip`,
  /* Historique complet depuis 1997. Indispensable pour nommer les absents :
     AMO10 ignore les députés remplacés en cours de législature, ce qui rend
     l'effectif des groupes systématiquement trop court. */
  historique: `${RACINE}/${LEGISLATURE}/amo/tous_acteurs_mandats_organes_xi_legislature/` +
              `AMO30_tous_acteurs_tous_mandats_tous_organes_historique.json.zip`,
  /* Seule source reliant un scrutin au texte de loi qu'il vise : les actes
     législatifs portent un champ `voteRef`. Les fichiers de scrutin, eux, ne
     référencent aucun dossier. */
  dossiers: `${RACINE}/${LEGISLATURE}/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip`,
};

const CONTACT = process.env.SITE_CONTACT || "contact non renseigné";
const UA = `kivotkoi/1.0 (+${process.env.SITE_URL || "http://localhost:8080"}; ${CONTACT})`;

const LICENCE =
  "Licence Ouverte / Open Licence 2.0 — Assemblée nationale, " +
  "data.assemblee-nationale.fr";

/* ═══════════════════════════════ téléchargement ═══════════════════════════ */

/**
 * Télécharge et décompresse une archive dans `${CACHE}/${nom}`.
 * `unzip` plutôt qu'une dépendance npm : les runners GitHub l'ont déjà, et une
 * dépendance de moins est une surface d'attaque de moins sur une chaîne qui
 * publie des chiffres officiels.
 */
async function recupererArchive(nom, url) {
  const dossier = path.join(CACHE, nom);
  const zip = path.join(CACHE, `${nom}.zip`);
  await mkdir(CACHE, { recursive: true });

  console.log(`↓ ${nom} — ${url}`);
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`);

  const octets = Buffer.from(await r.arrayBuffer());
  if (octets.length < 1024) {
    throw new Error(`Archive ${nom} suspecte : ${octets.length} octets.`);
  }
  await writeFile(zip, octets);

  await rm(dossier, { recursive: true, force: true });
  await mkdir(dossier, { recursive: true });
  await run("unzip", ["-q", "-o", zip, "-d", dossier], { maxBuffer: 64 << 20 });

  console.log(`  ${(octets.length / 1e6).toFixed(1)} Mo téléchargés`);
  return dossier;
}

/** Liste récursive des .json d'un dossier. */
async function fichiersJson(dossier) {
  const { stdout } = await run("find", [dossier, "-name", "*.json", "-type", "f"],
                               { maxBuffer: 64 << 20 });
  return stdout.split("\n").filter(Boolean).sort();
}

const lire = async (f) => JSON.parse(await readFile(f, "utf8"));

/**
 * Charge tous les .json d'un sous-dossier de l'archive.
 *
 * L'AN nomme AMO10 « composite », mais l'archive contient en réalité un
 * fichier par entité : json/acteur/PA1008.json, json/organe/PO845401.json…
 * Soit ~7 700 fichiers. Lire le premier venu en le prenant pour un index
 * global — l'erreur de la première version — donnait zéro groupe.
 */
async function lireDossier(racine, nom) {
  const tous = await fichiersJson(racine);
  const fichiers = tous.filter((f) => f.includes(`/${nom}/`));

  if (fichiers.length === 0) {
    const dispo = [...new Set(tous.map((f) => path.basename(path.dirname(f))))];
    throw new Error(
      `Aucun fichier dans ${nom}/ sous ${racine}. ` +
      `Sous-dossiers présents : ${dispo.join(", ") || "(aucun)"}.`
    );
  }

  /* Lecture par lots : un Promise.all sur les ~7 100 organes ouvre autant de
     descripteurs d'un coup et déclenche EMFILE (limite à 256 sur macOS par
     défaut). Le gain de parallélisme au-delà d'une centaine est nul de toute
     façon, le goulot étant le disque. */
  const LOT = 64;
  const out = [];
  for (let i = 0; i < fichiers.length; i += LOT) {
    out.push(...await Promise.all(fichiers.slice(i, i + LOT).map(lire)));
  }
  return out;
}

/* ═══════════════════════════════ normalisation ════════════════════════════ */

/**
 * Au lieu de laisser passer `undefined`, dit ce qui a réellement été trouvé.
 * C'est ce garde-fou qui manquait dans la version précédente du projet : elle
 * lisait des champs inexistants et publiait des vides d'apparence normale.
 */
function exiger(objet, chemin, contexte) {
  const valeur = chemin.split(".").reduce((o, k) => o?.[k], objet);
  if (valeur === undefined || valeur === null) {
    const parent = chemin.split(".").slice(0, -1).reduce((o, k) => o?.[k], objet);
    throw new Error(
      `${contexte} : champ « ${chemin} » absent. ` +
      `Clés présentes : ${Object.keys(parent ?? objet ?? {}).join(", ") || "(aucune)"}. ` +
      `Lance « npm run ingest -- --inspecter » pour voir la forme réelle.`
    );
  }
  return valeur;
}

/** L'AN sérialise un tableau d'un seul élément comme un objet nu. */
export const enTableau = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** L'AN emballe parfois les scalaires : { "#text": "PA123" }. */
export const texte = (v) => (v && typeof v === "object" ? v["#text"] ?? null : v ?? null);

/**
 * Table PO###### → { id: acronyme, nom }, construite depuis le jeu « acteurs ».
 * Les votes ne référencent que des identifiants ; sans cette table on
 * n'afficherait que des PO123456.
 */
export function construireOrganes(fichiers) {
  const table = new Map();
  for (const f of enTableau(fichiers)) {
    const o = f?.organe ?? f;
    if (o?.codeType !== "GP") continue; // groupe politique
    const uid = texte(o.uid);
    if (!uid) continue;
    /* Les groupes dissous sont conservés : un scrutin ancien peut encore les
       référencer, et mieux vaut afficher « UDR » qu'un « PO872880 » nu. */
    table.set(uid, {
      id: o.libelleAbrev ?? o.libelleAbrege ?? uid,
      nom: o.libelle ?? o.libelleAbrev ?? uid,
    });
  }
  if (table.size === 0) {
    throw new Error(
      "Aucun groupe politique (codeType « GP ») parmi les organes lus. " +
      "La structure de AMO10 a changé — inspecte .cache/acteurs/json/organe/."
    );
  }
  return table;
}

/**
 * Référentiel complet PO###### → organe brut, tous types confondus.
 * `construireOrganes` ne retient que les groupes politiques ; les fiches de
 * député ont besoin des commissions, délégations et partis.
 */
export function construireTousOrganes(fichiers) {
  const table = new Map();
  for (const f of enTableau(fichiers)) {
    const o = f?.organe ?? f;
    const uid = texte(o?.uid);
    if (uid) table.set(uid, o);
  }
  return table;
}

/** Table PA###### → nom affichable. */
export function construireActeurs(fichiers) {
  const table = new Map();
  for (const f of enTableau(fichiers)) {
    const a = f?.acteur ?? f;
    const uid = texte(a?.uid);
    if (!uid) continue;
    const ec = a?.etatCivil?.ident;
    table.set(uid, [ec?.prenom, ec?.nom].filter(Boolean).join(" ") || uid);
  }
  if (table.size === 0) {
    throw new Error(
      "Aucun acteur lisible dans AMO10 — inspecte .cache/acteurs/json/acteur/."
    );
  }
  return table;
}

/**
 * Table PA###### → PO###### de son groupe politique actuel, tirée des mandats.
 * Sert uniquement à réparer les références de groupe cassées (voir
 * `resoudreGroupe`), jamais à réécrire une référence valide.
 */
export function construireAppartenances(fichiers) {
  const table = new Map();
  for (const f of enTableau(fichiers)) {
    const a = f?.acteur ?? f;
    const uid = texte(a?.uid);
    if (!uid) continue;
    for (const m of enTableau(a?.mandats?.mandat)) {
      if (m?.typeOrgane !== "GP" || m?.dateFin) continue;
      const ref = texte(m?.organes?.organeRef);
      if (ref) table.set(uid, ref);
    }
  }
  return table;
}

/**
 * Résout le groupe d'une ventilation de vote.
 *
 * L'export de l'Assemblée contient deux catégories de références cassées :
 *  - des groupes dissous, absents du référentiel des mandats *actifs*
 *    (PO847173, présent dans 3 041 scrutins de la 17e législature) ;
 *  - des identifiants corrompus — « PO0 » apparaît dans 14 scrutins, toujours
 *    à la place du RN et jamais en plus, avec le bon effectif.
 *
 * Plutôt que de coder ces cas en dur, on interroge les députés eux-mêmes :
 * si une nette majorité des votants listés appartient aujourd'hui au même
 * groupe, c'est celui-là. Déduction fondée sur la donnée, et signalée comme
 * telle plutôt que présentée comme une lecture directe.
 *
 * @returns {{id:string, nom:string, deduit:boolean}}
 */
export function resoudreGroupe(organeRef, acteurRefs, organes, appartenances) {
  const direct = organes.get(organeRef);
  if (direct) return { ...direct, deduit: false };

  const urnes = new Map();
  for (const ref of acteurRefs) {
    const po = appartenances.get(ref);
    if (po) urnes.set(po, (urnes.get(po) ?? 0) + 1);
  }

  const [gagnant, voix] = [...urnes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const meta = gagnant && organes.get(gagnant);

  /* Seuil volontairement haut : sous 70 % d'accord, on préfère afficher un
     identifiant brut qu'un nom de groupe potentiellement faux. */
  if (meta && acteurRefs.length > 0 && voix / acteurRefs.length >= 0.7) {
    return { ...meta, deduit: true };
  }
  return { id: organeRef, nom: organeRef, deduit: false };
}

/**
 * Les quatre cases nominatives de l'AN portent des noms au pluriel.
 * « nonVotant » n'est pas « absent » : le premier est présent en séance mais ne
 * prend pas part au vote. Les fondre fabrique un faux taux d'absentéisme.
 */
const CASES_AN = [
  ["pours", "pour"],
  ["contres", "contre"],
  ["abstentions", "abstention"],
  ["nonVotants", "nonVotant"],
];

/** Les libellés de `positionMajoritaire` suivent la même famille de variantes
    que les positions individuelles. On réutilise le même vocabulaire. */
const canonPosition = (v) => {
  const c = String(v ?? "").toLowerCase().trim();
  return c === "pour" ? "pour"
    : c === "contre" ? "contre"
    : c.startsWith("abstention") ? "abstention"
    : null;
};

/** Aplatit un scrutin AN en la liste que `partitionner()` sait consommer. */
export function normaliserScrutin(brut, organes, acteurs, appartenances = new Map()) {
  const s = brut?.scrutin ?? brut;
  const numero = Number(exiger(s, "numero", "scrutin"));
  const date = String(exiger(s, "dateScrutin", `scrutin ${numero}`)).slice(0, 10);
  const titre = String(exiger(s, "titre", `scrutin ${numero}`));

  const groupesBruts = enTableau(
    s?.ventilationVotes?.organe?.groupes?.groupe ??
    s?.ventilationVotes?.organe?.groupes
  );
  if (groupesBruts.length === 0) {
    throw new Error(
      `scrutin ${numero} : aucune ventilation par groupe. ` +
      `Clés de ventilationVotes : ` +
      `${Object.keys(s?.ventilationVotes ?? {}).join(", ") || "(aucune)"}.`
    );
  }

  const votes = [];
  const effectifs = {};   // acronyme -> membres annoncés par l'Assemblée
  const lignes = {};      // acronyme -> position majoritaire publiée par l'AN
  const deduits = [];     // groupes dont la référence a dû être réparée

  for (const g of groupesBruts) {
    const nominatif = g?.vote?.decompteNominatif;
    if (!nominatif) continue; // scrutin publié sans décompte nominatif

    /* Deux passes : d'abord les votants, dont on a besoin pour résoudre le
       groupe quand sa référence est cassée, ensuite l'enregistrement. */
    const listes = CASES_AN.map(([cleAN, position]) => [
      position,
      enTableau(nominatif[cleAN]?.votant ?? nominatif[cleAN])
        .map((v) => texte(v?.acteurRef))
        .filter(Boolean),
    ]);
    const tous = listes.flatMap(([, l]) => l);

    const meta = resoudreGroupe(g.organeRef, tous, organes, appartenances);
    if (meta.deduit) deduits.push(`${g.organeRef}→${meta.id}`);

    for (const [position, l] of listes) {
      for (const ref of l) {
        votes.push({ id: ref, nom: acteurs.get(ref) ?? ref, groupe: meta.id, position });
      }
    }

    /* `nombreMembresGroupe` est la seule trace des absents : l'Assemblée ne
       nomme que les députés ayant pris part au vote. On garde donc l'effectif
       pour pouvoir compter les absents sans prétendre les identifier. */
    const membres = Number(g?.nombreMembresGroupe);
    if (Number.isFinite(membres)) {
      effectifs[meta.id] = (effectifs[meta.id] ?? 0) + membres;
    }

    /* La ligne du groupe est publiée par l'Assemblée : on ne la déduit pas
       d'un décompte, on la lit. */
    const ligne = canonPosition(g?.vote?.positionMajoritaire);
    if (ligne) lignes[meta.id] = ligne;
  }

  if (votes.length === 0) {
    throw new Error(`scrutin ${numero} : aucun vote nominatif exploitable.`);
  }

  return {
    numero,
    date,
    titre,
    objet: s?.objet?.libelle ?? null,
    sort: s?.sort?.libelle ?? s?.sort?.code ?? null,
    typeVote: s?.typeVote?.libelleTypeVote ?? null,
    votes,
    effectifs,
    lignes,
    deduits,
  };
}

/* ═══════════════════════════════ mode inspection ══════════════════════════ */

/** Imprime les chemins réels d'un scrutin, pour ajuster le code sans deviner. */
async function inspecter() {
  const dossier = await recupererArchive("scrutins", JEUX.scrutins);
  const [premier] = await fichiersJson(dossier);
  if (!premier) throw new Error("Archive scrutins vide.");
  const s = (await lire(premier))?.scrutin ?? (await lire(premier));

  const chemins = (o, prefixe = "") =>
    Object.entries(o ?? {}).flatMap(([k, v]) =>
      v && typeof v === "object"
        ? chemins(Array.isArray(v) ? v[0] : v, `${prefixe}${k}${Array.isArray(v) ? "[]" : ""}.`)
        : [`${prefixe}${k}`]
    );

  console.log(`\nFichier : ${path.basename(premier)}\n`);
  console.log([...new Set(chemins(s))].sort().join("\n"));
}

/* ═══════════════════════════════ programme ════════════════════════════════ */

async function main() {
  if (drapeau("inspecter")) return inspecter();

  await mkdir(SORTIE, { recursive: true });

  const dossierActeurs = await recupererArchive("acteurs", JEUX.acteurs);
  const fichiersActeur = await lireDossier(dossierActeurs, "acteur");
  const fichiersOrgane = await lireDossier(dossierActeurs, "organe");
  const organes = construireOrganes(fichiersOrgane);
  const tousOrganes = construireTousOrganes(fichiersOrgane);
  const acteurs = construireActeurs(fichiersActeur);
  const appartenances = construireAppartenances(fichiersActeur);

  const profils = new Map();
  for (const f of fichiersActeur) {
    const p = profil(f, tousOrganes);
    if (p) profils.set(p.id, p);
  }
  const accumulateur = creerAccumulateur();

  /* Historique des appartenances, pour nommer les absents. AMO30 est plus
     complet mais republié moins souvent qu'AMO10 : on fusionne les deux. Si le
     téléchargement échoue, on continue sans — les absents resteront anonymes,
     ce qui est le comportement d'avant, pas une régression. */
  let historique = construireHistorique(fichiersActeur);
  try {
    const dossierHisto = await recupererArchive("historique", JEUX.historique);
    const fichiersHisto = await lireDossier(dossierHisto, "acteur");
    historique = fusionnerHistoriques(historique, construireHistorique(fichiersHisto));
    console.log(`${historique.size} députés dans l'historique des appartenances`);
  } catch (e) {
    console.warn(`historique indisponible (${e.message}) — absents non nommés`);
  }
  console.log(
    `${acteurs.size} députés · ${organes.size} groupes politiques ` +
    `(${[...organes.values()].map((o) => o.id).sort().join(", ")})`
  );

  const dossierScrutins = await recupererArchive("scrutins", JEUX.scrutins);
  const fichiers = await fichiersJson(dossierScrutins);
  console.log(`${fichiers.length} scrutin(s) dans l'archive`);

  const resume = [];
  const echecs = [];
  const noms = new Map();      // PA###### -> nom, pour deputes.json
  const deduits = new Map();   // "PO0→RN" -> nombre de scrutins concernés
  const nomsGroupes = new Map();
  for (const o of organes.values()) nomsGroupes.set(o.id, o.nom);

  let ignores = 0;
  let dernier = null;      // composition du scrutin le plus récent
  let demontres = 0;       // couples groupe×scrutin où les absents sont nommés
  let nonDemontres = 0;

  for (const [i, fichier] of fichiers.entries()) {
    let etiquette = path.basename(fichier);
    try {
      const s = normaliserScrutin(await lire(fichier), organes, acteurs, appartenances);
      etiquette = s.numero;
      if (s.numero < DEPUIS || s.date < DEPUIS_DATE) { ignores++; continue; }

      const { partition, anomalies, total } = partitionner(s.votes);

      /* Refus de publier : un député dans deux cases, ou une position non
         reconnue, invalide tout le décompte du scrutin. */
      const bloquantes = anomalies.filter((a) =>
        ["doublon_contradictoire", "position_inconnue", "invariant_rompu", "id_manquant"]
          .includes(a.type)
      );
      if (bloquantes.length) throw new Error(`invariant : ${resumerAnomalies(bloquantes)}`);

      for (const d of s.deduits) deduits.set(d, (deduits.get(d) ?? 0) + 1);

      const parG = parGroupe(partition);
      const compteurs = compter(partition);

      /* Les absents ne sont pas nommés par la source : on ne connaît que leur
         nombre, par différence entre l'effectif du groupe et les votants. */
      /* Les fichiers ne portent que des identifiants ; les noms vivent dans un
         unique deputes.json. Les répéter à chaque scrutin quadruplait le poids
         de la sortie — 72 Mo au lieu de 18 sur douze mois. */
      const groupes = {};
      let membresTotal = 0;
      for (const [gid, cases] of Object.entries(parG)) {
        const listes = Object.fromEntries(
          CASES.map((c) => [c, cases[c].map((d) => {
            noms.set(d.id, d.nom);
            return d.id;
          })])
        );
        const votants = CASES.reduce((t, c) => t + listes[c].length, 0);
        const membres = s.effectifs[gid] ?? votants;
        membresTotal += membres;

        /* ATTENTION aux deux champs voisins :
             `absent`  — LISTE, héritée de CASES. Toujours vide pour
                         l'Assemblée : ses fichiers ne recensent que les
                         pours, contres, abstentions et non-votants.
             `absents` — NOMBRE, déduit de l'effectif du groupe moins les
                         votants nommés. C'est la seule trace des absents.
           Les confondre à l'affichage donnait une colonne « aucun » sous un
           en-tête annonçant « 32 absents ». */
        /* L'Assemblée ne nomme pas les absents, mais on peut les démontrer :
           effectif du groupe à cette date, moins les votants. La déduction
           n'est retenue que si elle survit à deux contrôles — voir
           scripts/absents.mjs. Sinon, seul le nombre est publié. */
        const nommes = deduireAbsents({
          acronyme: gid,
          date: s.date,
          effectifAnnonce: membres,
          votants: CASES.flatMap((c) => listes[c]),
          historique,
          organes,
        });
        if (nommes.absents) demontres++; else nonDemontres++;

        groupes[gid] = {
          ...listes,
          membres,
          absents: Math.max(0, membres - votants),
          absentsNommes: nommes.absents ?? undefined,
          ligne: s.lignes[gid] ?? null,
        };
        for (const id of nommes.absents ?? []) noms.set(id, acteurs.get(id) ?? id);
      }

      accumulateur.ajouter(
        { numero: s.numero, date: s.date, titre: s.titre, typeVote: s.typeVote },
        groupes
      );

      /* Le titre publié mêle le sujet du texte et l'objet procédural. On les
         sépare à l'ingestion pour que l'interface puisse afficher « de quoi il
         s'agit » avant « ce sur quoi on vote ». */
      const intitule = analyser(s.titre);

      const fichierSortie = {
        numero: s.numero,
        date: s.date,
        titre: s.titre,
        texte: intitule.texte,
        objetVote: intitule.objet,
        stade: intitule.stade,
        dossier: cleTexte(s.titre),
        objet: s.objet,
        sort: s.sort,
        typeVote: s.typeVote,
        total,
        membres: membresTotal,
        compteurs: { ...compteurs, absentsNonNommes: Math.max(0, membresTotal - total) },
        groupes,
        anomalies: resumerAnomalies(anomalies),
        groupesDeduits: s.deduits.length ? s.deduits : undefined,
        source: JEUX.scrutins,
        ingere_le: new Date().toISOString(),
        licence: LICENCE,
      };

      await writeFile(
        path.join(SORTIE, `scrutin-${s.numero}.json`),
        JSON.stringify(fichierSortie)
      );

      /* Index volontairement maigre : il est chargé à chaque visite, alors que
         les compteurs détaillés vivent déjà dans le fichier du scrutin, lui
         chargé à la demande. */
      /* L'index ne porte plus le titre brut : `texte` + `objetVote` le
         recomposent à l'affichage, et c'est cette découpe que l'interface
         utilise. Éviter le doublon garde l'index sous les deux mégaoctets. */
      resume.push({
        numero: s.numero,
        date: s.date,
        texte: intitule.texte,
        objetVote: intitule.objet,
        stade: intitule.stade,
        dossier: cleTexte(s.titre),
        sort: s.sort,
      });

      if (!dernier || s.numero > dernier.numero) {
        dernier = {
          numero: s.numero,
          groupes: Object.entries(groupes)
            .map(([id, g]) => ({ id, nom: nomsGroupes.get(id) ?? id, sieges: g.membres }))
            .sort((a, b) => b.sieges - a.sieges),
        };
      }

      if (i % 500 === 0) console.log(`  ${i + 1}/${fichiers.length}`);
    } catch (e) {
      echecs.push({ scrutin: etiquette, raison: e.message });
      console.error(`  ✗ ${etiquette} : ${e.message}`);
    }
  }

  resume.sort((a, b) => b.numero - a.numero);

  /* Rattachement au dossier législatif. Fait après la boucle : il faut la clé
     de texte de chaque scrutin, produite pendant. En cas d'échec du
     téléchargement, les liens manquent — le site reste correct sans eux. */
  /* Un dictionnaire clé → dossier, et non une copie sur chaque scrutin : les
     URL se reconstruisent à l'affichage par `liensTexte()`. Écrites en toutes
     lettres sur les 5 102 scrutins concernés, elles portaient l'index de 1,4 à
     3,75 Mo pour une centaine d'entrées réellement distinctes. */
  const dossiersParCle = {};
  try {
    const dossierDL = await recupererArchive("dossiers", JEUX.dossiers);
    const fichiersDL = await lireDossier(dossierDL, "dossierParlementaire");
    const cleParScrutin = new Map(resume.map((s) => [s.numero, s.dossier]));
    const { parCle, directs, collisions } =
      relierDossiers(fichiersDL, cleParScrutin, LEGISLATURE);

    for (const [cle, d] of parCle) {
      dossiersParCle[cle] = { uid: d.uid, chemin: d.chemin, depot: d.depot, titre: d.titre };
    }
    const relies = resume.filter((s) => dossiersParCle[s.dossier]).length;
    console.log(
      `\nDossiers législatifs : ${directs} scrutin(s) cité(s) directement, ` +
      `propagés à ${relies}/${resume.length} (${((100 * relies) / resume.length).toFixed(1)} %)` +
      (collisions.length ? ` · ${collisions.length} clé(s) ambiguë(s) écartée(s)` : "")
    );
  } catch (e) {
    console.warn(`dossiers législatifs indisponibles (${e.message}) — sans liens`);
  }

  /* La composition vient du scrutin le plus récent, pas d'un cumul sur la
     législature : additionner les maxima par groupe recensait 847 sièges pour
     une assemblée qui en compte 577, les remplacements et changements de
     groupe étant comptés plusieurs fois. */
  const groupes = dernier?.groupes ?? [];

  /* Répertoire des noms, chargé une fois pour tous les scrutins. Il contient
     aussi les députés remplacés en cours de législature, qui ne figurent plus
     dans le jeu des mandats actifs. */
  await writeFile(
    path.join(SORTIE, "deputes.json"),
    JSON.stringify(Object.fromEntries([...noms].sort((a, b) => a[0].localeCompare(b[0]))))
  );

  /* Fiches individuelles : un fichier par député, chargé à la demande.
     Les mettre dans un index global ajouterait plusieurs mégaoctets au
     chargement initial pour une page que peu de visiteurs ouvriront. */
  const { fiches, totaux, medianes } = accumulateur.conclure(profils);
  await mkdir(path.join(SORTIE, "depute"), { recursive: true });
  for (const [id, fiche] of fiches) {
    await writeFile(
      path.join(SORTIE, "depute", `${id}.json`),
      JSON.stringify({ ...fiche, medianesGroupe: medianes[fiche.groupe] ?? null, totaux })
    );
  }
  console.log(`\n${fiches.size} fiche(s) de député`);

  await writeFile(
    path.join(SORTIE, "index.json"),
    JSON.stringify({
      legislature: Number(LEGISLATURE),
      groupes,
      dossiers: dossiersParCle,
      scrutins: resume,
      depuis: DEPUIS_DATE,
      genere_le: new Date().toISOString(),
      source: JEUX.scrutins,
      licence: LICENCE,
    })
  );

  /* Ménage des fichiers devenus hors périmètre.
     Sans lui, `public/donnees/` ne fait que grossir : le passage d'une
     ingestion sur toute la législature à une fenêtre de douze mois laisse
     3 000 fichiers orphelins, que le site ne référence plus mais que git
     conserve indéfiniment. La suppression n'intervient qu'après une
     ingestion réussie — jamais avant, sous peine de vider le site si
     l'archive de l'Assemblée est indisponible. */
  const attendus = new Set([
    "index.json", "deputes.json",
    ...resume.map((s) => `scrutin-${s.numero}.json`),
  ]);
  let supprimes = 0;
  for (const f of await readdir(SORTIE)) {
    if (!f.endsWith(".json") || attendus.has(f)) continue;
    await rm(path.join(SORTIE, f));
    supprimes++;
  }
  const fichesAttendues = new Set([...fiches.keys()].map((id) => `${id}.json`));
  for (const f of await readdir(path.join(SORTIE, "depute"))) {
    if (!f.endsWith(".json") || fichesAttendues.has(f)) continue;
    await rm(path.join(SORTIE, "depute", f));
    supprimes++;
  }
  if (supprimes) console.log(`${supprimes} fichier(s) hors périmètre supprimé(s)`);

  if (deduits.size) {
    console.log("\nRéférences de groupe réparées par déduction :");
    for (const [d, n] of [...deduits].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${d} — ${n} scrutin(s)`);
    }
  }

  const totalCouples = demontres + nonDemontres;
  if (totalCouples > 0) {
    console.log(
      `\nAbsents nommés : ${demontres}/${totalCouples} couples groupe×scrutin ` +
      `(${((100 * demontres) / totalCouples).toFixed(1)} %) — ` +
      `les autres restent anonymes, faute de démonstration`
    );
  }

  console.log(
    `\n${resume.length} scrutin(s) publié(s) · ${ignores} hors période · ` +
    `${echecs.length} écarté(s) · ` +
    `${groupes.reduce((t, g) => t + g.sieges, 0)} sièges au scrutin ${dernier?.numero ?? "—"}`
  );

  if (resume.length === 0) {
    console.error("\nAucun scrutin publiable. Publication annulée.");
    process.exit(1);
  }

  /* Un échec isolé (scrutin sans décompte nominatif) ne doit pas bloquer la
     publication. Un échec massif signale un changement de format. */
  if (fichiers.length > 10 && echecs.length > fichiers.length * 0.1) {
    console.error("\nPlus de 10 % d'échecs — format probablement modifié. Publication annulée.");
    process.exit(1);
  }
}

/* Ne s'exécute que si le fichier est lancé directement. Les tests importent
   les fonctions de normalisation sans déclencher un téléchargement. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("\nÉchec de l'ingestion :", e.message);
    process.exit(1);
  });
}
