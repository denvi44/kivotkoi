import test from "node:test";
import assert from "node:assert/strict";

import {
  normaliserScrutin, construireOrganes, construireActeurs, enTableau, texte,
} from "../scripts/ingest.mjs";
import { partitionner, compter } from "../scripts/partition.mjs";

/* Échantillon reproduisant la forme RÉELLE du jeu AMO10, relevée le
   26 juillet 2026 dans l'archive décompressée :
     - un fichier par entité, chacun avec une clé racine `acteur` ou `organe` ;
     - `uid` des acteurs emballé dans { "#text": … }, celui des organes nu ;
     - les groupes politiques portent codeType « GP ».
   Les identifiants sont fictifs ; seule la structure compte. */
const FICHIERS_ACTEUR = [
  { acteur: { uid: { "@xsi:type": "IdActeur_type", "#text": "PA1" }, etatCivil: { ident: { civ: "Mme", prenom: "Camille", nom: "Garonne" } } } },
  { acteur: { uid: { "#text": "PA2" }, etatCivil: { ident: { prenom: "Julien", nom: "Vézère" } } } },
  { acteur: { uid: { "#text": "PA3" }, etatCivil: { ident: { prenom: "Awa", nom: "Lozère" } } } },
  { acteur: { uid: { "#text": "PA4" }, etatCivil: { ident: { prenom: "Nadia", nom: "Ardèche" } } } },
];

const FICHIERS_ORGANE = [
  { organe: { uid: "PO1", codeType: "GP", libelleAbrev: "EPR", libelle: "Ensemble pour la République", viMoDe: { dateFin: null } } },
  { organe: { uid: "PO2", codeType: "GP", libelleAbrev: "RN", libelle: "Rassemblement National", viMoDe: { dateFin: null } } },
  { organe: { uid: "PO9", codeType: "COMPER", libelleAbrev: "CFIN", libelle: "Commission des finances" } },
  { organe: { uid: "PO7", codeType: "CIRCONSCRIPTION", libelle: "Gironde, 1ère circonscription" } },
];

/* Le groupe RN n'a qu'un seul « votant » : l'AN le sérialise alors comme un
   objet nu et non comme un tableau. C'est le piège classique de ce format. */
const SCRUTIN_AN = {
  scrutin: {
    uid: "VTANR5L17V42",
    numero: "42",
    dateScrutin: "2026-03-11T00:00:00.000+01:00",
    titre: "Ensemble du projet de loi",
    objet: { libelle: "Article 1er" },
    sort: { code: "adopté", libelle: "adopté" },
    typeVote: { libelleTypeVote: "scrutin public ordinaire" },
    ventilationVotes: {
      organe: {
        groupes: {
          groupe: [
            {
              organeRef: "PO1",
              vote: {
                decompteNominatif: {
                  pours: { votant: [{ acteurRef: "PA1" }, { acteurRef: "PA2" }] },
                  contres: null,
                  abstentions: { votant: { acteurRef: "PA3" } },
                  nonVotants: null,
                },
              },
            },
            {
              organeRef: "PO2",
              vote: {
                decompteNominatif: {
                  pours: null,
                  contres: { votant: { acteurRef: "PA4" } },
                  abstentions: null,
                  nonVotants: null,
                },
              },
            },
          ],
        },
      },
    },
  },
};

test("enTableau absorbe l'objet nu, le tableau et le null", () => {
  assert.deepEqual(enTableau(null), []);
  assert.deepEqual(enTableau({ a: 1 }), [{ a: 1 }]);
  assert.deepEqual(enTableau([1, 2]), [1, 2]);
});

test("texte déballe les scalaires emballés par l'AN", () => {
  assert.equal(texte({ "#text": "PA1" }), "PA1");
  assert.equal(texte("PA1"), "PA1");
  assert.equal(texte(null), null);
});

test("seuls les organes de type GP deviennent des groupes politiques", () => {
  const organes = construireOrganes(FICHIERS_ORGANE);
  assert.equal(organes.size, 2, "la commission des finances est exclue");
  assert.deepEqual(organes.get("PO1"), { id: "EPR", nom: "Ensemble pour la République" });
});

test("un référentiel sans aucun organe GP échoue en le disant", () => {
  assert.throws(
    () => construireOrganes([{ organe: { uid: "PO9", codeType: "COMPER" } }]),
    /codeType/
  );
});

/* Régression : la première version lisait UN fichier en le prenant pour un
   index global. L'archive contient en fait un fichier par entité. */
test("les organes sont lus fichier par fichier, pas depuis un index global", () => {
  const organes = construireOrganes(FICHIERS_ORGANE);
  assert.equal(organes.get("PO2").id, "RN");
  assert.equal(organes.get("PO7"), undefined, "une circonscription n'est pas un groupe");
});

test("un acronyme manquant retombe sur libelleAbrege puis sur l'uid", () => {
  const organes = construireOrganes([
    { organe: { uid: "PO3", codeType: "GP", libelleAbrege: "ABR", libelle: "Avec abrege" } },
    { organe: { uid: "PO4", codeType: "GP", libelle: "Sans rien" } },
  ]);
  assert.equal(organes.get("PO3").id, "ABR");
  assert.equal(organes.get("PO4").id, "PO4");
});

test("les acteurs sont indexés par uid, avec prénom et nom recomposés", () => {
  const acteurs = construireActeurs(FICHIERS_ACTEUR);
  assert.equal(acteurs.size, 4);
  assert.equal(acteurs.get("PA1"), "Camille Garonne");
});

test("un scrutin AN se normalise en votes exploitables", () => {
  const organes = construireOrganes(FICHIERS_ORGANE);
  const acteurs = construireActeurs(FICHIERS_ACTEUR);
  const s = normaliserScrutin(SCRUTIN_AN, organes, acteurs);

  assert.equal(s.numero, 42);
  assert.equal(s.date, "2026-03-11", "la date est tronquée au jour");
  assert.equal(s.sort, "adopté");
  assert.equal(s.votes.length, 4, "aucun votant perdu, y compris les groupes à un seul membre");

  const pa4 = s.votes.find((v) => v.id === "PA4");
  assert.deepEqual(pa4, { id: "PA4", nom: "Nadia Ardèche", groupe: "RN", position: "contre" });
});

test("la chaîne complète normalisation → partition conserve l'invariant", () => {
  const organes = construireOrganes(FICHIERS_ORGANE);
  const acteurs = construireActeurs(FICHIERS_ACTEUR);
  const s = normaliserScrutin(SCRUTIN_AN, organes, acteurs);
  const { partition, total, ok } = partitionner(s.votes);

  assert.equal(ok, true);
  assert.equal(total, 4);
  assert.deepEqual(compter(partition),
    { pour: 2, contre: 1, abstention: 1, nonVotant: 0, absent: 0 });
});

test("un champ manquant est signalé avec les clés réellement présentes", () => {
  const organes = construireOrganes(FICHIERS_ORGANE);
  const acteurs = construireActeurs(FICHIERS_ACTEUR);

  assert.throws(
    () => normaliserScrutin({ scrutin: { numero: "1", titre: "x" } }, organes, acteurs),
    (e) => /dateScrutin/.test(e.message) && /numero/.test(e.message)
  );
});

test("un groupe inconnu du référentiel garde son identifiant brut, sans planter", () => {
  const organes = construireOrganes(FICHIERS_ORGANE);
  const acteurs = construireActeurs(FICHIERS_ACTEUR);
  const modifie = structuredClone(SCRUTIN_AN);
  modifie.scrutin.ventilationVotes.organe.groupes.groupe[1].organeRef = "PO404";

  const s = normaliserScrutin(modifie, organes, acteurs);
  assert.equal(s.votes.find((v) => v.id === "PA4").groupe, "PO404");
});

test("un scrutin sans aucun décompte nominatif est refusé, pas publié vide", () => {
  const organes = construireOrganes(FICHIERS_ORGANE);
  const acteurs = construireActeurs(FICHIERS_ACTEUR);
  const modifie = structuredClone(SCRUTIN_AN);
  for (const g of modifie.scrutin.ventilationVotes.organe.groupes.groupe) g.vote = {};

  assert.throws(() => normaliserScrutin(modifie, organes, acteurs), /aucun vote nominatif/);
});
