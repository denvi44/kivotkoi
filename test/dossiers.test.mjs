import test from "node:test";
import assert from "node:assert/strict";

import {
  analyserDossier, numeroDeVote, relierDossiers, liensDossier,
} from "../scripts/dossiers.mjs";

/* Échantillon calqué sur la structure réelle relevée le 28 juillet 2026 :
   actes imbriqués, dépôt initial porteur du texte, `voteRef` en profondeur. */
const DOSSIER = {
  dossierParlementaire: {
    uid: "DLR5L17N51962",
    legislature: "17",
    titreDossier: {
      titre: "Exercer l'accès à l'emploi",
      titreChemin: "acces_emploi_experimentation_tzcld_17",
    },
    actesLegislatifs: {
      acteLegislatif: [{
        "@xsi:type": "Etape_Type",
        uid: "L17-AN1-51962",
        actesLegislatifs: {
          acteLegislatif: [
            {
              "@xsi:type": "DepotInitiative_Type",
              codeActe: "AN1-DEPOT",
              texteAssocie: "PIONANR5L17B1326",
              actesLegislatifs: null,
            },
            {
              "@xsi:type": "Etape_Type",
              codeActe: "AN1-DEBATS-SEANCE",
              actesLegislatifs: {
                acteLegislatif: { codeActe: "AN1-DEBATS-DEC", voteRef: "VTANR5L17V5222" },
              },
            },
          ],
        },
      }],
    },
  },
};

test("le dépôt initial et les scrutins sont extraits, même imbriqués", () => {
  const d = analyserDossier(DOSSIER);
  assert.equal(d.uid, "DLR5L17N51962");
  assert.equal(d.chemin, "acces_emploi_experimentation_tzcld_17");
  assert.equal(d.depot, "PIONANR5L17B1326");
  assert.deepEqual(d.votes, ["VTANR5L17V5222"]);
});

test("le dépôt initial prime sur les textes ultérieurs de la navette", () => {
  const modifie = structuredClone(DOSSIER);
  const etape = modifie.dossierParlementaire.actesLegislatifs.acteLegislatif[0];
  etape.actesLegislatifs.acteLegislatif.unshift({
    codeActe: "AN1-COM-FOND-RAPPORT", texteAssocie: "RAPPANR5L17B1400",
  });

  assert.equal(analyserDossier(modifie).depot, "PIONANR5L17B1326",
    "le rapport ne remplace pas le texte déposé");
});

test("un dossier sans identifiant est ignoré plutôt que de planter", () => {
  assert.equal(analyserDossier({}), null);
  assert.equal(analyserDossier(null), null);
});

test("le numéro de scrutin se lit dans l'uid de vote", () => {
  assert.equal(numeroDeVote("VTANR5L17V8434"), 8434);
  assert.equal(numeroDeVote("VTANR5L17V1"), 1);
  for (const v of ["", null, "DLR5L17N51962", "VTANR5L17", "PIONANR5L17B1326"]) {
    assert.equal(numeroDeVote(v), null, `uid ${JSON.stringify(v)}`);
  }
});

/* ── liaison et propagation ───────────────────────────────────────────────── */

const CLES = new Map([
  [5222, "proposition-de-loi-visant-a-exercer-l-acces-a-l-emploi"],
  [5223, "proposition-de-loi-visant-a-exercer-l-acces-a-l-emploi"],  // amendement au même texte
  [9999, "proposition-de-loi-sans-rapport"],
]);

test("un dossier se relie par voteRef, et la clé propage aux autres scrutins", () => {
  const { parCle, directs } = relierDossiers([DOSSIER], CLES);

  assert.equal(directs, 1, "un seul scrutin directement référencé");
  assert.equal(parCle.size, 1);
  /* Le scrutin 5223 n'est pas cité par le dossier, mais partage la clé de
     texte du 5222 : c'est la propagation. */
  assert.equal(parCle.get(CLES.get(5223)).uid, "DLR5L17N51962");
});

test("un dossier d'une autre législature est écarté", () => {
  const ancien = structuredClone(DOSSIER);
  ancien.dossierParlementaire.legislature = "16";
  assert.equal(relierDossiers([ancien], CLES).parCle.size, 0);
});

/* Le garde-fou de la propagation : si une même clé menait à deux dossiers,
   choisir l'un des deux serait arbitraire. */
test("une clé menant à deux dossiers ne relie plus rien", () => {
  const autre = structuredClone(DOSSIER);
  autre.dossierParlementaire.uid = "DLR5L17N99999";
  const etape = autre.dossierParlementaire.actesLegislatifs.acteLegislatif[0];
  etape.actesLegislatifs.acteLegislatif[1].actesLegislatifs.acteLegislatif.voteRef =
    "VTANR5L17V5223";

  const { parCle, collisions } = relierDossiers([DOSSIER, autre], CLES);
  assert.equal(collisions.length, 1);
  assert.equal(parCle.size, 0, "la clé ambiguë est retirée, pas arbitrée");
});

/* ── construction des adresses ────────────────────────────────────────────── */

test("les trois adresses officielles se déduisent du dossier", () => {
  const l = liensDossier(analyserDossier(DOSSIER), 17);

  assert.equal(l.texte,
    "https://www.assemblee-nationale.fr/dyn/17/textes/l17b1326_proposition-loi");
  assert.equal(l.dossier,
    "https://www.assemblee-nationale.fr/dyn/17/dossiers/acces_emploi_experimentation_tzcld_17");
  assert.equal(l.amendements,
    "https://www.assemblee-nationale.fr/dyn/17/amendements?dossier_legislatif=DLR5L17N51962");
});

test("un projet de loi produit l'autre segment d'URL", () => {
  const l = liensDossier({ uid: "D1", chemin: "c", depot: "PRJLANR5L17B2000" }, 17);
  assert.equal(l.texte,
    "https://www.assemblee-nationale.fr/dyn/17/textes/l17b2000_projet-loi");
});

/* Un rapport ou un avis n'est pas le texte de loi : mieux vaut aucun lien
   qu'une adresse plausible menant ailleurs. */
test("un type de document non textuel ne produit pas de lien vers le texte", () => {
  for (const uid of ["RAPPANR5L17B1400", "AVISANR5L17B99", "ETDIANR5L17B12", ""]) {
    const l = liensDossier({ uid: "D1", chemin: "c", depot: uid }, 17);
    assert.equal(l.texte, null, `document ${uid}`);
    assert.ok(l.dossier, "le lien vers le dossier reste disponible");
  }
});

test("un dossier absent ne produit que des valeurs nulles", () => {
  assert.deepEqual(liensDossier(null), { dossier: null, texte: null, amendements: null });
});

test("toutes les adresses produites sont des URL valides en HTTPS", () => {
  const l = liensDossier(analyserDossier(DOSSIER), 17);
  for (const u of Object.values(l)) {
    assert.ok(u.startsWith("https://"));
    assert.doesNotThrow(() => new URL(u));
  }
});
