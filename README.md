# Chambre

Visualisation des scrutins publics de l'Assemblée nationale : pour chaque
scrutin, la position de vote de chaque député, colorée par groupe dans
l'hémicycle.

Site statique. Aucun serveur d'application, aucune base de données, aucun appel
réseau au moment de la visite : un script d'ingestion transforme l'open data
officiel en fichiers JSON, et le site les sert tels quels.

---

## Ce que le projet garantit

Un député appartient à **exactement une** case : `pour`, `contre`,
`abstention`, `nonVotant`, `absent`. Ni zéro, ni deux.

Cet invariant est codé dans `scripts/partition.mjs`, testé dans
`test/partition.test.mjs`, vérifié à l'ingestion, puis **re-vérifié côté
client** au chargement de chaque scrutin. Si un scrutin le rompt, il n'est pas
publié ; si un fichier publié le rompt, l'interface affiche « décompte non
fiable » au lieu d'un total d'apparence normale.

Deux distinctions volontairement maintenues :

- **`nonVotant` ≠ `absent`.** Le premier est présent en séance mais ne prend
  pas part au vote (président de séance, notamment). Les fondre fabrique un
  faux taux d'absentéisme.
- **L'identifiant, jamais le nom.** Des homonymes siègent réellement à
  l'Assemblée, et un nom se sérialise différemment selon la source. La clé est
  toujours l'`uid` officiel (`PA######`).

---

## Source des données

| Jeu | URL | Rythme |
| --- | --- | --- |
| Scrutins | `data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip` | irrégulier |
| Députés et groupes | `.../17/amo/deputes_actifs_mandats_actifs_organes/AMO10_….json.zip` | quotidien |

Licence Ouverte / Open Licence 2.0 (Etalab), attribution à l'Assemblée
nationale.

> **Pourquoi pas NosDéputés.fr.** Regards Citoyens n'assure plus la maintenance
> au-delà de la 16ᵉ législature. Vérifié le 26 juillet 2026 :
> `nosdeputes.fr/organismes/groupe/json` renvoie encore Renaissance et les
> groupes NUPES avec `groupe_actuel: true`. La source ne couvre pas la 17ᵉ
> législature. Une version antérieure du projet en dépendait — voir
> `docs/archive/`.

---

## Démarrage

```bash
npm install
npm run ingest      # télécharge l'open data et produit public/donnees/
npm run dev         # http://localhost:5173
```

L'ingestion prend quelques minutes la première fois (deux archives à
télécharger, une par scrutin à valider). Sans elle, l'application affiche un
écran « Données indisponibles » explicite plutôt qu'une page blanche.

### Autres commandes

```bash
npm test            # invariant de partition + cohérence des jetons de couleur
npm run build       # produit dist/
npm run preview     # sert dist/ localement
npm run ingest -- --inspecter    # imprime la forme réelle d'un scrutin
```

---

## Arborescence

```
.
├── index.html                  point d'entrée Vite
├── src/
│   ├── main.jsx                montage React
│   ├── App.jsx                 interface (hémicycle, rail, analyse nominative)
│   ├── index.css               feuille de style ; :root porte les couleurs
│   ├── tokens.js               mêmes couleurs, pour les attributs SVG
│   └── groupes.js              ordre gauche→droite et couleurs des groupes
├── scripts/
│   ├── ingest.mjs              open data → public/donnees/*.json
│   └── partition.mjs           l'invariant central
├── test/                       tests node:test, sans dépendance
├── public/
│   ├── donnees/                sortie de l'ingestion — versionnée
│   ├── _headers                en-têtes Cloudflare (CSP, cache)
│   └── _redirects              réécriture SPA
└── .github/workflows/
    └── ingestion.yml           ingestion quotidienne + commit
```

### Fichiers produits par l'ingestion

| Fichier | Contenu | Poids |
| --- | --- | --- |
| `index.json` | numéro, date, titre, sort de chaque scrutin | ~1,4 Mo |
| `deputes.json` | identifiant → nom, y compris les députés remplacés | ~18 Ko |
| `scrutin-N.json` | par groupe : listes d'identifiants par case, effectif, absents, ligne | ~3,4 Ko |
| `depute/PA###.json` | parti, mandats, participation, accord avec la ligne | ~10 Ko |

Les fichiers de scrutin ne portent que des identifiants ; les noms vivent
uniquement dans `deputes.json`. Les répéter à chaque scrutin quadruplait la
sortie — 72 Mo au lieu de 18 sur douze mois.

Ces fichiers sont **versionnés dans git**. Ce n'est pas un oubli : c'est ce qui
permet au site de rester correct si l'open data de l'Assemblée est indisponible
au moment d'un déploiement, et ce qui rend chaque publication auditable dans
l'historique.

---

## Déploiement — Cloudflare Pages

### Réglages du projet

| Champ | Valeur |
| --- | --- |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | `20` (variable `NODE_VERSION`) |

Aucune variable d'environnement n'est nécessaire au build : les données sont
déjà dans le dépôt.

### Ingestion planifiée

Le workflow `.github/workflows/ingestion.yml` s'exécute chaque jour à 07h20 UTC,
relance l'ingestion et commite `public/donnees/` si le contenu a changé. Ce
commit déclenche à son tour un déploiement Cloudflare Pages.

Deux garde-fous :

1. `npm test` tourne **avant** l'ingestion. Si l'invariant est cassé dans le
   code, on ne l'apprend pas via les données publiées.
2. Un contrôle de non-régression refuse de commiter un index contenant moins de
   scrutins que celui déjà en ligne — signe d'une ingestion partielle.

Deux variables de dépôt (Settings → Secrets and variables → Actions →
*Variables*) sont recommandées pour que l'Assemblée puisse identifier le
client dans ses journaux :

```
SITE_URL      https://votre-domaine.example
SITE_CONTACT  vous@example.org
```

Elles sont facultatives ; à défaut, l'agent utilisateur annonce
`contact non renseigné`.

### En-têtes

`public/_headers` pose une CSP stricte. La seule origine tierce autorisée est
Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), importée par
`src/index.css`. Pour supprimer cette dépendance externe, self-hoster les trois
familles (Archivo, Spectral, IBM Plex Mono) et retirer les deux domaines de la
CSP.

---

## Ce que la source ne dit pas

Trois limites viennent des données elles-mêmes, pas du code. Elles sont
assumées et visibles dans l'interface plutôt que masquées.

- **Les absents ne sont pas nommés.** L'Assemblée ne publie que les députés
  ayant pris part au vote. Un scrutin ordinaire en nomme environ 135 sur 577.
  Seul `nombreMembresGroupe` trahit l'effectif réel, d'où des sièges gris
  anonymes — exacts en nombre, sans identité. La bascule *votants seuls*
  affiche la donnée brute pour qui préfère.
- **Des références de groupe sont cassées.** Les groupes dissous manquent au
  référentiel des mandats actifs (`PO847173`, 3 041 scrutins), et `PO0`
  apparaît dans 14 scrutins à la place du RN. Plutôt que de coder ces cas en
  dur, `resoudreGroupe()` interroge les députés listés : si 70 % au moins
  partagent un même groupe actuel, c'est celui-là. La déduction est signalée
  dans le fichier produit (`groupesDeduits`), jamais présentée comme une
  lecture directe.
- **L'ordre gauche–droite est éditorial.** L'open data ne dit pas où placer un
  groupe sur cet axe. Le choix vit dans `src/groupes.js` ; un groupe absent de
  la liste est placé en fin de rang, en gris, et signalé dans l'interface.

### Le piège des taux de participation

Il n'y a **pas de taux d'absentéisme** dans ce projet, et c'est délibéré.

Sur douze mois, 99 % des scrutins sont des *scrutins publics ordinaires*, dont
la médiane est de **133 votants sur 577**. Ces scrutins se tiennent avec les
députés présents en séance ; ne pas y figurer est la norme. Un taux calculé sur
l'ensemble afficherait environ 77 % d'« absence » pour à peu près tout le
monde — exact, et faux de sens.

`scripts/deputes.mjs` ventile donc la participation par type de scrutin, met en
avant les *solennels* (43 sur la période, médiane 530 votants) où la présence
est attendue, et affiche systématiquement la médiane du groupe en regard. Aucun
pourcentage n'apparaît sans son dénominateur.

Les **motions de censure** sont comptées à part, jamais comme une présence :
l'article 49 de la Constitution ne fait recenser que les voix favorables, si
bien que `contre` vaut 0 dans les treize motions de la période. S'abstenir,
s'opposer et être absent y sont indiscernables. Voter une censure est une
position politique.

L'**accord avec la ligne du groupe**, en revanche, repose sur une donnée
publiée : `positionMajoritaire` est fournie par l'Assemblée pour chaque groupe
et chaque scrutin. Elle n'est pas reconstituée à partir des décomptes. Les
« non votants » sont exclus du calcul — ne pas prendre part n'est ni un accord
ni un désaccord.

Attention aux acronymes : ce sont ceux du champ `libelleAbrev`, pas ceux de
l'usage courant. `LFI-NFP` et non `LFI`, `ECOS` et non `ECO`, `UDDPLR` et non
`UDR`. Une erreur ici ne casse rien — elle déclasse silencieusement le groupe
en gris. Le test `tokens.test.mjs` verrouille les douze valeurs.

## Autres points connus

- **Fenêtre glissante de 12 mois** (~5 400 scrutins, 20 Mo). La législature
  entière en compte 8 400 pour 86 Mo, recommittés à chaque ingestion.
  `npm run ingest -- --mois 0` lève la limite.
- **Fraîcheur.** L'archive `Scrutins.json.zip` n'est pas republiée tous les
  jours. Le pied de page affiche la date d'ingestion, pas celle du dernier
  scrutin — les deux peuvent diverger de plusieurs semaines sans que rien ne
  soit cassé.
- **Pas de PWA.** Le service worker de la première version mettait en cache des
  routes `/api/` disparues. Rien ne le remplace pour l'instant.

---

## Archive

`docs/archive/` conserve la documentation de la première phase du projet.
Lire `docs/archive/LISEZ-MOI.md` avant d'y toucher : le README qui s'y trouve
décrit en détail une architecture qui n'a jamais fonctionné.

---

## Licence

Code : MIT. Données : Licence Ouverte 2.0, Assemblée nationale.
