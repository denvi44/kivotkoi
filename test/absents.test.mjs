import test from "node:test";
import assert from "node:assert/strict";

import {
  construireHistorique, fusionnerHistoriques, membresALaDate, deduireAbsents,
} from "../scripts/absents.mjs";

const ORGANES = new Map([
  ["PO1", { id: "SOC", nom: "Socialistes" }],
  ["PO2", { id: "RN", nom: "Rassemblement National" }],
]);

const acteur = (uid, mandats) => ({
  acteur: {
    uid: { "#text": uid },
    mandats: { mandat: mandats.map((m) => ({ typeOrgane: "GP", organes: { organeRef: m.organe }, dateDebut: m.debut ?? null, dateFin: m.fin ?? null })) },
  },
});

const HIST = construireHistorique([
  acteur("PA1", [{ organe: "PO1", debut: "2024-07-19" }]),
  acteur("PA2", [{ organe: "PO1", debut: "2024-07-19" }]),
  acteur("PA3", [{ organe: "PO1", debut: "2024-07-19", fin: "2026-01-31" }]),
  acteur("PA4", [{ organe: "PO1", debut: "2026-02-01" }]),
  acteur("PA9", [{ organe: "PO2", debut: "2024-07-19" }]),
]);

test("seuls les mandats de groupe politique sont retenus", () => {
  const h = construireHistorique([{
    acteur: {
      uid: { "#text": "PA1" },
      mandats: { mandat: [
        { typeOrgane: "GP", organes: { organeRef: "PO1" }, dateDebut: "2024-07-19" },
        { typeOrgane: "COMPER", organes: { organeRef: "PO9" }, dateDebut: "2024-07-20" },
      ] },
    },
  }]);
  assert.equal(h.get("PA1").length, 1);
  assert.equal(h.get("PA1")[0].organe, "PO1");
});

test("l'effectif dépend de la date, pas de l'état actuel", () => {
  /* PA3 quitte fin janvier, PA4 arrive début février. */
  const avant = membresALaDate("SOC", "2026-01-15", HIST, ORGANES);
  const apres = membresALaDate("SOC", "2026-03-15", HIST, ORGANES);

  assert.deepEqual([...avant].sort(), ["PA1", "PA2", "PA3"]);
  assert.deepEqual([...apres].sort(), ["PA1", "PA2", "PA4"]);
});

test("les bornes de mandat sont inclusives", () => {
  assert.ok(membresALaDate("SOC", "2026-01-31", HIST, ORGANES).has("PA3"),
    "présent son dernier jour");
  assert.ok(!membresALaDate("SOC", "2026-02-01", HIST, ORGANES).has("PA3"),
    "parti le lendemain");
  assert.ok(membresALaDate("SOC", "2026-02-01", HIST, ORGANES).has("PA4"),
    "présent son premier jour");
});

test("un groupe sans membre à cette date renvoie un ensemble vide, pas une erreur", () => {
  assert.equal(membresALaDate("SOC", "2020-01-01", HIST, ORGANES).size, 0);
  assert.equal(membresALaDate("INCONNU", "2026-03-15", HIST, ORGANES).size, 0);
});

/* ── la déduction proprement dite ─────────────────────────────────────────── */

const base = { acronyme: "SOC", date: "2026-03-15", historique: HIST, organes: ORGANES };

test("quand les deux contrôles passent, les absents sont nommés", () => {
  const { absents, motif } = deduireAbsents({
    ...base, effectifAnnonce: 3, votants: ["PA1"],
  });
  assert.equal(motif, "démontré");
  assert.deepEqual(absents, ["PA2", "PA4"]);
});

test("aucun absent quand tout le monde a voté", () => {
  const { absents } = deduireAbsents({
    ...base, effectifAnnonce: 3, votants: ["PA1", "PA2", "PA4"],
  });
  assert.deepEqual(absents, []);
});

/* Le cas qui fait échouer 44 % des couples avec le seul référentiel des
   mandats actifs : un député remplacé manque à l'appel. */
test("un effectif reconstitué trop court refuse de nommer", () => {
  const { absents, motif } = deduireAbsents({
    ...base, effectifAnnonce: 5, votants: ["PA1"],
  });
  assert.equal(absents, null);
  assert.match(motif, /effectif reconstitué 3 ≠ 5/);
});

test("un votant hors de l'effectif reconstitué refuse de nommer", () => {
  const { absents, motif } = deduireAbsents({
    ...base, effectifAnnonce: 3, votants: ["PA1", "PA99"],
  });
  assert.equal(absents, null);
  assert.match(motif, /hors de l'effectif/);
});

test("un effectif non publié refuse de nommer", () => {
  for (const v of [undefined, null, NaN, "douze"]) {
    const { absents, motif } = deduireAbsents({
      ...base, effectifAnnonce: Number(v), votants: ["PA1"],
    });
    assert.equal(absents, null, `effectif ${JSON.stringify(v)}`);
    assert.match(motif, /non publié/);
  }
});

test("l'échec est toujours motivé, jamais silencieux", () => {
  const cas = [
    { effectifAnnonce: 5, votants: ["PA1"] },
    { effectifAnnonce: 3, votants: ["PA99"] },
    { effectifAnnonce: NaN, votants: [] },
  ];
  for (const c of cas) {
    const { absents, motif } = deduireAbsents({ ...base, ...c });
    assert.equal(absents, null);
    assert.ok(motif && motif.length > 5, "un motif lisible accompagne le refus");
  }
});

/* ── fusion des référentiels ──────────────────────────────────────────────── */

test("la fusion réunit les deux sources sans dupliquer", () => {
  const a = construireHistorique([acteur("PA1", [{ organe: "PO1", debut: "2024-07-19" }])]);
  const b = construireHistorique([
    acteur("PA1", [{ organe: "PO1", debut: "2024-07-19" }]),   // doublon exact
    acteur("PA7", [{ organe: "PO1", debut: "2024-07-19", fin: "2025-06-30" }]),
  ]);
  const f = fusionnerHistoriques(a, b);

  assert.equal(f.get("PA1").length, 1, "le doublon exact n'est pas répété");
  assert.ok(f.has("PA7"), "le député absent de la première source est récupéré");
});

test("un député quitté puis revenu compte pour les deux périodes", () => {
  const h = construireHistorique([acteur("PA5", [
    { organe: "PO1", debut: "2024-07-19", fin: "2025-03-31" },
    { organe: "PO2", debut: "2025-04-01" },
  ])]);

  assert.ok(membresALaDate("SOC", "2025-01-01", h, ORGANES).has("PA5"));
  assert.ok(!membresALaDate("SOC", "2025-06-01", h, ORGANES).has("PA5"));
  assert.ok(membresALaDate("RN", "2025-06-01", h, ORGANES).has("PA5"));
});
