import test from "node:test";
import assert from "node:assert/strict";

import { profil, creerAccumulateur, TYPES } from "../scripts/deputes.mjs";

const ORGANES = new Map([
  ["PO1", { uid: "PO1", codeType: "GP", libelleAbrev: "SOC", libelle: "Socialistes et apparentés" }],
  ["PO2", { uid: "PO2", codeType: "PARPOL", libelle: "Parti socialiste" }],
  ["PO3", { uid: "PO3", codeType: "COMPER", libelle: "Commission des affaires étrangères" }],
]);

const ACTEUR = {
  acteur: {
    uid: { "#text": "PA1" },
    etatCivil: { ident: { civ: "M.", prenom: "Alain", nom: "Garonne" } },
    profession: { libelleCourant: "Ingénieur" },
    mandats: {
      mandat: [
        { typeOrgane: "GP", organes: { organeRef: "PO1" }, dateDebut: "2024-07-19", dateFin: null,
          infosQualite: { libQualite: "Membre du" } },
        { typeOrgane: "PARPOL", organes: { organeRef: "PO2" }, dateDebut: "2025-12-03", dateFin: null,
          infosQualite: { libQualite: "Membre" } },
        { typeOrgane: "COMPER", organes: { organeRef: "PO3" }, dateDebut: "2024-07-20", dateFin: null,
          infosQualite: { libQualite: "Membre" } },
        { typeOrgane: "COMPER", organes: { organeRef: "PO3" }, dateDebut: "2025-10-02", dateFin: null,
          infosQualite: { libQualite: "Vice-président" } },
        { typeOrgane: "ASSEMBLEE", dateDebut: "2024-07-07", dateFin: null,
          election: { lieu: { departement: "Gironde", numCirco: "4" } } },
        { typeOrgane: "GA", organes: { organeRef: "PO9" }, dateDebut: "2025-01-24", dateFin: null,
          infosQualite: { libQualite: "Membre" } },
      ],
    },
  },
};

test("le profil distingue le groupe parlementaire du parti politique", () => {
  const p = profil(ACTEUR, ORGANES);
  assert.equal(p.groupe, "SOC", "acronyme du groupe");
  assert.equal(p.parti, "Parti socialiste", "libellé du parti, distinct du groupe");
  assert.equal(p.circonscription, "Gironde — 4e circ.");
  assert.equal(p.profession, "Ingénieur");
});

test("un organe où le député exerce une fonction n'apparaît qu'une fois", () => {
  const p = profil(ACTEUR, ORGANES);
  const comper = p.mandats.filter((m) => m.type === "COMPER");
  assert.equal(comper.length, 1, "la ligne « Membre » redondante est écartée");
  assert.equal(comper[0].qualite, "Vice-président", "la fonction est conservée");
});

test("les groupes d'amitié sont écartés de la liste affichée", () => {
  const p = profil(ACTEUR, ORGANES);
  assert.equal(p.mandats.some((m) => m.type === "GA"), false);
});

/* ── accumulateur ───────────────────────────────────────────────────────── */

const scrutin = (numero, typeVote, date = "2026-01-01") =>
  ({ numero, date, titre: `Scrutin ${numero}`, typeVote });

test("un vote conforme à la ligne compte comme aligné, l'écart est listé", () => {
  const acc = creerAccumulateur();
  acc.ajouter(scrutin(1, TYPES.ordinaire), {
    SOC: { pour: ["PA1"], contre: ["PA2"], abstention: [], nonVotant: [], ligne: "pour" },
  });
  const { fiches } = acc.conclure(new Map());

  assert.equal(fiches.get("PA1").ligne.aligne, 1);
  assert.equal(fiches.get("PA1").ligne.diverge, 0);
  assert.equal(fiches.get("PA2").ligne.diverge, 1);
  assert.deepEqual(
    fiches.get("PA2").divergences[0],
    { numero: 1, date: "2026-01-01", titre: "Scrutin 1", groupe: "SOC", ligne: "pour", vote: "contre" }
  );
});

test("un « non votant » n'est ni un accord ni un désaccord", () => {
  const acc = creerAccumulateur();
  acc.ajouter(scrutin(1, TYPES.ordinaire), {
    SOC: { pour: [], contre: [], abstention: [], nonVotant: ["PA1"], ligne: "pour" },
  });
  const f = acc.conclure(new Map()).fiches.get("PA1");

  assert.equal(f.ligne.exprimes, 0);
  assert.equal(f.ligne.taux, null, "aucun taux inventé sur zéro vote exprimé");
  assert.equal(f.participation.ordinaire.participations, 1, "mais la présence est comptée");
});

test("sans ligne publiée, aucun alignement n'est calculé", () => {
  const acc = creerAccumulateur();
  acc.ajouter(scrutin(1, TYPES.ordinaire), {
    SOC: { pour: ["PA1"], contre: [], abstention: [], nonVotant: [], ligne: null },
  });
  const f = acc.conclure(new Map()).fiches.get("PA1");
  assert.equal(f.ligne.exprimes, 0);
});

/* Le point le plus sensible du fichier : l'article 49 ne fait recenser que les
   voix « pour ». Traiter une motion de censure comme une mesure de présence
   transformerait une position politique en reproche d'absentéisme. */
test("une motion de censure ne compte pas comme participation", () => {
  const acc = creerAccumulateur();
  acc.ajouter(scrutin(1, TYPES.censure), {
    SOC: { pour: ["PA1"], contre: [], abstention: [], nonVotant: [], ligne: "pour" },
  });
  acc.ajouter(scrutin(2, TYPES.solennel), {
    SOC: { pour: ["PA1"], contre: [], abstention: [], nonVotant: [], ligne: "pour" },
  });
  const f = acc.conclure(new Map()).fiches.get("PA1");

  assert.equal(f.censure.votees, 1);
  assert.equal(f.censure.motions, 1);
  assert.equal(f.participation.solennel.participations, 1);
  assert.equal(f.participation.solennel.scrutins, 1,
    "le dénominateur des solennels ignore la motion de censure");
  assert.equal(f.participation.ordinaire.scrutins, 0);
});

test("les taux portent leur dénominateur, jamais un pourcentage nu", () => {
  const acc = creerAccumulateur();
  for (let n = 1; n <= 4; n++) {
    acc.ajouter(scrutin(n, TYPES.solennel), {
      SOC: { pour: n <= 3 ? ["PA1"] : [], contre: [], abstention: [], nonVotant: [], ligne: "pour" },
    });
  }
  const p = acc.conclure(new Map()).fiches.get("PA1").participation.solennel;

  assert.deepEqual(p, { participations: 3, scrutins: 4, taux: 0.75 });
});

test("la médiane du groupe sert de repère et ignore les députés sans groupe", () => {
  const acc = creerAccumulateur();
  /* PA1 présent partout, PA2 sur la moitié, PA3 sur un quart. */
  for (let n = 1; n <= 4; n++) {
    acc.ajouter(scrutin(n, TYPES.solennel), {
      SOC: {
        pour: ["PA1", ...(n <= 2 ? ["PA2"] : []), ...(n === 1 ? ["PA3"] : [])],
        contre: [], abstention: [], nonVotant: [], ligne: "pour",
      },
    });
  }
  const profils = new Map([
    ["PA1", { id: "PA1", nom: "A", groupe: "SOC", mandats: [] }],
    ["PA2", { id: "PA2", nom: "B", groupe: "SOC", mandats: [] }],
    ["PA3", { id: "PA3", nom: "C", groupe: "SOC", mandats: [] }],
  ]);
  const { medianes } = acc.conclure(profils);

  assert.equal(medianes.SOC.solennel, 0.5, "médiane de 1 / 0,5 / 0,25");
});

test("un député sans profil connu garde une fiche minimale plutôt que d'être perdu", () => {
  const acc = creerAccumulateur();
  acc.ajouter(scrutin(1, TYPES.ordinaire), {
    SOC: { pour: ["PA404"], contre: [], abstention: [], nonVotant: [], ligne: "pour" },
  });
  const f = acc.conclure(new Map()).fiches.get("PA404");

  assert.equal(f.id, "PA404");
  assert.equal(f.nom, "PA404", "l'identifiant fait office de nom");
  assert.equal(f.participation.ordinaire.participations, 1);
});
