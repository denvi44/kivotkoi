import test from "node:test";
import assert from "node:assert/strict";

import {
  lienScrutin, lienParlementaire, lienGroupe, lienHemicycle,
} from "../src/liens.js";

/* Ces adresses ont été vérifiées le 27 juillet 2026 en interrogeant le site de
   l'Assemblée. Les tests figent la forme : si elle change, ils échouent plutôt
   que de laisser le site publier des liens morts. */

test("le scrutin renvoie vers la page d'analyse de l'Assemblée", () => {
  assert.equal(
    lienScrutin("an", 8422, 17),
    "https://www.assemblee-nationale.fr/dyn/17/scrutins/8422"
  );
});

test("la législature est paramétrable, jamais codée en dur", () => {
  assert.match(lienScrutin("an", 1, 18), /\/dyn\/18\/scrutins\/1$/);
});

test("le scrutin du Sénat suit son propre schéma, avec la session", () => {
  assert.equal(
    lienScrutin("senat", 275, 17, "2025"),
    "https://www.senat.fr/scrutin-public/2025/scr2025-275.html"
  );
});

test("un numéro absent ou non numérique ne produit pas de lien bancal", () => {
  for (const v of [null, undefined, "", "abc", NaN]) {
    assert.equal(lienScrutin("an", v, 17), null, `numéro ${JSON.stringify(v)}`);
  }
});

test("la fiche d'un député se déduit de son matricule", () => {
  assert.equal(
    lienParlementaire("an", "PA1008"),
    "https://www.assemblee-nationale.fr/dyn/deputes/PA1008"
  );
  assert.equal(lienParlementaire("an", "pa1008"),
    "https://www.assemblee-nationale.fr/dyn/deputes/PA1008", "casse normalisée");
});

/* Un identifiant non résolu — « PO0 », un groupe dissous — ne doit surtout pas
   produire une adresse plausible mais fausse. */
test("un identifiant qui n'est pas un matricule ne produit aucun lien", () => {
  for (const v of ["PO845401", "XYZ", "", null, "PA", "1008"]) {
    assert.equal(lienParlementaire("an", v), null, `id ${JSON.stringify(v)}`);
  }
});

test("le Sénat ne fabrique pas d'adresse de sénateur", () => {
  /* Le Sénat compose ses URL à partir du nom ET du matricule. L'API la fournit
     telle quelle ; la reconstruire par concaténation serait une devinette. */
  assert.equal(lienParlementaire("senat", "07033P"), null);
});

test("la page d'un groupe se déduit de son organeRef", () => {
  assert.equal(
    lienGroupe("an", "PO845401"),
    "https://www.assemblee-nationale.fr/dyn/org/PO845401"
  );
  assert.equal(lienGroupe("an", "PA1008"), null, "un acteur n'est pas un organe");
  assert.equal(lienGroupe("an", "PO0"), "https://www.assemblee-nationale.fr/dyn/org/PO0",
    "forme valide même si l'organe est corrompu côté source");
});

test("l'hémicycle officiel se déduit de l'uid du scrutin", () => {
  assert.equal(
    lienHemicycle("an", "VTANR5L17V8422"),
    "https://www.assemblee-nationale.fr/dyn/vos-deputes/hemicycle?scrutin=VTANR5L17V8422"
  );
});

test("toutes les adresses produites sont absolues et en HTTPS", () => {
  const liens = [
    lienScrutin("an", 8422, 17),
    lienScrutin("senat", 275, 17, "2025"),
    lienParlementaire("an", "PA1008"),
    lienGroupe("an", "PO845401"),
    lienHemicycle("an", "VTANR5L17V8422"),
  ];
  for (const l of liens) {
    assert.ok(l.startsWith("https://"), `${l} n'est pas en HTTPS`);
    assert.doesNotThrow(() => new URL(l), `${l} n'est pas une URL valide`);
  }
});
