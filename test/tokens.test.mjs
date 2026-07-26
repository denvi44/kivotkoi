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

  for (const [nom, valeur] of Object.entries(T)) {
    assert.equal(
      cssVars[nom], valeur.toUpperCase(),
      `--${nom} vaut ${cssVars[nom]} en CSS mais ${valeur} dans tokens.js`
    );
  }

  assert.deepEqual(
    Object.keys(cssVars).sort(), Object.keys(T).sort(),
    "un jeton existe d'un côté seulement"
  );
});

test("chaque groupe ordonné a une couleur", () => {
  for (const id of ORDRE) {
    assert.ok(COULEURS[id], `pas de couleur pour ${id}`);
    assert.match(COULEURS[id], /^#[0-9A-Fa-f]{6}$/);
  }
});

test("un groupe inconnu est placé en fin de rang, pas jeté", () => {
  const { ordonnes, inconnus } = ordonner([
    { id: "RN" }, { id: "XYZ" }, { id: "LFI" },
  ]);

  assert.equal(ordonnes.length, 3, "aucun groupe perdu");
  assert.deepEqual(ordonnes.map((g) => g.id), ["LFI", "RN", "XYZ"]);
  assert.deepEqual(inconnus, ["XYZ"]);
  assert.ok(couleurDe("XYZ"), "couleur de repli fournie");
});

test("l'ordre gauche → droite est respecté", () => {
  const { ordonnes } = ordonner([
    { id: "RN" }, { id: "GDR" }, { id: "EPR" }, { id: "LFI" },
  ]);
  assert.deepEqual(ordonnes.map((g) => g.id), ["GDR", "LFI", "EPR", "RN"]);
});
