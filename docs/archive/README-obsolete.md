> ## ⚠️ DOCUMENT OBSOLÈTE — NE PAS SUIVRE
>
> Ce fichier décrit une architecture (backend Express, Docker Compose, API
> Opendatasoft `data.assemblee-nationale.fr/api/records/1.0/search/`) qui
> **n'a jamais existé**. Chaque commande, chaque endpoint, chaque nom de champ
> qui suit est faux. Il est conservé pour l'historique uniquement.
>
> Lire `docs/archive/LISEZ-MOI.md` pour le détail, et le `README.md` à la
> racine pour l'architecture réelle : site statique Vite, données produites
> hors ligne par `scripts/ingest.mjs` depuis l'open data officiel.

---

# 📊 Scrutins - Votes du Parlement Français

Une Progressive Web App (PWA) moderne pour explorer les votes de l'Assemblée Nationale et du Sénat français en temps réel.

## ✨ Caractéristiques

### 🚀 Fonctionnalités
- **Recherche en temps réel** par titre, numéro ou mots-clés
- **Filtrage avancé** :
  - Par plage de dates
  - Par plage de numéros d'amendement
  - Par chambre (AN / Sénat)
  - Par type de vote (pour/contre/abstention)
- **Visualisation interactive** des résultats
- **Données officielles** via l'API de l'Assemblée Nationale
- **Cache intelligent** pour fonctionner hors ligne
- **Installation PWA** directement depuis le navigateur
- **Export JSON** des résultats

### 📱 Progressive Web App
- Installation native sur mobile/desktop
- Fonctionnement offline complet
- Synchronisation en arrière-plan
- Interface responsive
- Performance optimisée

### 🔧 Architecture
- **Backend** : Node.js/Express avec cache
- **Frontend** : React + Tailwind CSS
- **API** : data.assemblee-nationale.fr
- **Infrastructure** : Docker + Docker Compose

---

## 🚀 Démarrage Rapide

### Option 1 : Docker Compose (Recommandé)
```bash
# Cloner le projet
git clone <url> scrutins-app
cd scrutins-app

# Démarrer les services
docker-compose up -d

# Accéder à l'app
# Frontend : http://localhost
# API : http://localhost:3000/api
```

### Option 2 : Installation Locale

#### Backend
```bash
cd backend
npm install
npm start
```

#### Frontend
```bash
cd frontend
npm install
REACT_APP_API_URL=http://localhost:3000/api npm start
```

### Option 3 : Version Vanilla (Légère)
```bash
# Servir le fichier HTML
npx http-server
# Ouvrir http://localhost:8080/index-vanilla.html
```

---

## 📁 Structure du Projet

```
scrutins-app/
├── backend/
│   ├── server.js          # Serveur Express
│   └── package.json
├── frontend/
│   ├── src/
│   │   └── App.jsx        # Composant React principal
│   ├── public/
│   │   └── index.html
│   └── package.json
├── docker-compose.yml     # Orchestration Docker
├── Dockerfile.backend     # Image backend
├── Dockerfile.frontend    # Image frontend
├── nginx.conf            # Config serveur web
├── manifest.json         # Manifest PWA
├── service-worker.js     # Service Worker
├── index-vanilla.html    # Version légère HTML/JS
├── GUIDE_UNRAID.md       # Guide déploiement Unraid
└── README.md
```

---

## 🔍 Utilisation

### Recherche Simple
Tapez dans la barre de recherche :
- `"énergie"` → Cherche dans titre et keywords
- `"4587"` → Recherche le numéro exact
- `"travail"` → Filtre par mot-clé

### Filtrage Avancé
1. Cliquez sur **"Filtres avancés"**
2. Remplissez les critères :
   - **Période** : du 01/01/2023 au 31/12/2023
   - **Numéros** : de 4200 à 4600
   - **Tri** : par date récente, ancienne, etc.
3. Les résultats se mettent à jour automatiquement

### Export des Données
Bouton **"Exporter JSON"** pour télécharger les résultats en JSON.

### Installation PWA
1. Ouvrir l'app dans navigateur
2. Bouton **"Installer"** appears
3. Installer comme app native
4. Fonctionne hors ligne automatiquement

---

## 🛠️ Configuration

### Variables d'Environnement

Créer `.env` :
```env
# Backend
NODE_ENV=production
PORT=3000
API_CACHE_TTL=3600

# Frontend
REACT_APP_API_URL=http://localhost:3000/api
REACT_APP_ENVIRONMENT=production
```

### Personnalisation

#### Changer le port frontend
```yaml
# docker-compose.yml
services:
  frontend:
    ports:
      - "8080:80"  # Accessible sur :8080
```

#### Modifier le TTL du cache
```bash
# Dans backend/server.js
const cache = new NodeCache({ stdTTL: 7200 }); // 2h au lieu de 1h
```

---

## 📊 API

### Endpoints

#### GET `/api/scrutins`
Lister les scrutins avec filtres.

**Paramètres** :
- `q` : texte de recherche
- `numeroFrom` : numéro minimum
- `numeroTo` : numéro maximum
- `dateFrom` : date début (YYYY-MM-DD)
- `dateTo` : date fin (YYYY-MM-DD)
- `chamber` : AN ou S
- `limit` : nombre résultats (max 100)

**Exemple** :
```
GET /api/scrutins?q=énergie&chamber=AN&limit=50
```

**Réponse** :
```json
{
  "records": [
    {
      "fields": {
        "num_scrutin": 4501,
        "titre": "Loi énergie et climat",
        "date_scrutin": "2023-10-02",
        "vote_pour": 310,
        "vote_contre": 150,
        "vote_abstention": 32
      }
    }
  ],
  "total": 150
}
```

#### GET `/api/scrutins/:numero`
Détails d'un scrutin spécifique.

```
GET /api/scrutins/4501
```

#### GET `/api/health`
Vérifier la santé du serveur.

```
GET /api/health
→ { "status": "ok", "timestamp": "..." }
```

#### POST `/api/cache/clear`
Vider le cache (admin).

```
POST /api/cache/clear
→ { "message": "Cache cleared" }
```

---

## 🐳 Déploiement

### Sur Unraid
Voir le guide complet : [GUIDE_UNRAID.md](./GUIDE_UNRAID.md)

### Sur Synology
```bash
# Créer package Docker personnalisé
docker load < scrutins-app.tar

# Via interface WebUI
```

### Sur Kubernetes
```bash
kubectl apply -f k8s-deployment.yaml
```

### Sur VPS (DigitalOcean, Linode, etc.)
```bash
# SSH sur le serveur
ssh user@server

# Cloner et démarrer
git clone <url> scrutins-app
cd scrutins-app
docker-compose up -d

# Accéder via domaine
# https://scrutins.votre-domaine.com
```

---

## 🔐 Sécurité

### Headers implémentés
- ✅ CSP (Content Security Policy)
- ✅ X-Frame-Options
- ✅ X-Content-Type-Options
- ✅ X-XSS-Protection
- ✅ Referrer-Policy

### Recommandations supplémentaires
1. **HTTPS obligatoire** en production
   ```bash
   # Avec Traefik + Let's Encrypt
   labels:
     - traefik.http.routers.scrutins.tls.certresolver=letsencrypt
   ```

2. **Rate limiting** (optionnel)
   ```javascript
   // Dans server.js
   const rateLimit = require('express-rate-limit');
   ```

3. **CORS** (déjà configuré)
   ```javascript
   app.use(cors());
   ```

---

## 📈 Performance

### Optimisations
- ✅ Gzip compression (Nginx)
- ✅ Cache HTTP 1 an pour assets
- ✅ Service Worker offline
- ✅ Lazy loading
- ✅ Pagination (100 max)
- ✅ Backend cache 1h

### Benchmarks
- Temps chargement initial : ~1.2s
- Recherche : <200ms (avec cache)
- Taille bundle frontend : ~45KB gzippé

### Améliorer encore
```bash
# 1. Ajouter Redis pour cache distribué
docker run -d --name redis redis:alpine

# 2. Implémenter CDN (CloudFlare, AWS CloudFront)

# 3. Pagination infinie au lieu de limite fixe

# 4. Web Worker pour parsing données
```

---

## 🧪 Tests

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test

# E2E avec Cypress
npm run cypress
```

---

## 📝 Logs & Monitoring

```bash
# Tous les logs
docker-compose logs -f

# Backend uniquement
docker-compose logs -f backend

# Frontend uniquement
docker-compose logs -f frontend

# Voir stats CPU/Mémoire
docker stats
```

---

## 🐛 Dépannage

### L'API ne répond pas
```bash
# Vérifier la connexion
docker exec scrutins-backend curl http://localhost:3000/api/health

# Vérifier les logs
docker-compose logs backend
```

### Données obsolètes
```bash
# Vider le cache
docker exec scrutins-backend curl -X POST http://localhost:3000/api/cache/clear
```

### Port déjà utilisé
```bash
# Libérer le port
lsof -i :3000
kill -9 <PID>
```

### PWA ne s'installe pas
```bash
# Vérifier :
# 1. HTTPS activé (ou localhost)
# 2. manifest.json valide
# 3. Icons présentes
# 4. Service Worker enregistré
```

---

## 🔄 Mise à Jour

```bash
# Récupérer dernières données
git pull

# Reconstruire images
docker-compose build --no-cache

# Redémarrer services
docker-compose restart
```

---

## 📚 Ressources

- **API Officielle** : https://data.assemblee-nationale.fr
- **Documentation API** : https://data.assemblee-nationale.fr/api-doc/
- **Spec PWA** : https://www.w3.org/TR/appmanifest/
- **Service Workers** : https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API

---

## 📄 Licence

MIT - Libre d'utilisation et de modification

---

## 🤝 Contribution

Les contributions sont bienvenues ! N'hésitez pas à :
1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmeCool`)
3. Commit vos changements
4. Push et créer une Pull Request

---

## 🚀 Roadmap

- [ ] Visualisation graphique des votes (D3.js)
- [ ] Export en PDF avec graphiques
- [ ] Comparaison de scrutins
- [ ] Timeline interactive
- [ ] Votes par région/circonscription
- [ ] Analytics des groupes politiques
- [ ] Intégration Wikidata
- [ ] API publique pour développeurs
- [ ] Application mobile native
- [ ] Notifications pour nouvelles lois importantes

---

## 📞 Support

**Problème ?**
1. Vérifier les [logs](#logs--monitoring)
2. Consulter la [FAQ](#dépannage)
3. Ouvrir une issue sur GitHub

**Suggestion ?**
Ouvrir une discussion ou une issue avec le label `enhancement`.

---

**Réalisé avec ❤️ par [Votre Nom]**

*Dernière mise à jour : 2024*
