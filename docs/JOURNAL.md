# Journal du projet

Retrace ce qui a été fait, et surtout **pourquoi**. Les décisions techniques
sont lisibles dans le code ; les raisons de les avoir prises, non. Ce fichier
existe pour qu'on ne refasse pas les mêmes erreurs — notamment celles qui ont
été commises puis corrigées ici.

Période couverte : 26–27 juillet 2026.

---

## 1. État initial

Huit fichiers à plat dans un dossier, sans dépôt git, sans point d'entrée de
build. Un `LISEZ-MOI.md` prévenait qu'une première phase du projet reposait sur
une API inexistante (`data.assemblee-nationale.fr/api/records/1.0/search/`,
motif Opendatasoft) et que 100 % des appels réseau échouaient.

Diagnostic à l'ouverture :

| Problème | Détail |
| --- | --- |
| `tokens.js` manquant | `App.jsx` l'importait → build impossible |
| Aucun point d'entrée | ni `index.html`, ni `main.jsx`, ni `vite.config.js` |
| `package.json` inadapté | scaffolding npm mort : `build` = `tsc` + `postcss` sur des chemins inexistants |
| App ↔ données déconnectées | `App.jsx` contenait 3 scrutins en dur ; `ingest.mjs` écrivait ailleurs |
| Bug JSX | `App.jsx:504` affichait littéralement `’` |
| `README.md` trompeur | décrivait l'archi Docker/Express que `LISEZ-MOI.md` déclarait inexistante |

---

## 2. La source de données a dû changer

`ingest.mjs` visait **NosDéputés.fr** en 17ᵉ législature. Vérification faite en
interrogeant `nosdeputes.fr/organismes/groupe/json` : les groupes renvoyés avec
`groupe_actuel: true` sont **Renaissance et les groupes NUPES** — la 16ᵉ
législature. Regards Citoyens n'assure plus la maintenance au-delà.

La source prévue était donc morte pour la législature visée : même classe de
problème que celui décrit dans `LISEZ-MOI.md`, une génération plus tard.

Bascule sur l'**open data officiel de l'Assemblée nationale** :

| Jeu | URL | Rythme |
| --- | --- | --- |
| Scrutins | `…/repository/17/loi/scrutins/Scrutins.json.zip` | irrégulier |
| Députés et organes | `…/17/amo/deputes_actifs_mandats_actifs_organes/AMO10_….json.zip` | quotidien |

Licence Ouverte / Etalab 2.0 (et non ODbL comme le supposait l'archive).

---

## 3. Ce que la première ingestion réelle a révélé

Le script a été écrit défensivement — échouer en nommant les clés trouvées
plutôt que de publier des vides. Cette décision a payé : **chaque exécution a
révélé un problème que la lecture du code n'aurait pas montré.**

### 3.1 L'archive AMO10 n'est pas un fichier composite

L'Assemblée la documente comme « composite ». Elle contient en réalité
**7 740 fichiers**, un par entité, dans `json/acteur/`, `json/organe/` et
`json/deport/`. Le code lisait le premier fichier venu en le prenant pour un
index global → zéro groupe politique trouvé, garde-fou déclenché.

### 3.2 Trois acronymes de groupe étaient faux

L'Assemblée publie dans `libelleAbrev` des sigles qui ne sont pas ceux de
l'usage courant :

| Usage courant | Publié par l'AN |
| --- | --- |
| `LFI` | **`LFI-NFP`** |
| `ECO` | **`ECOS`** |
| `UDR` | **`UDDPLR`** |

Cette erreur-là n'aurait **rien cassé** : les trois groupes seraient apparus en
gris, en fin de rang. Une panne silencieuse — le pire genre. Un test verrouille
désormais les douze acronymes.

### 3.3 EMFILE sur macOS

La correction de 3.1 lisait les 7 126 organes en un seul `Promise.all` →
`EMFILE: too many open files` (limite à 256 sur macOS). Lecture par lots de 64.

### 3.4 Deux références de groupe cassées dans la source

- **`PO847173`** — 3 041 scrutins, absent du référentiel des mandats *actifs*.
  Vérification : ce groupe (oct. 2024 → juil. 2025) et `UDDPLR` (sept. 2025 →
  juil. 2026) partagent **94 % de leurs membres** et ne se chevauchent jamais.
  Même groupe, avant et après reconstitution.
- **`PO0`** — 14 scrutins, identifiant corrompu. Apparaît toujours *à la place*
  du RN, jamais en plus, avec le bon effectif (123 membres).

Plutôt que de coder ces cas en dur, `resoudreGroupe()` interroge les députés
listés : si ≥ 70 % partagent un même groupe actuel, c'est celui-là. Résultat :
zéro référence orpheline, et la déduction est tracée dans le fichier produit
(`groupesDeduits`) au lieu d'être présentée comme une lecture directe.

### 3.5 Le cumul des effectifs était faux par construction

Premier calcul : maximum par groupe sur toute la législature, puis somme →
**847 sièges** pour une assemblée qui en compte 577. Les remplacements et
changements de groupe étaient comptés plusieurs fois. La composition vient
maintenant du scrutin le plus récent.

---

## 4. Les absents ne sont pas publiés

Découverte structurelle : l'Assemblée **ne nomme que les votants**. Le scrutin
médian en nomme 133 sur 577. Seul `nombreMembresGroupe` trahit l'effectif réel.

Sans traitement, l'hémicycle affichait 135 sièges en laissant croire qu'on
voyait la chambre entière. Les absents sont donc représentés par des sièges
gris **anonymes** — exacts en nombre, sans identité, avec mention explicite.
Une bascule *votants seuls* affiche la donnée brute.

---

## 5. Poids : 86 Mo → 20 Mo

| | Avant | Après |
| --- | --- | --- |
| Scrutins couverts | 8 434 (législature) | 5 381 (12 mois glissants) |
| Fichiers scrutin | 71,6 Mo | 18,3 Mo |
| `index.json` | 4,4 Mo | 1,4 Mo |
| Chargé à l'ouverture | 4,4 Mo | 1,4 Mo |

Deux leviers : une fenêtre glissante de 12 mois (`--mois 0` la lève), et la
sortie des noms vers un unique `deputes.json` de 18 Ko. Les répéter dans les
5 381 fichiers quadruplait la sortie.

---

## 6. Le piège des taux de participation

**Il n'y a pas de taux d'absentéisme dans ce projet, et c'est délibéré.**

Sur 12 mois, la répartition est :

| Type | Nombre | Médiane des votants |
| --- | --- | --- |
| Scrutin public ordinaire | 5 325 (99 %) | **133** / 577 |
| Scrutin public solennel | 43 | **530** / 577 |
| Motion de censure | 13 | 142 |

Un taux calculé sur l'ensemble afficherait ~77 % d'« absence » pour à peu près
tout le monde. Exact, et faux de sens : les scrutins ordinaires se tiennent
avec les députés présents en séance.

**Les motions de censure sont un cas à part.** L'article 49 de la Constitution
ne fait recenser que les voix *pour* : `contre` vaut 0 dans les treize motions
de la période. S'abstenir, s'opposer et être absent y sont indiscernables. Les
compter comme de la participation transformerait une position politique en
reproche d'absentéisme. Elles sont suivies séparément.

**L'accord avec la ligne du groupe**, en revanche, repose sur une donnée
publiée : `positionMajoritaire` est fournie par l'Assemblée pour chaque groupe
et chaque scrutin. Elle n'est pas reconstituée. Les « non votants » sont exclus
— ne pas prendre part n'est ni un accord ni un désaccord.

Illustration du besoin de contexte : Alain David affiche **86 %** de
participation aux solennels (médiane de son groupe : 86 %) mais **6 %** aux
ordinaires, contre une médiane SOC de 27 %. Le premier chiffre seul le dirait
exemplaire, le second seul le dirait négligent. D'où la règle : **aucun
pourcentage n'apparaît sans son dénominateur ni la médiane du groupe.**

---

## 7. Deux bugs introduits puis corrigés

### 7.1 Écran noir — boucle de rendu infinie

`ListeVirtuelle` avait un `useLayoutEffect` **sans tableau de dépendances**. Il
s'exécutait à chaque rendu, appelait `setFenetre` avec un objet neuf, ce qui
déclenchait un rendu, qui relançait l'effet. React abandonne, page vide.

Livré sans vérification d'exécution : la compilation avait été contrôlée, pas
le comportement. Trois garde-fous depuis, tous documentés dans le fichier.

### 7.2 Décalage d'un rang aux frontières

Trouvé en extrayant le calcul dans `src/fenetrage.js` pour le rendre testable :
la dichotomie utilisait `offsets[mid+1] < y` là où il fallait `<=`. Une ligne
s'étend sur `[haut, bas[`, donc celle dont le bas vaut exactement `y` ne couvre
pas `y`. Décalage à chaque position pile sur une bordure.

**Leçon appliquée** : le calcul pur vit désormais hors du composant, et le
montage réel est vérifié avec `react-dom/server` (5 381 items → 30 lignes dans
le DOM, hauteur totale exacte).

---

## 8. Interface actuelle

### Disposition

Grille à trois colonnes (`190px | 1fr | 280px`), qui passe en colonne unique
sous 1080 px.

```
┌──────────────────────────────────────────────────────────────┐
│ ASSEMBLÉE NATIONALE · 17ᵉ LÉGISLATURE · SCRUTIN N° 8434       │
│ Titre du scrutin                            [L'AN A ADOPTÉ]  │
│ Objet                                    date · majorité abs. │
├───────────┬──────────────────────────────┬───────────────────┤
│ recherche │  légende  [complet|votants]  │ GROUPES           │
│ ‹ juillet›│           [groupe |  vote ]  │ gauche → droite   │
│ L M M J V │                              │ ● GDR         17  │
│ · · 1 2 · │        ╭─────────────╮       │ ▬▬▬▬▬▬▬▬          │
│ 6 7 8 9 10│      ╱   hémicycle    ╲      │ ● LFI-NFP     71  │
│ · · 15 16 │     │   577 sièges     │     │ ▬▬▬▬▬▬▬▬          │
│ 20 [21] · │      ╲               ╱       │ …                 │
│ ───────── │        ╰─────────────╯       │                   │
│ 7 scrutins│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬      │                   │
│ n° 8434 … │  276 pour  86 contre …       │                   │
├───────────┴──────────────────────────────┴───────────────────┤
│ ANALYSE DU SCRUTIN · position de chaque député                │
│ [recherche]  [tous les groupes]                               │
│ ● SOC  68 membres · 40 absents                                │
│ ┌────────┬────────┬────────────┬────────────┬──────────┐      │
│ │ Pour   │ Contre │ Abstention │ Non votants│ Absents  │      │
│ └────────┴────────┴────────────┴────────────┴──────────┘      │
└───────────────────────────────────────────────────────────────┘
```

### Direction artistique

Achromatique : encre chaude (`#14110F`) et os (`#EDE6DA`). **La seule couleur
saturée de la page vient des groupes eux-mêmes.** Trois familles typographiques
— Archivo (titres, condensé), Spectral (texte courant), IBM Plex Mono
(chiffres, avec chiffres tabulaires).

### Composants

| Élément | Comportement |
| --- | --- |
| **Rail — calendrier** | Grille mensuelle. Les jours de séance portent une pastille dont l'intensité suit le nombre de scrutins ; les autres restent en retrait. Les flèches ‹ › sautent aux mois *contenant* des scrutins, pour ne pas cliquer dans le vide pendant les suspensions de session. Sous la grille, la liste courte du jour choisi. |
| **Rail — recherche** | Dès qu'un terme est saisi, le calendrier cède la place à la liste virtualisée des résultats. Deux modes exclusifs : le calendrier pour parcourir le temps, la liste pour retrouver un texte précis. |
| **Hémicycle** | SVG, 577 sièges sur 11 rangs, gauche (θ = π) → droite (θ = 0). Survol → infobulle. Clic sur un siège nommé → fiche. Clic sur un siège anonyme → sélection du groupe. |
| **Bascule étendue** | *hémicycle complet* (défaut) / *votants seuls*. |
| **Bascule coloration** | *par groupe* (pour = plein, contre = cerclé, abstention = 34 % d'opacité) / *par vote*. |
| **Barre de décompte** | Proportions pour / contre / abstention / non votants. |
| **Liste des groupes** | Ordre gauche → droite. Clic = isoler un groupe (les autres passent à 12 % d'opacité). |
| **Analyse nominative** | Cinq colonnes par groupe, noms cliquables. |
| **Fiche de député** | Panneau latéral 480 px + voile. Échap ferme. Jauges avec médiane du groupe en surimpression. |

### Fichiers de données consommés

| Fichier | Quand |
| --- | --- |
| `donnees/index.json` | au chargement |
| `donnees/deputes.json` | au chargement |
| `donnees/scrutin-N.json` | à la sélection d'un scrutin |
| `donnees/depute/PA###.json` | à l'ouverture d'une fiche |

---

## 9. Vérifications en place

**61 tests**, sans aucune dépendance externe (`node:test`) :

| Fichier | Ce qu'il verrouille |
| --- | --- |
| `partition.test.mjs` | l'invariant : un député dans exactement une case |
| `ingest.test.mjs` | structure réelle d'AMO10, normalisation, échecs explicites |
| `deputes.test.mjs` | censure ≠ présence, dénominateurs, médianes |
| `hemicycle.test.mjs` | 577 demandés = 577 placés, θ ∈ ]0, π[, pas de superposition |
| `fenetrage.test.mjs` | dichotomie vs parcours linéaire, bornes, déterminisme |
| `tokens.test.mjs` | cohérence CSS ↔ JS, acronymes officiels |

---

## 10. Reste à faire

- [ ] **Connecter Cloudflare Pages au dépôt** — l'étape « Connexion via
      GitHub » est un octroi de permissions, à accorder manuellement.
- [ ] **Accessibilité** — audit en cours ; voir `docs/ACCESSIBILITE.md`.
- [ ] Variables `SITE_URL` / `SITE_CONTACT` dans les *Variables* du dépôt.
- [ ] Self-hoster les polices pour supprimer la dépendance à Google Fonts.
