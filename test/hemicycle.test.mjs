import test from "node:test";
import assert from "node:assert/strict";

import { construireSieges } from "../src/hemicycle.js";

/* La version archivée du projet plaçait 492 sièges au lieu de 577 et laissait
   θ atteindre 1,73 π. Ces deux assertions sont la raison d'être du fichier. */

test("577 sièges demandés, 577 sièges placés", () => {
  assert.equal(construireSieges(577).length, 577);
});

test("le compte est exact quel que soit le total", () => {
  for (const n of [1, 2, 11, 12, 100, 289, 348, 577, 925]) {
    assert.equal(construireSieges(n).length, n, `total ${n}`);
  }
});

test("aucun siège ne sort du demi-cercle", () => {
  for (const s of construireSieges(577)) {
    assert.ok(s.theta >= 0 && s.theta <= Math.PI,
      `θ = ${s.theta} hors de [0, π]`);
  }
});

test("aucun siège aux angles exacts 0 et π — ils toucheraient la tribune", () => {
  for (const s of construireSieges(577)) {
    assert.ok(s.theta > 0 && s.theta < Math.PI);
  }
});

test("deux sièges ne se superposent jamais", () => {
  const vus = new Set();
  for (const s of construireSieges(577)) {
    const cle = `${s.theta.toFixed(9)}|${s.rayon.toFixed(9)}`;
    assert.ok(!vus.has(cle), `superposition à θ=${s.theta}, r=${s.rayon}`);
    vus.add(cle);
  }
});

test("le rayon reste entre rInt et 1", () => {
  for (const s of construireSieges(577, 11, 0.44)) {
    assert.ok(s.rayon >= 0.44 - 1e-9 && s.rayon <= 1 + 1e-9, `rayon ${s.rayon}`);
  }
});

test("l'ordre va de la gauche vers la droite, sans retour en arrière", () => {
  const sieges = construireSieges(577);
  for (let i = 1; i < sieges.length; i++) {
    assert.ok(sieges[i].theta <= sieges[i - 1].theta + 1e-12,
      `θ remonte entre le siège ${i - 1} et ${i}`);
  }
});

test("chaque rang reçoit au moins un siège", () => {
  const parRang = new Map();
  for (const s of construireSieges(577)) {
    parRang.set(s.rang, (parRang.get(s.rang) ?? 0) + 1);
  }
  assert.equal(parRang.size, 11);
  for (const [rang, n] of parRang) assert.ok(n >= 1, `rang ${rang} vide`);
});

test("les rangs extérieurs sont plus fournis que les intérieurs", () => {
  const parRang = new Map();
  for (const s of construireSieges(577)) {
    parRang.set(s.rang, (parRang.get(s.rang) ?? 0) + 1);
  }
  assert.ok(parRang.get(10) > parRang.get(0),
    "le dernier rang doit contenir plus de sièges que le premier");
});

test("un total nul ou absurde renvoie une liste vide plutôt qu'un plantage", () => {
  assert.deepEqual(construireSieges(0), []);
  assert.deepEqual(construireSieges(-5), []);
  assert.deepEqual(construireSieges(NaN), []);
});
