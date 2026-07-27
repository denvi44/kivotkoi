import test from "node:test";
import assert from "node:assert/strict";

import {
  jourSemaine, joursDansMois, grouper, grilleMois, moisVoisin,
  libelleJour, decouper, cleJour,
} from "../src/dates.js";

/* Référence : la convention est lundi = 0. Ces dates sont vérifiables au
   calendrier, ce qui est le but — un décalage d'un jour est invisible à
   l'écran mais évident ici. */
test("le jour de la semaine est juste, lundi valant 0", () => {
  assert.equal(jourSemaine(2026, 6, 21), 1, "21 juillet 2026 est un mardi");
  assert.equal(jourSemaine(2026, 6, 20), 0, "20 juillet 2026 est un lundi");
  assert.equal(jourSemaine(2026, 6, 26), 6, "26 juillet 2026 est un dimanche");
  assert.equal(jourSemaine(2024, 0, 1), 0, "1er janvier 2024 est un lundi");
  assert.equal(jourSemaine(2000, 1, 29), 1, "29 février 2000 est un mardi");
});

test("les années bissextiles sont traitées, y compris la règle séculaire", () => {
  assert.equal(joursDansMois(2024, 1), 29, "2024 bissextile");
  assert.equal(joursDansMois(2026, 1), 28, "2026 commune");
  assert.equal(joursDansMois(1900, 1), 28, "1900 non bissextile (divisible par 100)");
  assert.equal(joursDansMois(2000, 1), 29, "2000 bissextile (divisible par 400)");
  assert.equal(joursDansMois(2026, 0), 31);
  assert.equal(joursDansMois(2026, 3), 30);
});

const SCRUTINS = [
  { numero: 8434, date: "2026-07-21", titre: "A" },
  { numero: 8433, date: "2026-07-21", titre: "B" },
  { numero: 8400, date: "2026-07-08", titre: "C" },
  { numero: 8000, date: "2026-05-12", titre: "D" },
  { numero: 100, date: "2025-09-30", titre: "E" },
];

test("le regroupement par jour conserve tous les scrutins", () => {
  const { parJour } = grouper(SCRUTINS);
  const total = [...parJour.values()].reduce((t, l) => t + l.length, 0);

  assert.equal(total, SCRUTINS.length, "aucun scrutin perdu");
  assert.equal(parJour.get("2026-07-21").length, 2);
  assert.deepEqual(parJour.get("2026-07-21").map((s) => s.numero), [8434, 8433],
    "du plus récent au plus ancien dans la journée");
});

test("les mois sont listés du plus récent au plus ancien", () => {
  const { moisDisponibles } = grouper(SCRUTINS);
  assert.deepEqual(moisDisponibles, ["2026-07", "2026-05", "2025-09"]);
});

test("le maximum quotidien sert à graduer l'intensité", () => {
  assert.equal(grouper(SCRUTINS).max, 2);
});

test("une date absente ou malformée est ignorée sans planter", () => {
  const { parJour } = grouper([
    { numero: 1 }, { numero: 2, date: null }, { numero: 3, date: "2026" },
    { numero: 4, date: "2026-07-21" },
  ]);
  assert.equal(parJour.size, 1);
  assert.equal(parJour.get("2026-07-21").length, 1);
});

test("la grille fait toujours six semaines de sept jours", () => {
  const { parJour } = grouper(SCRUTINS);
  for (const [a, m] of [[2026, 6], [2026, 1], [2024, 1], [2026, 10]]) {
    const g = grilleMois(a, m, parJour);
    assert.equal(g.length, 6, `${a}-${m} : six semaines`);
    for (const s of g) assert.equal(s.length, 7);
  }
});

test("la grille commence un lundi et place le 1er au bon endroit", () => {
  const { parJour } = grouper(SCRUTINS);
  const g = grilleMois(2026, 6, parJour);   // juillet 2026, le 1er est un mercredi

  const premier = g.flat().find((c) => c.dansLeMois && c.jour === 1);
  const position = g.flat().indexOf(premier);
  assert.equal(position % 7, 2, "mercredi = 3e colonne");
  assert.equal(g[0][0].dansLeMois, false, "la grille démarre sur le mois précédent");
});

test("les jours débordants viennent des mois voisins, sans trou", () => {
  const { parJour } = grouper(SCRUTINS);
  const cases = grilleMois(2026, 0, parJour).flat();   // janvier 2026

  assert.equal(cases.length, 42);
  const dansLeMois = cases.filter((c) => c.dansLeMois);
  assert.equal(dansLeMois.length, 31);
  /* Les jours doivent se suivre sans rupture d'une case à l'autre. */
  for (let i = 1; i < cases.length; i++) {
    const veille = decouper(cases[i - 1].iso);
    const jour = decouper(cases[i].iso);
    const ecart = Date.UTC(jour.annee, jour.mois, jour.jour)
                - Date.UTC(veille.annee, veille.mois, veille.jour);
    assert.equal(ecart, 864e5, `rupture entre ${cases[i - 1].iso} et ${cases[i].iso}`);
  }
});

test("chaque case porte les scrutins de sa date", () => {
  const { parJour } = grouper(SCRUTINS);
  const cases = grilleMois(2026, 6, parJour).flat();

  const le21 = cases.find((c) => c.iso === "2026-07-21");
  assert.equal(le21.scrutins.length, 2);
  const le22 = cases.find((c) => c.iso === "2026-07-22");
  assert.deepEqual(le22.scrutins, [], "un jour sans scrutin n'est pas undefined");
});

/* Les suspensions de session créent des mois entièrement vides. Naviguer de
   proche en proche ferait cliquer plusieurs fois dans le vide. */
test("la navigation saute les mois sans aucun scrutin", () => {
  const { moisDisponibles } = grouper(SCRUTINS);

  assert.deepEqual(moisVoisin(2026, 6, moisDisponibles, -1), { annee: 2026, mois: 4 },
    "juillet → mai, en sautant juin");
  assert.deepEqual(moisVoisin(2026, 4, moisDisponibles, -1), { annee: 2025, mois: 8 },
    "mai 2026 → septembre 2025");
  assert.deepEqual(moisVoisin(2025, 8, moisDisponibles, 1), { annee: 2026, mois: 4 });
});

test("aux extrémités, la navigation renvoie null plutôt qu'une date fantôme", () => {
  const { moisDisponibles } = grouper(SCRUTINS);
  assert.equal(moisVoisin(2026, 6, moisDisponibles, 1), null, "rien après juillet 2026");
  assert.equal(moisVoisin(2025, 8, moisDisponibles, -1), null, "rien avant septembre 2025");
});

test("le passage d'année fonctionne dans les deux sens", () => {
  const { parJour } = grouper([{ numero: 1, date: "2025-12-31" }]);
  const g = grilleMois(2025, 11, parJour);
  assert.ok(g.flat().some((c) => c.iso === "2025-12-31"));

  const janvier = grilleMois(2026, 0, parJour).flat();
  assert.ok(janvier.some((c) => c.iso === "2025-12-29"), "décembre déborde sur janvier");
});

test("le libellé accessible nomme le jour, la date et le nombre", () => {
  assert.equal(libelleJour("2026-07-21", 3), "mardi 21 juillet 2026, 3 scrutins");
  assert.equal(libelleJour("2026-07-21", 1), "mardi 21 juillet 2026, 1 scrutin");
  assert.equal(libelleJour("2026-07-22", 0), "mercredi 22 juillet 2026, aucun scrutin");
});

test("les clés de date sont zéro-remplies, donc triables comme des chaînes", () => {
  assert.equal(cleJour(2026, 0, 5), "2026-01-05");
  assert.ok("2026-01-05" < "2026-01-15");
  assert.ok("2025-12-31" < "2026-01-01");
});
