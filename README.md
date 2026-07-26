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

`public/donnees/index.json` — liste des scrutins, groupes et effectifs.
`public/donnees/scrutin-N.json` — un fichier par scrutin, avec la liste
nominative par groupe et par case.

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

## Points connus

- **Fraîcheur des scrutins.** L'archive `Scrutins.json.zip` n'est pas republiée
  tous les jours par l'Assemblée. Le pied de page affiche la date d'ingestion,
  pas la date du dernier scrutin — les deux peuvent diverger de plusieurs
  semaines sans que rien ne soit cassé.
- **Ordre des groupes.** L'open data ne dit pas où placer un groupe sur l'axe
  gauche–droite : c'est un choix éditorial, assumé dans `src/groupes.js`. Un
  groupe absent de cette liste est placé en fin de rang, en gris, et signalé
  dans l'interface.
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
