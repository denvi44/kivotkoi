# Accessibilité

Audit RGAA 4.1 mené le 27 juillet 2026 sur le rendu local, avec le serveur
d'audit RGAA (axe-core + tests dédiés), complété d'une revue de code et de
calculs de contraste.

---

## Résultat

| Critère | Avant | Après |
| --- | --- | --- |
| **3.2** — contraste texte / fond (WCAG 1.4.3) | ❌ 3 violations | ✅ conforme |
| **3.3** — contraste des composants (1.4.11) | ❌ 1 violation | ✅ conforme |
| **9.1** — structuration par titres (1.3.1) | ❌ saut h1 → h3 | ✅ conforme |
| **10.7** — visibilité du focus (2.4.7) | ❌ `outline:none` | ✅ aucune violation |
| 1.1, 7.1, 7.3, 11.1 | ✅ | ✅ |

Le taux automatique passe de **50 % à 100 %** sur les critères testés. Un audit
outillé ne remplace pas un test avec un lecteur d'écran réel — voir « Ce qui
reste à vérifier ».

---

## Ce qui a été corrigé

### Contraste du texte

Trois libellés échouaient au seuil de 4,5:1 sur `--slate` :

| Élément | Couleur | Ratio |
| --- | --- | --- |
| « Contre » | `--contre` `#C05A4A` | 3,91 |
| « Non votants » | `--absent` `#4A433C` | **1,75** |
| « Absents » | `--absent` `#4A433C` | **1,75** |

Cause : des jetons calibrés pour des **aplats** (sièges, barres) réemployés
comme couleur de **texte**. Un aplat n'a besoin que de 3:1, un texte de 4,5:1.

Deux variantes dédiées ont été ajoutées plutôt que de modifier les jetons
d'origine, qui restent justes pour leur usage : `--contre-txt` `#C66A5B` et
`--absent-txt` `#8F8275`, toutes deux à 4,57.

### Contraste des composants

La bordure des champs de recherche utilisait `--line` `#3A332E`, soit **1,38:1**
— acceptable pour un séparateur décoratif, insuffisant pour délimiter un
composant. Nouveau jeton `--bordure-champ` `#74665C`, à 3,09.

### Hiérarchie des titres

La page passait de `<h1>` (titre du scrutin) directement à `<h3>` (acronymes de
groupe). Les libellés de section n'étaient que des `<div class="eyebrow">` :
visuellement des titres, structurellement rien. Un lecteur d'écran ne pouvait
donc pas naviguer de section en section.

Quatre `<h2>` ont été introduits — *Scrutins*, *Hémicycle*, *Groupes*,
*Analyse du scrutin* — dont un en `sr-only` pour l'hémicycle, la section n'ayant
pas de titre visible dans la maquette.

### Focus

`.fiche:focus { outline: none }` supprimait l'indicateur de focus du panneau.
Règle retirée : **il n'y a plus aucun `outline:none` dans le projet**, même
ciblé. C'est la cause la plus fréquente d'inaccessibilité au clavier, et une
exception ouvre la porte aux suivantes.

### Piège de tabulation dans le panneau

Le panneau de fiche s'ouvre en `role="dialog" aria-modal="true"`, mais la
tabulation en sortait et parcourait la page située derrière le voile —
invisible, pourtant toujours atteignable. Ajout d'un confinement du focus
(Tab et Shift+Tab bouclent) et **restauration du focus sur l'élément d'origine
à la fermeture** : sans quoi, après consultation d'une fiche, on repartait au
début du document en perdant sa place dans une liste de plusieurs centaines de
noms.

### Couleur seule

En mode *par vote*, « pour » et « contre » ne se distinguaient que par la
couleur (WCAG 1.4.1). L'encodage par la forme — plein / cerclé / estompé —
s'applique désormais aux **deux** modes, et la légende reflète ces formes.

### Zones défilantes

Les colonnes de noms sont limitées à 340 px avec défilement. Sans
`tabindex="0"`, les noms au-delà étaient inatteignables sans souris
(WCAG 2.1.1). L'attribut n'est posé que si la liste dépasse huit entrées, pour
ne pas multiplier les arrêts de tabulation inutiles.

### Liens d'évitement

Deux liens, premiers éléments focusables de la page, permettent de sauter le
rail — plusieurs milliers de scrutins — vers l'hémicycle ou l'analyse.

---

## L'hémicycle et le clavier

**Les 577 sièges ne sont pas dans l'ordre de tabulation, et c'est délibéré.**
Les rendre focusables imposerait 577 arrêts avant d'atteindre le reste de la
page — une conformité de façade, hostile en pratique.

L'équivalent accessible n'est pas un contournement : la section *Analyse du
scrutin* liste **chaque député** sous forme de bouton ouvrant la même fiche que
le siège correspondant. La parité fonctionnelle est donc complète.

Le graphique porte un `role="img"` et un résumé chiffré généré à partir des
données réelles :

> Hémicycle de 577 sièges. 276 pour, 86 contre, 2 abstention, 213 n'ont pas
> pris part au vote. Le détail par député figure dans la section « Analyse du
> scrutin ».

Un paragraphe `sr-only` renvoie explicitement vers cette section.

---

## Les couleurs de groupe — arbitrage rendu

Quatre groupes n'atteignaient pas 3:1 contre le fond du panneau, dont le RN à
**1,36** — le groupe le plus nombreux (122 sièges), dont les sièges se
confondaient avec le fond.

La voie retenue **ne touche pas aux couleurs de parti**. Plutôt que d'éclaircir
un bleu marine — ce qui le fait mécaniquement virer au bleu-violet et trahit
l'identité du groupe —, c'est le **gris neutre des absents** qui a été éclairci,
de `#4A433C` (1,76:1) à `#7A7066` (3,53:1). Le contraste entre sièges votants
et sièges absents augmente donc par le bas, sans qu'aucune couleur politique
soit modifiée.

Conséquence traitée : ce gris entrait alors en collision avec celui du groupe
NI (ΔE 5,8, sous le seuil de confusion de 20). **NI** est passé de `#6B6259` à
un kaki `#A08B5E` — ΔE 22,8, contraste 5,17. « Non inscrit » désigne une
absence de rattachement, pas une famille politique : aucune identité n'est
altérée là non plus.

Ce qui **reste ouvert** : le RN et l'UDDPLR conservent un contraste de 1,36 et
2,05 contre le fond du panneau, sous le seuil de WCAG 1.4.11. Le rendu a été
jugé acceptable à l'œil — les sièges se détachent désormais du gris voisin —
mais la non-conformité formelle subsiste. Deux voies restent disponibles si le
besoin s'en fait sentir :

1. **Liseré clair sur les sièges sombres** — la forme reste perceptible sans
   changer la couleur de remplissage.
2. **Fond plus clair sous l'hémicycle** — fonctionne pour les couleurs sombres,
   mais casse les couleurs claires (EPR `#F0D040`) et la direction artistique.

---

## Ce qui reste à vérifier

L'audit automatique couvre environ **30 %** des critères RGAA. Le reste exige
un test humain.

- [ ] **Lecteur d'écran réel** — NVDA + Firefox, puis VoiceOver + Safari. Aucun
      outil ne simule le comportement réel des technologies d'assistance.
- [ ] **Parcours clavier complet** — vérifier l'ordre de tabulation, notamment
      l'entrée et la sortie du rail virtualisé, dont le contenu change au
      défilement.
- [ ] **Zoom à 200 % et 400 %** (WCAG 1.4.4 et 1.4.10).
- [ ] **Cibles tactiles** — les sièges font environ 11 px de diamètre, sous le
      minimum de 24 px de WCAG 2.5.8. La liste nominative offre une alternative,
      mais l'hémicycle reste peu praticable au doigt.
- [ ] **Tailles de texte** — plusieurs libellés sont à 10–11 px. Aucun minimum
      n'est imposé par le RGAA, mais c'est petit.
- [ ] **Déclaration d'accessibilité** — obligatoire pour un service public au
      sens de la loi du 11 février 2005. Générable via le serveur d'audit une
      fois l'audit humain mené.

---

## Non-régression

`test/tokens.test.mjs` verrouille les seuils de contraste : toute couleur de
texte doit atteindre 4,5:1 sur les deux fonds, la bordure de champ et
l'indicateur de focus 3:1. Un ajustement esthétique qui les casserait fait
échouer les tests plutôt que de passer inaperçu.

Le fichier vérifie aussi que `src/tokens.js` et le bloc `:root` de
`src/index.css` ne divergent pas — les couleurs y vivent en double, le CSS pour
la page et le JS pour les attributs `fill` du SVG.
