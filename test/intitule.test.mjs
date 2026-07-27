import test from "node:test";
import assert from "node:assert/strict";

import { analyser, cleTexte } from "../src/intitule.js";

/* Titres relevés tels quels dans l'archive de l'Assemblée, juillet 2026. */

test("un amendement se sépare en texte, objet et stade", () => {
  const a = analyser(
    "l'amendement n° 160 de Mme Cathala après l'article 2 du projet de loi sur la justice criminelle et le respect des victimes (première lecture)."
  );
  assert.equal(a.texte, "Projet de loi sur la justice criminelle et le respect des victimes");
  assert.equal(a.objet, "Amendement n° 160 de Mme Cathala après l'article 2");
  assert.equal(a.stade, "première lecture");
});

test("le datif « au projet de loi » est reconnu comme le génitif", () => {
  const a = analyser(
    "l'amendement n° 8 (rect.) du Gouvernement au projet de loi de simplification de la vie économique (nouvelle lecture)."
  );
  assert.equal(a.texte, "Projet de loi de simplification de la vie économique");
  assert.equal(a.objet, "Amendement n° 8 (rect.) du Gouvernement");
  assert.equal(a.stade, "nouvelle lecture");
});

test("un vote sur l'ensemble conserve « ensemble » comme objet", () => {
  const a = analyser(
    "l'ensemble de la proposition de loi visant à moderniser la gestion du patrimoine immobilier de l'État (texte de la commission mixte paritaire)."
  );
  assert.equal(a.texte,
    "Proposition de loi visant à moderniser la gestion du patrimoine immobilier de l'État");
  assert.equal(a.objet, "Ensemble");
  assert.equal(a.stade, "texte de la commission mixte paritaire");
});

test("les désignations longues priment sur les courtes", () => {
  /* « projet de loi de financement de la sécurité sociale » ne doit pas être
     tronqué en « projet de loi » — l'ordre des motifs le garantit. */
  const a = analyser(
    "l'amendement n° 437 (rect.) de M. Davi à l'article 11 du projet de loi de financement de la sécurité sociale pour 2026 (nouvelle lecture)."
  );
  assert.equal(a.texte, "Projet de loi de financement de la sécurité sociale pour 2026");

  const b = analyser("l'ensemble du projet de loi de finances pour 2026 (première lecture).");
  assert.equal(b.texte, "Projet de loi de finances pour 2026");
});

/* Ces scrutins ne portent sur aucun texte. Renvoyer `texte: null` est la
   réponse juste, pas un échec de l'analyse. */
test("une motion de censure n'a pas de texte de loi", () => {
  const a = analyser(
    "la motion de censure déposée en application de l'article 49, alinéa 3, de la Constitution."
  );
  assert.equal(a.texte, null);
  assert.match(a.objet, /^Motion de censure/);
});

test("une demande de suspension de séance n'a pas de texte non plus", () => {
  const a = analyser(
    "la demande de suspension de séance présentée par M. Pribetich (article 58 du Règlement)."
  );
  assert.equal(a.texte, null);
  assert.match(a.objet, /suspension de séance/);
});

test("le titre brut est toujours conservé, quoi qu'il arrive", () => {
  const brut = "la déclaration du Gouvernement portant sur la lutte contre le narcotrafic.";
  assert.equal(analyser(brut).brut, brut);
});

test("une entrée vide ou absurde ne plante pas", () => {
  for (const v of [null, undefined, "", "   "]) {
    const a = analyser(v);
    assert.equal(a.texte, null);
    assert.equal(a.objet, null);
  }
});

test("la ponctuation résiduelle est retirée des deux morceaux", () => {
  const a = analyser("l'article 3 du projet de loi relatif à l'énergie (première lecture).");
  assert.equal(a.texte, "Projet de loi relatif à l'énergie");
  assert.ok(!a.texte.endsWith("."), "pas de point final");
  assert.ok(!a.objet.endsWith(","), "pas de virgule finale");
});

test("un stade non listé laisse simplement le champ vide", () => {
  const a = analyser("l'ensemble du projet de loi relatif à l'énergie (procédure exotique).");
  assert.equal(a.stade, null);
  assert.match(a.texte, /^Projet de loi relatif à l'énergie/);
});

/* La clé de regroupement doit rassembler tous les scrutins d'un même texte,
   quel que soit l'article visé ou l'étape de la navette. */
test("deux scrutins du même texte partagent la même clé", () => {
  const a = cleTexte("l'amendement n° 1 à l'article 2 du projet de loi de finances pour 2026 (première lecture).");
  const b = cleTexte("l'ensemble du projet de loi de finances pour 2026 (nouvelle lecture).");
  assert.equal(a, b);
  assert.equal(a, "projet-de-loi-de-finances-pour-2026");
});

test("deux textes différents ont des clés différentes", () => {
  const a = cleTexte("l'ensemble du projet de loi de finances pour 2026.");
  const b = cleTexte("l'ensemble du projet de loi de finances pour 2027.");
  assert.notEqual(a, b);
});

test("un scrutin sans texte n'a pas de clé", () => {
  assert.equal(cleTexte("la motion de censure déposée en application de l'article 49."), null);
});
