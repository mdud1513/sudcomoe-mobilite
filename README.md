# Sud-Comoé Mobilité — Prototype

Prototype fonctionnel du parcours client/chauffeur décrit dans le Dossier
Opérationnel de Lancement et le Dossier Technique, Juridique et Opérationnel.

- `backend/` — API Fastify (Node.js), flux de course complet (demande →
  acceptation → fin de course → calcul de commission)
- `frontend/` — Application React / PWA (installable), deux parcours :
  client (réservation) et chauffeur (demandes disponibles, course en cours)

## Ce que couvre ce prototype

- Demande de course avec tarif calculé automatiquement (local 500-1000 FCFA,
  périphérique au-delà de 1000 FCFA, cf. grille tarifaire du contrat
  d'affiliation)
- Acceptation par un chauffeur affilié de la zone concernée
- Confirmation de fin de course par le client, avec choix du mode de paiement
  (Mobile Money ou espèces) avant tout règlement
- Calcul automatique de la commission (12 %) et du solde dû en espèces
  côté chauffeur
- 3 chauffeurs et véhicules de démonstration pré-chargés (Yaou, Bonoua,
  Grand-Bassam)

## Ce qu'il reste à brancher pour la production

- Authentification réelle (le prototype identifie le chauffeur par simple
  sélection dans une liste, à remplacer par un vrai login)
- Intégration Wave / Orange Money (le paiement Mobile Money est aujourd'hui
  simulé — le choix est enregistré mais aucun encaissement réel n'a lieu)
- Notifications (WhatsApp Business, Web Push) — le prototype fonctionne par
  rafraîchissement automatique (polling) toutes les 2,5 à 3 secondes
- Suivi GPS temps réel si le volume le justifie plus tard
- Base de données PostgreSQL en production (le prototype utilise un fichier
  JSON local, adapté au test mais pas à la montée en charge)

## Lancer le prototype en local

Deux terminaux séparés.

**Backend**
```bash
cd backend
npm install
npm run dev
```
Démarre sur http://localhost:8787

**Frontend**
```bash
cd frontend
npm install
npm run dev
```
Démarre sur http://localhost:5173 — ouvrez cette adresse dans le navigateur.
Testez en ouvrant deux onglets : un en mode "Client", un en mode "Chauffeur".

## Déployer (conforme à l'architecture retenue)

- **Frontend** : déployer le dossier `frontend/` sur Netlify (build command
  `npm run build`, publish directory `dist`). Une fois en HTTPS, la PWA est
  installable directement (« Ajouter à l'écran d'accueil »), sans passer par
  un store — voir section 4.2 du Dossier Opérationnel de Lancement.
- **Backend** : déployer `backend/` sur Railway ou Render. Penser à
  remplacer le stockage JSON par PostgreSQL avant la mise en production
  (le modèle de données est déjà posé dans le Dossier Technique, section 1.1).
- Une fois le backend en ligne, mettre à jour `frontend/.env.production`
  avec `VITE_API_URL=https://votre-backend.example.com`.
