import test from "node:test";
import assert from "node:assert/strict";

import { calculerOffsets, chercherIndex, calculerFenetre } from "../src/fenetrage.js";

const uniforme = (h) => () => h;
const offsetsDe = (n, h = 100) => calculerOffsets(n, uniforme(h));

test("les décalages cumulent les hauteurs et donnent la hauteur totale", () => {
  const o = calculerOffsets(3, (i) => [10, 20, 30][i]);
  assert.deepEqual([...o], [0, 10, 30, 60]);
});

test("une hauteur absurde compte pour zéro plutôt que de propager un NaN", () => {
  const o = calculerOffsets(3, (i) => (i === 1 ? NaN : 10));
  assert.deepEqual([...o], [0, 10, 10, 20]);
});

test("la dichotomie trouve la ligne recouvrant une position donnée", () => {
  const o = offsetsDe(100);
  assert.equal(chercherIndex(o, 100, 0), 0);
  assert.equal(chercherIndex(o, 100, 50), 0);
  assert.equal(chercherIndex(o, 100, 100), 1);
  assert.equal(chercherIndex(o, 100, 5050), 50);
});

test("la dichotomie donne le même résultat qu'un parcours linéaire", () => {
  const h = (i) => 40 + ((i * 37) % 90);         // hauteurs irrégulières
  const o = calculerOffsets(500, h);
  const lineaire = (y) => { let i = 0; while (i < 500 && o[i + 1] <= y) i++; return i; };
  /* Le pas passe par des frontières exactes autant que par des positions
     quelconques : c'est aux frontières que l'implémentation se trompait. */
  for (let y = 0; y < o[500]; y += 1) {
    assert.equal(chercherIndex(o, 500, y), lineaire(y), `à y=${y}`);
  }
});

test("la fenêtre couvre la zone visible, marge comprise", () => {
  const o = offsetsDe(1000);
  const { debut, fin } = calculerFenetre(o, 1000, 5000, 800, 6);

  assert.equal(debut, 50 - 6, "6 lignes de marge au-dessus");
  assert.ok(fin >= 58 + 6, "la zone visible et sa marge sont couvertes");
  assert.ok(offsets_couvrent(o, debut, fin, 5000, 5800));
});

function offsets_couvrent(o, debut, fin, haut, bas) {
  return o[debut] <= haut && o[fin] >= bas;
}

test("en haut de liste la fenêtre ne descend pas sous zéro", () => {
  const { debut, fin } = calculerFenetre(offsetsDe(1000), 1000, 0, 800, 6);
  assert.equal(debut, 0);
  assert.ok(fin > 8);
});

/* Le cas qui produisait des lignes fantômes : on filtre la liste alors que le
   défilement est loin en bas, si bien que scrollTop dépasse la hauteur
   restante avant que le navigateur ne l'ait corrigé. */
test("un défilement au-delà de la liste reste dans les bornes", () => {
  const o = offsetsDe(10);
  const { debut, fin } = calculerFenetre(o, 10, 99999, 800, 6);
  assert.ok(debut >= 0 && debut <= 10, `debut=${debut}`);
  assert.ok(fin >= 0 && fin <= 10, `fin=${fin}`);
  assert.ok(debut <= fin);
});

test("une liste vide ne rend rien et ne plante pas", () => {
  assert.deepEqual(calculerFenetre(calculerOffsets(0, uniforme(10)), 0, 0, 800, 6),
    { debut: 0, fin: 0 });
});

test("une hauteur visible nulle rend au moins une ligne", () => {
  const { debut, fin } = calculerFenetre(offsetsDe(100), 100, 0, 0, 0);
  assert.ok(fin > debut, "sinon rien ne se mesure et la liste ne s'ouvre jamais");
});

test("un défilement négatif est ramené à zéro", () => {
  const { debut } = calculerFenetre(offsetsDe(100), 100, -400, 800, 6);
  assert.equal(debut, 0);
});

/* Garantie qui casse la boucle de rendu : à entrée identique, sortie
   identique. Le composant compare les bornes avant de remplacer son état ;
   si ce calcul n'était pas déterministe, la comparaison ne servirait à rien. */
test("le calcul est déterministe à entrée constante", () => {
  const o = offsetsDe(1000);
  const a = calculerFenetre(o, 1000, 3210, 640, 6);
  const b = calculerFenetre(o, 1000, 3210, 640, 6);
  assert.deepEqual(a, b);
});

test("toute position de défilement produit des bornes valides", () => {
  const h = (i) => 30 + ((i * 53) % 120);
  const n = 800;
  const o = calculerOffsets(n, h);
  for (let y = -500; y < o[n] + 500; y += 91) {
    const { debut, fin } = calculerFenetre(o, n, y, 700, 6);
    assert.ok(Number.isInteger(debut) && Number.isInteger(fin), `y=${y}`);
    assert.ok(debut >= 0 && fin <= n && debut <= fin, `y=${y} → [${debut},${fin}]`);
  }
});
