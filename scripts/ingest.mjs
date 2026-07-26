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
 *   node scripts/ingest.mjs [--legislature 17] [--out ./public/donnees]
 *                           [--depuis 0] [--cache ./.cache]
 *   node scripts/ingest.mjs --inspecter   # imprime la forme réelle d'un scrutin
 */

import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import path from "node:path";

import {
  partitionner, compter, parGroupe, resumerAnomalies, CASES,
} from "./partition.mjs";

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

const RACINE = "https://data.assemblee-nationale.fr/static/openData/repository";
const JEUX = {
  scrutins: `${RACINE}/${LEGISLATURE}/loi/scrutins/Scrutins.json.zip`,
  acteurs: `${RACINE}/${LEGISLATURE}/amo/deputes_actifs_mandats_actifs_organes/` +
           `AMO10_deputes_actifs_mandats_actifs_organes.json.zip`,
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
export function construireOrganes(racine) {
  const table = new Map();
  const source = racine?.export?.organes?.organe ?? racine?.organes?.organe;
  for (const o of enTableau(source)) {
    if (o?.codeType !== "GP") continue; // groupe politique
    const uid = texte(o.uid);
    if (!uid) continue;
    table.set(uid, {
      id: o.libelleAbrev ?? uid,
      nom: o.libelle ?? o.libelleAbrev ?? uid,
    });
  }
  if (table.size === 0) {
    throw new Error(
      "Aucun groupe politique (codeType « GP ») dans le jeu acteurs. " +
      "La structure de AMO10 a changé — inspecte le fichier décompressé."
    );
  }
  return table;
}

/** Table PA###### → nom affichable. */
export function construireActeurs(racine) {
  const table = new Map();
  const source = racine?.export?.acteurs?.acteur ?? racine?.acteurs?.acteur;
  for (const a of enTableau(source)) {
    const uid = texte(a?.uid);
    if (!uid) continue;
    const ec = a?.etatCivil?.ident;
    table.set(uid, [ec?.prenom, ec?.nom].filter(Boolean).join(" ") || uid);
  }
  if (table.size === 0) {
    throw new Error("Aucun acteur dans AMO10. La structure a changé.");
  }
  return table;
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

/** Aplatit un scrutin AN en la liste que `partitionner()` sait consommer. */
export function normaliserScrutin(brut, organes, acteurs) {
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
  for (const g of groupesBruts) {
    const meta = organes.get(g.organeRef) ?? { id: g.organeRef, nom: g.organeRef };
    const nominatif = g?.vote?.decompteNominatif;
    if (!nominatif) continue; // scrutin publié sans décompte nominatif

    for (const [cleAN, position] of CASES_AN) {
      for (const v of enTableau(nominatif[cleAN]?.votant ?? nominatif[cleAN])) {
        const ref = texte(v?.acteurRef);
        if (!ref) continue;
        votes.push({ id: ref, nom: acteurs.get(ref) ?? ref, groupe: meta.id, position });
      }
    }
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
  const [fichierActeurs] = await fichiersJson(dossierActeurs);
  if (!fichierActeurs) throw new Error("Archive acteurs vide.");
  const racineActeurs = await lire(fichierActeurs);

  const organes = construireOrganes(racineActeurs);
  const acteurs = construireActeurs(racineActeurs);
  console.log(`${acteurs.size} députés · ${organes.size} groupes politiques`);

  const dossierScrutins = await recupererArchive("scrutins", JEUX.scrutins);
  const fichiers = await fichiersJson(dossierScrutins);
  console.log(`${fichiers.length} scrutin(s) dans l'archive`);

  const resume = [];
  const echecs = [];
  const effectifs = new Map(); // acronyme -> effectif maximal observé
  const nomsGroupes = new Map();
  for (const o of organes.values()) nomsGroupes.set(o.id, o.nom);

  for (const [i, fichier] of fichiers.entries()) {
    let etiquette = path.basename(fichier);
    try {
      const s = normaliserScrutin(await lire(fichier), organes, acteurs);
      etiquette = s.numero;
      if (s.numero < DEPUIS) continue;

      const { partition, anomalies, total } = partitionner(s.votes);

      /* Refus de publier : un député dans deux cases, ou une position non
         reconnue, invalide tout le décompte du scrutin. */
      const bloquantes = anomalies.filter((a) =>
        ["doublon_contradictoire", "position_inconnue", "invariant_rompu", "id_manquant"]
          .includes(a.type)
      );
      if (bloquantes.length) throw new Error(`invariant : ${resumerAnomalies(bloquantes)}`);

      const groupes = parGroupe(partition);
      for (const [gid, cases] of Object.entries(groupes)) {
        const n = CASES.reduce((t, c) => t + cases[c].length, 0);
        effectifs.set(gid, Math.max(effectifs.get(gid) ?? 0, n));
      }

      await writeFile(
        path.join(SORTIE, `scrutin-${s.numero}.json`),
        JSON.stringify({
          numero: s.numero,
          date: s.date,
          titre: s.titre,
          objet: s.objet,
          sort: s.sort,
          typeVote: s.typeVote,
          total,
          compteurs: compter(partition),
          groupes: Object.fromEntries(
            Object.entries(groupes).map(([g, cases]) => [
              g,
              Object.fromEntries(
                CASES.map((c) => [c, cases[c].map((d) => ({ id: d.id, nom: d.nom }))])
              ),
            ])
          ),
          anomalies: resumerAnomalies(anomalies),
          source: JEUX.scrutins,
          ingere_le: new Date().toISOString(),
          licence: LICENCE,
        })
      );

      resume.push({
        numero: s.numero, date: s.date, titre: s.titre,
        objet: s.objet, sort: s.sort, total, compteurs: compter(partition),
      });

      if (i % 100 === 0) console.log(`  ${i + 1}/${fichiers.length}`);
    } catch (e) {
      echecs.push({ scrutin: etiquette, raison: e.message });
      console.error(`  ✗ ${etiquette} : ${e.message}`);
    }
  }

  resume.sort((a, b) => b.numero - a.numero);

  const groupes = [...effectifs.entries()]
    .map(([id, sieges]) => ({ id, nom: nomsGroupes.get(id) ?? id, sieges }))
    .sort((a, b) => b.sieges - a.sieges);

  await writeFile(
    path.join(SORTIE, "index.json"),
    JSON.stringify({
      legislature: Number(LEGISLATURE),
      groupes,
      scrutins: resume,
      genere_le: new Date().toISOString(),
      source: JEUX.scrutins,
      licence: LICENCE,
    })
  );

  console.log(
    `\n${resume.length} scrutin(s) publié(s) · ${echecs.length} écarté(s) · ` +
    `${groupes.reduce((t, g) => t + g.sieges, 0)} sièges recensés`
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
