# kivotkoi

Visualisation des scrutins publics de l'Assemblée nationale : pour chaque
scrutin, la position de vote de chaque député, colorée par groupe dans
l'hémicycle.

Site statique. Aucun serveur d'application, aucune base de données, aucun appel
réseau au moment de la visite : un script d'ingestion transforme l'open data
officiel en fichiers JSON, et le site les sert tels quels.

En ligne : <https://kivotkoi.pages.dev>

---

## Ce que le projet garantit

Un député appartient à **exactement une** case : `pour`, `contre`,
`abstention`, `nonVotant`, `absent`. Ni zéro, ni deux.

Cet invariant est codé dans `scripts/partition.mjs`, testé dans
`test/partition.test.mjs`, vérifié à l'ingestion, puis **re-vérifié côté
client** au chargement de chaque scrutin. Si un scrutin le rompt, il n'est pas
publié ; si un fichier publié le rompt, l'interface affiche « décompte non
fiable » au lieu d'un total d'apparence normale.

Trois distinctions volontairement maintenues :

- **`nonVotant` ≠ `absent`.** Le premier est présent en séance mais ne prend
  pas part au vote (président de séance, notamment). Les fondre fabrique un
  faux taux d'absentéisme. La règle vaut aussi pour l'**affichage** : elle a
  déjà cédé là, et pas ailleurs — voir « Une régression instructive » plus bas.
- **L'identifiant, jamais le nom.** Des homonymes siègent réellement à
  l'Assemblée, et un nom se sérialise différemment selon la source. La clé est
  toujours l'`uid` officiel (`PA######`).
- **Ce qui est publié ≠ ce qui est déduit.** Toute valeur reconstituée est
  signalée comme telle dans le fichier produit et dans l'interface, et
  abandonnée dès qu'elle n'est plus démontrable.

---

## Source des données

Quatre archives, toutes en Licence Ouverte / Open Licence 2.0 (Etalab),
attribution à l'Assemblée nationale. Racine commune :
`https://data.assemblee-nationale.fr/static/openData/repository/17/`

| Jeu | Chemin | À quoi il sert |
| --- | --- | --- |
| Scrutins | `loi/scrutins/Scrutins.json.zip` | les votes eux-mêmes |
| Députés actifs | `amo/deputes_actifs_mandats_actifs_organes/AMO10_….json.zip` | noms, groupes, effectifs |
| Historique depuis 1997 | `amo/tous_acteurs_mandats_organes_xi_legislature/AMO30_….json.zip` | députés remplacés en cours de mandat |
| Dossiers législatifs | `loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip` | lien vers le texte de loi |

`AMO30` n'est pas un luxe : `AMO10` ignore les députés remplacés en cours de
législature, ce qui rend l'effectif des groupes systématiquement trop court et
la reconstitution des absents impossible.

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

L'ingestion prend quelques minutes la première fois : quatre archives à
télécharger et décompresser, puis un scrutin validé à la fois. Sans elle,
l'application affiche un écran « Données indisponibles » explicite plutôt
qu'une page blanche.

**En pratique, cette commande n'est plus nécessaire** : l'ingestion tourne
chaque jour sur GitHub Actions et commite le résultat (voir plus bas). On la
lance à la main pour déboguer, ou pour travailler sur des données fraîches sans
attendre le lendemain.

### Autres commandes

```bash
npm test            # 134 tests, sans dépendance externe (node:test)
npm run build       # produit dist/
npm run preview     # sert dist/ localement
npm run lint
npm run ingest -- --inspecter    # imprime la forme réelle d'un scrutin
npm run ingest -- --mois 0       # lève la fenêtre de 12 mois
```

---

## Arborescence

```
.
├── index.html                  point d'entrée Vite
├── src/
│   ├── main.jsx                montage React
│   ├── App.jsx                 interface : hémicycle, calendrier, analyse
│   ├── Entete.jsx              titre et logo tricolore (SVG, pas d'image)
│   ├── Calendrier.jsx          navigation par mois et par jour
│   ├── ListeVirtuelle.jsx      liste virtualisée à hauteurs variables
│   ├── FicheDepute.jsx         panneau de profil d'un député
│   ├── index.css               feuille de style ; :root porte les couleurs
│   ├── tokens.js               mêmes couleurs, pour les attributs SVG
│   ├── groupes.js              ordre gauche→droite, couleurs, dénominations
│   ├── hemicycle.js            géométrie des sièges en arcs
│   ├── fenetrage.js            arithmétique de la virtualisation
│   ├── dates.js                regroupement par mois et par jour
│   ├── intitule.js             sépare le sujet du texte de l'objet procédural
│   ├── liens.js                adresses des textes et dossiers législatifs
│   ├── decompte.js             les nombres affichés sous l'hémicycle
│   └── chambres.js             ce qui distingue l'Assemblée du Sénat
├── scripts/
│   ├── ingest.mjs              orchestrateur : open data → public/donnees/
│   ├── partition.mjs           l'invariant central
│   ├── absents.mjs             reconstitution nominative des absents
│   ├── dossiers.mjs            rattachement d'un scrutin à son texte
│   ├── deputes.mjs             fiches individuelles
│   └── senat.mjs               normalisation Sénat — écrit, pas branché
├── test/                       12 fichiers, 134 tests, node:test
├── docs/
│   ├── JOURNAL.md              historique des décisions du projet
│   ├── ACCESSIBILITE.md        audit RGAA 4.1 et points restants
│   └── archive/                documentation de la première phase
├── public/
│   ├── donnees/                sortie de l'ingestion — versionnée
│   ├── _headers                en-têtes Cloudflare (CSP, cache)
│   └── _redirects              réécriture SPA
└── .github/workflows/
    └── ingestion.yml           ingestion quotidienne + commit
```

### Fichiers produits par l'ingestion

Mesuré le 28 juillet 2026 sur une fenêtre de douze mois : **5 381 scrutins**,
du 8 septembre 2025 au 21 juillet 2026, **70 Mo** au total.

| Fichier | Contenu | Poids |
| --- | --- | --- |
| `index.json` | numéro, date, sujet, objet, sort et clé de dossier de chaque scrutin, plus le dictionnaire des 106 dossiers | ~1,9 Mo |
| `deputes.json` | identifiant → nom, y compris les députés remplacés | ~18 Ko |
| `scrutin-N.json` | par groupe : listes d'identifiants par case, effectif, absents nommés, ligne du groupe | ~9 Ko |
| `depute/PA###.json` | parti, mandats, participation, accord avec la ligne — 624 fiches | ~10 Ko |

Les fichiers de scrutin ne portent que des identifiants ; les noms vivent
uniquement dans `deputes.json`. Les répéter à chaque scrutin quadruplait la
sortie.

Ces fichiers sont **versionnés dans git**. Ce n'est pas un oubli : c'est ce qui
permet au site de rester correct si l'open data de l'Assemblée est indisponible
au moment d'un déploiement, et ce qui rend chaque publication auditable dans
l'historique.

---

## Ce que le site montre

- **Un hémicycle à 577 sièges**, colorés par groupe ou par vote. La forme des
  sièges encode le vote dans les deux modes, pas seulement la couleur : sans
  cela, un daltonien ne distinguerait pas « pour » de « contre » (WCAG 1.4.1).
- **Un calendrier** plutôt qu'un rail sans fin : un mois à la fois, les jours
  avec scrutin marqués, la liste du jour dessous. La recherche par titre ou
  numéro bascule sur une liste virtualisée.
- **L'analyse nominative** : par groupe, la liste des députés dans chacune des
  cinq cases, chaque nom menant à sa fiche.
- **Les liens vers la source** : le texte de loi, le dossier législatif et la
  page du scrutin sur `assemblee-nationale.fr`. Le site dit comment on a voté,
  jamais ce que dit le texte.

### Le sujet avant la procédure

`libelleTypeVote` et `demandeur` produisent des intitulés comme « amendement
n° 160 de Mme Cathala après l'article 2 » — illisible sans savoir de quel texte
il s'agit. `src/intitule.js` sépare le sujet (« Projet de loi relatif à la
protection des enfants ») de l'objet procédural, et affiche le premier en titre.
La séparation aboutit sur **99,6 %** des scrutins ; sur le reste, l'intitulé
brut est affiché tel quel plutôt que découpé au hasard.

### Les liens vers les textes

Un fichier de scrutin ne référence aucun dossier législatif. Le lien se fait
dans l'autre sens : les actes législatifs portent un champ `voteRef`. Le
rapprochement par titre avait été essayé d'abord — 29 % de couverture et des
faux positifs ; `voteRef` en donne **94,8 %** sans ambiguïté. Quand deux
dossiers revendiquent la même clé de texte, la clé est supprimée : pas de lien
vaut mieux qu'un lien vers le mauvais texte.

---

## Ce que la source ne dit pas

Ces limites viennent des données, pas du code. Elles sont assumées et visibles
dans l'interface plutôt que masquées.

### Les absents, nommés par reconstitution vérifiée

L'Assemblée ne publie que les députés ayant pris part au vote : un scrutin
ordinaire en nomme environ 135 sur 577. Seul `nombreMembresGroupe` trahit
l'effectif réel.

`scripts/absents.mjs` reconstitue l'effectif de chaque groupe à la date du
scrutin depuis l'historique des mandats, puis en retire les votants. Le
résultat n'est retenu que s'il passe **deux contrôles indépendants** :

1. l'effectif reconstitué doit égaler l'effectif annoncé par la source ;
2. aucun votant ne doit se trouver hors de cet effectif.

Le procédé a été mesuré avant d'être publié : sur 8 102 couples
(groupe, scrutin) où les deux méthodes pouvaient être comparées, elles
s'accordaient à 100 %. En production, **98,5 %** des absents sont nommés
(2 139 867 sur 2 171 866). Le reste — surtout EPR, DR et LIOT, les groupes aux
mouvements de mandats les plus fréquents — demeure anonyme : le siège est
compté, gris, sans nom, et l'interface dit pourquoi.

Un absent n'est jamais inventé. Quand le contrôle échoue, on perd le nom, pas
le décompte.

### Les références de groupe cassées

Les groupes dissous manquent au référentiel des mandats actifs (`PO847173`), et
`PO0` apparaît à la place du RN dans quelques scrutins. Plutôt que de coder ces
cas en dur, `resoudreGroupe()` interroge les députés listés : si 70 % au moins
partagent un même groupe actuel, c'est celui-là. La déduction est signalée dans
le fichier produit (`groupesDeduits`), jamais présentée comme une lecture
directe. Un groupe non résolu garde son identifiant brut `PO######`.

### L'ordre gauche–droite est éditorial

L'open data ne dit pas où placer un groupe sur cet axe. Le choix vit dans
`src/groupes.js` ; un groupe absent de la liste est placé en fin de rang, en
gris, et signalé dans l'interface.

### Le piège des taux de participation

Il n'y a **pas de taux d'absentéisme** dans ce projet, et c'est délibéré.

Sur les douze mois ingérés, la répartition est la suivante :

| Type de scrutin | Nombre | Part | Médiane des votants |
| --- | ---: | ---: | ---: |
| scrutin public ordinaire | 5 325 | 99,0 % | 135 |
| scrutin public solennel | 43 | 0,8 % | 532 |
| motion de censure | 13 | 0,2 % | 144 |

Les scrutins ordinaires se tiennent avec les députés présents en séance ; ne
pas y figurer est la norme. Un taux calculé sur l'ensemble afficherait environ
77 % d'« absence » pour à peu près tout le monde — exact, et faux de sens.

`scripts/deputes.mjs` ventile donc la participation par type de scrutin, met en
avant les *solennels*, où la présence est attendue, et affiche systématiquement
la médiane du groupe en regard. Aucun pourcentage n'apparaît sans son
dénominateur.

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

### Attention aux acronymes

Ce sont ceux du champ `libelleAbrev`, pas ceux de l'usage courant. `LFI-NFP` et
non `LFI`, `ECOS` et non `ECO`, `UDDPLR` et non `UDR`. Une erreur ici ne casse
rien — elle déclasse silencieusement le groupe en gris. Le test
`tokens.test.mjs` verrouille les douze valeurs. L'interface affiche la
dénomination complète en regard de l'acronyme.

---

## Une régression instructive

Le 28 juillet 2026, la légende sous l'hémicycle annonçait **213 non-votants**
sur le scrutin 8434. Il y en avait **2**.

Les données étaient justes : le fichier publié comptait bien `nonVotant: 2` et
211 absents. C'est l'affichage qui additionnait les deux cases et étiquetait la
somme du nom de la première — exactement la confusion que ce README interdit
plus haut, au seul endroit du site qui avance un chiffre rond.

Deux enseignements, tous deux appliqués :

- **Un invariant qui n'est vrai que dans les données n'est pas tenu.** Il doit
  l'être jusqu'au chiffre affiché.
- **Le calcul vivait dans le JSX, où rien ne le testait.** Il est sorti dans
  `src/decompte.js` ; `test/decompte.test.mjs` verrouille le cas 8434
  nommément, et la barre comme la légende sont désormais construites depuis la
  même liste — elles ne peuvent plus diverger.

---

## Déploiement

### Cloudflare Pages

| Champ | Valeur |
| --- | --- |
| Dépôt | `denvi44/kivotkoi`, branche `main` |
| Framework preset | `None` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variable `NODE_VERSION` | `20` |
| Déploiements automatiques | activés |

Aucune variable d'environnement n'est nécessaire au build : les données sont
déjà dans le dépôt. Tout commit sur `main` déclenche un déploiement, y compris
celui du robot d'ingestion.

> Cloudflare construit en Node 20, l'ingestion tourne en Node 22 sur GitHub
> Actions. L'écart est sans effet — `package.json` déclare `node >= 20` — mais
> il est volontaire : les runners GitHub déprécient Node 20.

### Ingestion automatique

`.github/workflows/ingestion.yml` s'exécute chaque jour à **07h20 UTC** —
l'open data de l'Assemblée est republié vers 03h–06h UTC — et peut être
déclenché à la main (*Actions → Ingestion des scrutins → Run workflow*). Six
étapes :

1. **Cohérence du lockfile.** `npm ci` refuse de tourner si `package.json` et
   `package-lock.json` ne s'accordent pas, et son message brut ne dit pas
   pourquoi. Un simple renommage du paquet suffit à les désynchroniser ; c'est
   arrivé au renommage en « kivotkoi ».
2. `npm ci`
3. **Tests d'invariant**, *avant* l'ingestion : si `partition.mjs` est cassé, on
   ne veut pas le découvrir dans les données publiées.
4. **Ingestion** des quatre archives.
5. **Contrôle de non-régression.** Un index contenant moins de scrutins que
   celui déjà en ligne fait échouer le job : mieux vaut ne rien publier
   qu'amputer le site.
6. **Commit si changement**, qui déclenche le déploiement Cloudflare.

Le cycle complet prend environ une minute. Deux variables de dépôt
(*Settings → Secrets and variables → Actions → Variables*) permettent à
l'Assemblée d'identifier le client dans ses journaux :

```
SITE_URL      https://kivotkoi.pages.dev
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

## Accessibilité

Audit RGAA 4.1 / WCAG 2.1 AA dans `docs/ACCESSIBILITE.md`, avec les points
restants et les arbitrages assumés. En résumé :

- Les 577 sièges ne sont pas dans l'ordre de tabulation — ce serait 577 arrêts
  avant d'atteindre le reste de la page. L'équivalent accessible n'est pas un
  contournement mais la section « Analyse du scrutin », qui liste chaque député
  sous forme de bouton menant à la même fiche. Le graphique porte un résumé
  chiffré et y renvoie.
- Le vote est encodé par la forme autant que par la couleur.
- **Deux couleurs de groupe restent sous le seuil** de 3:1 exigé par WCAG
  1.4.11 sur le fond du panneau : RN (1,36:1) et UDDPLR (2,05:1). Les corriger
  suppose de s'éloigner de la couleur d'usage du groupe. Les deux options
  restantes sont documentées ; aucune n'est encore tranchée.

---

## Chantiers en cours

### Sénat — écrit, pas branché

L'architecture est prête : `scripts/senat.mjs` normalise les scrutins publics du
Sénat vers le même schéma, `src/chambres.js` isole les 348 sièges, la palette
des groupes et les différences de fond entre les deux sources — le Sénat nomme
**tout le monde**, y compris les non-votants, là où l'Assemblée ne nomme que les
votants.

**Rien n'est publié**, et le blocage n'est pas technique. Au 27 juillet 2026,
les fichiers de scrutin (`scrutin-public/{session}/scr{session}-{n}.json`) ne
figurent pas parmi les jeux listés sur `data.senat.fr` sous Licence Ouverte
2.0. Tant que le Sénat n'a pas confirmé leur statut, ces données ne seront pas
mises en ligne.

### Ce qui n'est pas fait

- **Pas de vulgarisation des textes.** Résumer en langage courant une loi sur
  l'aide à mourir ou le narcotrafic, c'est publier une interprétation. Le site
  renvoie vers le texte officiel et s'arrête là. Décision assumée, pas un
  manque de temps.
- **Fenêtre glissante de 12 mois.** La législature entière compte 8 400
  scrutins pour 86 Mo, recommittés à chaque ingestion.
- **Fraîcheur.** `Scrutins.json.zip` n'est pas republié tous les jours. Le pied
  de page affiche la date d'ingestion, pas celle du dernier scrutin — les deux
  peuvent diverger de plusieurs semaines sans que rien ne soit cassé.
- **Pas de PWA.** Le service worker de la première version mettait en cache des
  routes `/api/` disparues. Rien ne le remplace.

---

## Archive

`docs/archive/` conserve la documentation de la première phase du projet.
Lire `docs/archive/LISEZ-MOI.md` avant d'y toucher : le README qui s'y trouve
décrit en détail une architecture qui n'a jamais fonctionné.

---

## Licence

Code : MIT. Données : Licence Ouverte 2.0, Assemblée nationale.
