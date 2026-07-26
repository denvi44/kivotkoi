import test from "node:test";
import assert from "node:assert/strict";

import {
  partitionner, compter, parGroupe, resumerAnomalies, CASES,
} from "../scripts/partition.mjs";

const d = (id, position, extra = {}) => ({ id, nom: id, position, ...extra });

/* L'invariant que tout le reste présuppose. */
test("chaque député atterrit dans exactement une case", () => {
  const votes = [
    d("PA1", "pour"), d("PA2", "contre"), d("PA3", "abstention"),
    d("PA4", "nonVotant"), d("PA5", "absent"),
  ];
  const { partition, total, ok } = partitionner(votes);

  assert.equal(ok, true);
  assert.equal(total, 5);
  assert.deepEqual(compter(partition),
    { pour: 1, contre: 1, abstention: 1, nonVotant: 1, absent: 1 });

  const tous = CASES.flatMap((c) => partition[c].map((e) => e.id));
  assert.equal(new Set(tous).size, tous.length, "aucun doublon entre cases");
});

test("un doublon contradictoire met le député en quarantaine, pas dans une case au hasard", () => {
  const { partition, anomalies, total } = partitionner([
    d("PA1", "pour"), d("PA1", "contre"),
  ]);

  assert.equal(total, 0, "PA1 n'est compté nulle part");
  assert.equal(CASES.reduce((t, c) => t + partition[c].length, 0), 0);
  assert.equal(anomalies.filter((a) => a.type === "doublon_contradictoire").length, 1);
});

test("un doublon identique est signalé mais ne fausse pas le décompte", () => {
  const { partition, anomalies, total } = partitionner([
    d("PA1", "pour"), d("PA1", "pour"),
  ]);

  assert.equal(total, 1);
  assert.equal(partition.pour.length, 1);
  assert.equal(anomalies.filter((a) => a.type === "doublon_identique").length, 1);
});

test("une position inconnue est écartée et signalée, jamais devinée", () => {
  const { partition, anomalies, total } = partitionner([
    d("PA1", "pour"), d("PA2", "peut-être"),
  ]);

  assert.equal(total, 1);
  assert.equal(CASES.reduce((t, c) => t + partition[c].length, 0), 1);
  assert.equal(anomalies.filter((a) => a.type === "position_inconnue").length, 1);
});

test("un identifiant vide est refusé — le nom ne sert jamais de clé", () => {
  const { anomalies, total } = partitionner([
    { id: "  ", nom: "Jean Dupont", position: "pour" },
  ]);

  assert.equal(total, 0);
  assert.equal(anomalies[0].type, "id_manquant");
});

test("deux homonymes avec des identifiants distincts restent deux personnes", () => {
  const { partition, total, ok } = partitionner([
    { id: "PA1", nom: "Jean Martin", position: "pour" },
    { id: "PA2", nom: "Jean Martin", position: "contre" },
  ]);

  assert.equal(ok, true);
  assert.equal(total, 2);
  assert.equal(partition.pour.length, 1);
  assert.equal(partition.contre.length, 1);
});

test("les libellés de position sont normalisés (accents, casse, tirets)", () => {
  const { partition, ok } = partitionner([
    d("PA1", "POUR"), d("PA2", "Abstentions"),
    d("PA3", "non-votant"), d("PA4", "Non Votant"),
  ]);

  assert.equal(ok, true);
  assert.equal(partition.pour.length, 1);
  assert.equal(partition.abstention.length, 1);
  assert.equal(partition.nonVotant.length, 2);
});

test("« nonVotant » et « absent » restent deux cases distinctes", () => {
  const { partition } = partitionner([d("PA1", "nonVotant"), d("PA2", "absent")]);

  assert.equal(partition.nonVotant.length, 1);
  assert.equal(partition.absent.length, 1);
  assert.notEqual(partition.nonVotant[0].id, partition.absent[0].id);
});

test("une source non-tableau ne fait pas planter, elle se signale", () => {
  const { ok, total, anomalies } = partitionner(null);

  assert.equal(ok, false);
  assert.equal(total, 0);
  assert.equal(anomalies[0].type, "source_invalide");
});

test("le regroupement par groupe préserve l'invariant", () => {
  const votes = [
    d("PA1", "pour", { groupe: "EPR" }), d("PA2", "contre", { groupe: "EPR" }),
    d("PA3", "pour", { groupe: "RN" }), d("PA4", "abstention", { groupe: null }),
  ];
  const { partition, total } = partitionner(votes);
  const groupes = parGroupe(partition);

  const somme = Object.values(groupes)
    .reduce((t, cases) => t + CASES.reduce((u, c) => u + cases[c].length, 0), 0);

  assert.equal(somme, total, "aucun député perdu ni dupliqué au regroupement");
  assert.equal(groupes.EPR.pour.length, 1);
  assert.equal(groupes.NI.abstention.length, 1, "groupe absent → NI");
});

test("le confrontement à l'effectif signale les députés sans position", () => {
  const effectif = [{ id: "PA1" }, { id: "PA2" }, { id: "PA3" }];
  const { anomalies } = partitionner([d("PA1", "pour"), d("PA9", "contre")], effectif);

  const types = anomalies.map((a) => a.type);
  assert.ok(types.includes("sans_position"), "PA2 et PA3 signalés");
  assert.ok(types.includes("hors_effectif"), "PA9 signalé");
});

test("resumerAnomalies produit un message court, ou null si tout va bien", () => {
  assert.equal(resumerAnomalies([]), null);
  assert.match(
    resumerAnomalies([{ type: "position_inconnue" }, { type: "position_inconnue" }]),
    /2 position inconnue/
  );
});
