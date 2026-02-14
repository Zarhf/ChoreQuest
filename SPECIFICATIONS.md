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

Chaque mise à jour doit suivre rigoureusement ces étapes pour être prise en compte par tous les clients :

### 4.1. Préparation (Locale)
1.  Incrémenter le numéro de `build` dans `version.json`, `v.json` et `status.json`.
2.  Mettre à jour les références de version dans `index.html` (ex: `styles.css?v=156`).
3.  Mettre à jour le build dans `js/config.js` (local).

### 4.2. Déploiement du Frontend (Automatique)
*   Un `git push` sur la branche `main` déclenche le workflow GitHub Actions.
*   Le script génère le `config.js` sécurisé et déploie sur GitHub Pages.

### 4.3. Déploiement du Backend (Manuel/CLI)
*   Exécuter `npx firebase deploy` depuis le dossier `ChoreQuest` pour mettre à jour les Cloud Functions et le Firebase Hosting.
*   **Test de fiabilité :** Utiliser le bouton **"🧪 Tester l'envoi"** dans le profil utilisateur pour valider la chaîne de notification de bout en bout.

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

### Phase 1 : Immersion & "Juiciness" (En cours)
*   **Design Sonore (SFX) :** Bruitages 8-bit pour les validations, level-up et vols.
*   **Système de Particules :** Explosion de confettis/pièces via `canvas-confetti`.
*   **Polices Immersives :** Intégration de Google Fonts (Cinzel, MedievalSharp).
*   **Animations UI :** Transitions fluides des modales et feedbacks haptiques visuels.

### Phase 2 : Dynamisme & Vie
*   **Boss de Raid :** Tâches collectives avec points de vie (ex: grand ménage).
*   **Réactions (Emotes) :** Possibilité de réagir aux actions du journal via des stickers.
*   **Cycle Jour/Nuit :** L'interface change de luminosité selon l'heure réelle.

### Phase 3 : Profondeur RPG
*   **Équipements & Buffs :** Objets au marché offrant des bonus (ex: +5% d'or).
*   **Classes de Héros :** Spécialisations au niveau 5 (Guerrier, Mage, Voleur).
*   **Séries (Streaks) :** Bonus pour la régularité quotidienne.

## 9. Standards UI/UX (Directives)

*   **Identité Visuelle :** Palette sombre (#1a1a2e) contrastée par des accents néons/médiévaux (#4a90e2, #f1c40f).
*   **Transitions :** Toute ouverture de modale ou changement de vue doit être animé (0.3s).
*   **Feedback :** Aucune action ne doit rester sans réponse visuelle (vibration, animation, ou son).
*   **Accessibilité :** Lisibilité prioritaire sur le décorum (contraste élevé pour les textes).
