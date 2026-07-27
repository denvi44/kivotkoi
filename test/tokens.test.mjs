import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { T } from "../src/tokens.js";
import { ORDRE, COULEURS, ordonner, couleurDe } from "../src/groupes.js";

/* Les couleurs vivent en double : en CSS pour la page, en JS pour les attributs
   `fill` du SVG. Ce test est la seule chose qui empêche les deux de diverger
   silencieusement — auquel cas les sièges et la légende ne diraient plus la
   même chose. */
test("tokens.js et index.css ne divergent pas", async () => {
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  const bloc = css.match(/:root\s*\{([^}]*)\}/)?.[1];
  assert.ok(bloc, ":root introuvable dans index.css");

  const cssVars = Object.fromEntries(
    [...bloc.matchAll(/--([\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})/g)]
      .map(([, nom, valeur]) => [nom, valeur.toUpperCase()])
  );

  /* Les noms diffèrent de forme entre les deux fichiers : --contre-txt en CSS,
     contreTxt en JS. On compare donc sur une forme normalisée. */
  const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

  for (const [nom, valeur] of Object.entries(T)) {
    const cle = kebab(nom);
    assert.equal(
      cssVars[cle], valeur.toUpperCase(),
      `--${cle} vaut ${cssVars[cle]} en CSS mais ${valeur} dans tokens.js`
    );
  }

  assert.deepEqual(
    Object.keys(cssVars).sort(), Object.keys(T).map(kebab).sort(),
    "un jeton existe d'un côté seulement"
  );
});

/* ── contrastes ──────────────────────────────────────────────────────────
   Ces seuils viennent d'un audit RGAA 4.1 qui avait relevé trois échecs
   critiques. Les vérifier ici évite qu'un ajustement esthétique ne les
   réintroduise sans que personne ne s'en aperçoive. */

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (h) => {
  const n = parseInt(h.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const contraste = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test("les couleurs de texte atteignent 4,5:1 sur les deux fonds", () => {
  const textes = {
    bone: T.bone, dust: T.dust, brass: T.brass,
    pour: T.pour, abst: T.abst,
    contreTxt: T.contreTxt, absentTxt: T.absentTxt,
  };
  for (const [nom, couleur] of Object.entries(textes)) {
    for (const [fond, valeur] of [["--ink", T.ink], ["--slate", T.slate]]) {
      const r = contraste(couleur, valeur);
      assert.ok(r >= 4.5, `${nom} sur ${fond} : ${r.toFixed(2)} < 4,5`);
    }
  }
});

test("les jetons d'aplat ne doivent jamais servir de couleur de texte", () => {
  /* Documenté par le test : --contre et --absent échouent en tant que texte.
     C'est précisément pourquoi les variantes -txt existent. */
  assert.ok(contraste(T.contre, T.slate) < 4.5);
  assert.ok(contraste(T.absent, T.slate) < 4.5);
});

test("la bordure des champs atteint 3:1, seuil des composants d'interface", () => {
  assert.ok(contraste(T.bordureChamp, T.slate) >= 3,
    `bordure : ${contraste(T.bordureChamp, T.slate).toFixed(2)} < 3`);
});

test("l'indicateur de focus atteint 3:1 sur les deux fonds", () => {
  assert.ok(contraste(T.brass, T.ink) >= 3);
  assert.ok(contraste(T.brass, T.slate) >= 3);
});

test("chaque groupe ordonné a une couleur", () => {
  for (const id of ORDRE) {
    assert.ok(COULEURS[id], `pas de couleur pour ${id}`);
    assert.match(COULEURS[id], /^#[0-9A-Fa-f]{6}$/);
  }
});

test("un groupe inconnu est placé en fin de rang, pas jeté", () => {
  const { ordonnes, inconnus } = ordonner([
    { id: "RN" }, { id: "XYZ" }, { id: "LFI-NFP" },
  ]);

  assert.equal(ordonnes.length, 3, "aucun groupe perdu");
  assert.deepEqual(ordonnes.map((g) => g.id), ["LFI-NFP", "RN", "XYZ"]);
  assert.deepEqual(inconnus, ["XYZ"]);
  assert.ok(couleurDe("XYZ"), "couleur de repli fournie");
});

test("l'ordre gauche → droite est respecté", () => {
  const { ordonnes } = ordonner([
    { id: "RN" }, { id: "GDR" }, { id: "EPR" }, { id: "LFI-NFP" },
  ]);
  assert.deepEqual(ordonnes.map((g) => g.id), ["GDR", "LFI-NFP", "EPR", "RN"]);
});

/* Les acronymes viennent du champ `libelleAbrev` de l'open data, pas de
   l'usage courant. Se tromper ne casse rien mais déclasse le groupe en gris,
   en fin de rang — une panne silencieuse. Ces valeurs ont été relevées dans
   l'archive AMO10 le 26 juillet 2026. */
test("les acronymes correspondent à ceux publiés par l'Assemblée", () => {
  const officiels = [
    "GDR", "LFI-NFP", "ECOS", "SOC", "LIOT", "DEM",
    "EPR", "HOR", "DR", "UDDPLR", "RN", "NI",
  ];
  assert.deepEqual([...ORDRE].sort(), [...officiels].sort());

  const { inconnus } = ordonner(officiels.map((id) => ({ id })));
  assert.deepEqual(inconnus, [], "les 12 groupes réels ont tous une place");
});
