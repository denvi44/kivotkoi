import test from "node:test";
import assert from "node:assert/strict";
import { entreesLegende, totalLegende, pluriel } from "../src/decompte.js";

/* Le scrutin 8434 du 21 juillet 2026, tel que publié : 276 pour, 86 contre,
   2 abstentions, 2 non-votants (la présidente de séance et une autre), et
   211 absents reconstitués. C'est le cas qui a révélé la régression — la
   légende affichait « 213 non votants ». Il sert de témoin. */
const S8434 = { pour: 276, contre: 86, abstention: 2, nonVotant: 2, absent: 0 };
const ABSENTS_8434 = 211;

test("les non-votants n'absorbent pas les absents", () => {
  const l = entreesLegende(S8434, ABSENTS_8434, true);
  const par = Object.fromEntries(l.map((e) => [e.cle, e.n]));

  assert.equal(par.nonVotant, 2, "2 non-votants publiés, pas 213");
  assert.equal(par.absent, 211);
  assert.notEqual(par.nonVotant, par.nonVotant + par.absent);
});

test("la légende retombe sur l'effectif de l'Assemblée", () => {
  assert.equal(totalLegende(entreesLegende(S8434, ABSENTS_8434, true)), 577);
});

test("chaque entrée ne porte que sa propre case", () => {
  /* Des valeurs toutes distinctes : toute fuite d'une case dans une autre
     déplace un total et se voit. */
  const c = { pour: 1, contre: 2, abstention: 4, nonVotant: 8, absent: 16 };
  const par = Object.fromEntries(
    entreesLegende(c, 32, true).map((e) => [e.cle, e.n])
  );

  assert.equal(par.pour, 1);
  assert.equal(par.contre, 2);
  assert.equal(par.abstention, 4);
  assert.equal(par.nonVotant, 8);
  /* Seule addition légitime : liste publiée + nombre déduit. */
  assert.equal(par.absent, 16 + 32);
});

test("« votants seuls » retire les absents au lieu d'annoncer zéro", () => {
  const l = entreesLegende(S8434, ABSENTS_8434, false);
  assert.equal(l.length, 4);
  assert.equal(l.find((e) => e.cle === "absent"), undefined);
});

test("le pluriel français commence à deux", () => {
  assert.equal(pluriel("absent", 0), "absent");
  assert.equal(pluriel("absent", 1), "absent");
  assert.equal(pluriel("absent", 2), "absents");
  assert.equal(pluriel("non votant", 213), "non votants");

  /* Le libellé suit le nombre affiché, pas une valeur voisine. */
  const l = entreesLegende({ ...S8434, abstention: 1 }, ABSENTS_8434, true);
  assert.equal(l.find((e) => e.cle === "abstention").mot, "abstention");
});

test("« pour » et « contre » sont invariables", () => {
  const l = entreesLegende(S8434, ABSENTS_8434, true);
  assert.equal(l.find((e) => e.cle === "pour").mot, "pour");
  assert.equal(l.find((e) => e.cle === "contre").mot, "contre");
});

test("des compteurs absents ou corrompus donnent zéro, jamais NaN", () => {
  /* `Number(null)` vaut 0 et passe `isFinite` : la garde doit porter sur la
     valeur brute. L'erreur a déjà été commise deux fois dans ce dépôt. */
  for (const mauvais of [undefined, null, {}, { pour: null }, { pour: "276" }]) {
    const l = entreesLegende(mauvais, null, true);
    for (const e of l) {
      assert.equal(Number.isInteger(e.n), true, `${e.cle} : ${e.n}`);
    }
    assert.equal(totalLegende(l), 0);
  }
});
