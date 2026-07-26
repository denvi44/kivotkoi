# Archive — ne rien réutiliser sans lire ceci

Ces fichiers datent de la première phase du projet. **Ils ne fonctionnent pas.**
Ils sont conservés pour l'historique, pas pour être repris.

## Pourquoi ils sont morts

Ils reposent tous, directement ou par transitivité, sur une API inexistante :
`data.assemblee-nationale.fr/api/records/1.0/search/` avec des jeux de données
`scrutins` et `votes-personnels`. C'est un motif d'URL Opendatasoft ;
l'Assemblée nationale ne fait pas tourner Opendatasoft et distribue ses données
en archives XML/JSON à télécharger. Les noms de champs (`num_scrutin`,
`vote_pour`, `position_poste`) n'existent pas davantage.

Conséquence : 100 % des appels réseau échouent.

La source réelle est l'open data de l'Assemblée nationale
(`data.assemblee-nationale.fr`), branchée dans `scripts/ingest.mjs`.

> **Mise à jour du 26 juillet 2026.** Ce document désignait NosDéputés.fr
> (Regards Citoyens) comme source de remplacement. Vérification faite,
> NosDéputés.fr ne couvre pas la 17ᵉ législature : Regards Citoyens n'assure
> plus la maintenance au-delà de la 16ᵉ, et `nosdeputes.fr/organismes/groupe/json`
> renvoie encore Renaissance et les groupes NUPES avec `groupe_actuel: true`.
> Le projet est donc passé à l'open data officiel de l'Assemblée
> (jeux `Scrutins.json.zip` et `AMO10_deputes_actifs_…json.zip`,
> Licence Ouverte 2.0). Voir le `README.md` à la racine.

## Défauts propres à certains fichiers

- `poc-hemicycle.jsx` — génère 492 sièges au lieu de 577, et l'angle atteint
  1,73 π : les sièges bouclent au-delà du demi-cercle et se superposent.
  Les couleurs de groupe n'y sont jamais appliquées aux sièges.
  Remplacé par `src/App.jsx`, dont la géométrie est vérifiée.
- `package.json`, `src-*.ts`, `.npmignore` — échafaudage d'un paquet npm dont
  aucun des neuf modules référencés n'a été écrit. `.npmignore` exclut à la fois
  `dist/` et `src/` alors que `package.json` déclare les publier : l'archive
  produite serait vide.
- `service-worker.js` — met en cache des routes `/api/` qui n'existent plus dans
  l'architecture statique. La structure est réutilisable, la stratégie non.
- `COULEURS_PARTIS.json` — composition de la 16ᵉ législature. Périmée.
- Les 12 fichiers Markdown — 4 921 lignes décrivant en détail l'architecture
  ci-dessus. Ce sont les plus nuisibles : ils sont convaincants et faux.

## unraid/

`Caddyfile` et `docker-compose.yml` sont corrects, mais correspondent à
l'hébergement auto-géré, écarté au profit de Cloudflare Pages. À reprendre tels
quels en cas de changement d'avis.
