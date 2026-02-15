# Spécifications : ChoreQuest (v2.28)

## 1. Concept
**"Level up your home, one quest at a time."**
ChoreQuest est une application web progressive (PWA) de management familial transformée en une aventure RPG médiévale. Les corvées deviennent des contrats négociés au Conseil, rapportant XP et Or pour gravir les échelons de la hiérarchie.

## 2. Architecture Technique & Infrastructure

### 2.1. Stack Technologique
*   **Frontend :** HTML5 / CSS3 (Thème Médiéval) / Vanilla JS.
*   **Backend (Firebase) :** 
    *   **Firestore :** Base de données temps réel.
    *   **Auth :** Authentification Google.
    *   **Cloud Messaging (FCM) :** Notifications Push via Service Worker.
    *   **Cloud Functions (v2) :** Logique backend (notifications, rappels planifiés).
    *   **Hosting :** Hébergement principal sur `chorequest-1c5b6.web.app`.
*   **Miroir Frontend :** Déploiement automatique sur GitHub Pages (`zarhf.github.io/ChoreQuest/`).

### 2.2. Système de Mise à jour "Nucléaire"
Pour garantir que tous les clients utilisent la dernière version du code :
1.  **Cache Killer :** Script inline dans le `<head>` comparant le build local au `version.json` distant à chaque chargement.
2.  **Force Reload :** Si un nouveau build est détecté, désinscription du Service Worker et vidage complet des caches (CacheStorage).
3.  **Kill Switch Firestore :** Écoute en temps réel de la collection `system/config`. Si `minBuild` > `localBuild`, l'application force un rechargement immédiat.

## 3. Sécurité & Gestion des Secrets

### 3.1. Protection des Clés API
Le fichier `js/config.js` contenant les clés sensibles est **exclu du dépôt Git** (via `.gitignore`).
*   **Local :** Utiliser une copie de `js/config.example.js` nommée `js/config.js`.
*   **CI/CD :** Le fichier est généré dynamiquement lors du déploiement par GitHub Actions à partir des **GitHub Secrets**.
*   **Restrictions :** Les clés API Google/Firebase sont restreintes par domaine (HTTP Referrer) pour n'autoriser que les URLs officielles du projet.

### 3.2. Liste des Secrets GitHub
Les variables suivantes doivent être configurées dans les "Actions Secrets" du dépôt pour permettre le déploiement :
*   `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, etc.
*   `VAPID_PUBLIC_KEY` : Clé publique pour les notifications Web Push.
*   `FIREBASE_SERVICE_ACCOUNT` : Clé JSON (base64) pour les scripts d'administration.

## 4. Protocole de Publication (Versioning)

Le déploiement et la gestion des versions sont désormais automatisés via un script unique.

Consultez le fichier **[DEPLOY.md](DEPLOY.md)** pour les instructions détaillées sur la publication d'une nouvelle version via la commande :
`npm run release -- "message"`

## 5. Système Social & Hiérarchie

*   **👑 Administrateurs :** Pouvoir d'édition, gestion de l'économie, exclusion de membres et annulation de l'historique.
*   **🛡️ Chevaliers :** Membres avec email, droit de vote au Conseil.
*   **📜 Écuyers :** Comptes enfants gérés par un parent (pas d'email, pas de vote).

## 6. Système de Quêtes & Économie

*   **Le Conseil :** Espace de négociation forçant le dialogue via des contre-offres avant validation d'une quête.
*   **Vol de Quête (🥷) :** Possibilité de récupérer une tâche en retard. Un timer de 15 minutes protège le voleur avant retour au pot commun.
*   **Progression :** `Gain = Base * (1 + Niveau / 100)`. Chaque niveau offre +1% de bonus permanent.
*   **Marché :** Achat de récompenses réelles (ex: Journée de congé) via la monnaie personnalisée de la guilde.

## 7. Journal & Audit
*   Historique complet de toutes les actions (validations, vols, achats).
*   Possibilité pour les admins d'annuler une action (Undo) pour restaurer les états précédents.

## 8. Roadmap & Évolutions (2026)

### ✅ Phase 1 : Fondations RPG & Moteur Temporel (Terminé)
*   **Moteur V5/V6** : Séparation startDate/dueDate et gestion des sessions de chaînes.
*   **Chasse aux Primes** : Implémentation des bonus "On Fire" (+1% or/min).
*   **Rapport de Mission** : Saisie de l'heure réelle et validation pour autrui.
*   **Administration Partagée** : Gestion des écuyers par tous les admins.
*   **Automatisation** : Script de release unique et Cache Killer nucléaire.

### Phase 2 : Immersion & "Juiciness" (En cours)
*   **Design Sonore (SFX)** : Bruitages 8-bit pour les validations (Cha-ching!), level-up et flammes.
*   **Système de Particules** : Explosion de confettis/pièces via `canvas-confetti` lors des succès.
*   **Animations UI** : Transitions fluides des modales et feedbacks haptiques visuels renforcés.
*   **Séries (Streaks)** : Bonus pour la régularité sur les tâches récurrentes.

### Phase 3 : Dynamisme & Vie
*   **Boss de Raid** : Tâches collectives avec points de vie (ex: grand ménage) et butin partagé.
*   **Réactions (Emotes)** : Possibilité de réagir aux actions du journal via des stickers/émojis.
*   **Cycle Jour/Nuit** : L'interface change de luminosité et de thème selon l'heure réelle.

### Phase 4 : Profondeur RPG
*   **Équipements & Buffs** : Objets au marché offrant des bonus passifs (ex: "Bottes de hâte" : réduit le délai des quêtes liées).
*   **Classes de Héros** : Spécialisations au niveau 10 (Guerrier : bonus XP, Voleur : bonus sur les vols, Mage : réduit les délais).

## 9. Standards UI/UX (Directives)

*   **Identité Visuelle :** Palette sombre (#1a1a2e) contrastée par des accents néons/médiévaux (#4a90e2, #f1c40f).
*   **Transitions :** Toute ouverture de modale ou changement de vue doit être animé (0.3s).
*   **Feedback :** Aucune action ne doit rester sans réponse visuelle (vibration, animation, ou son).
*   **Accessibilité :** Lisibilité prioritaire sur le décorum (contraste élevé pour les textes).
