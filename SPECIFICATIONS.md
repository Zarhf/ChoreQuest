# Spécifications : ChoreQuest

## 1. Concept
**"Level up your home, one quest at a time."**
ChoreQuest est une application web progressive (PWA) gamifiée qui transforme les corvées ménagères en une aventure RPG épique. Suivez vos tâches, gagnez de l'XP et montez en niveau en famille tout en gardant vos données privées et synchronisées via votre propre Google Drive.

## 2. Fonctionnalités Implémentées

### 2.1. Gestion des Tâches (Le "Tableau des Quêtes")
*   **Création :** Formulaire pour ajouter des quêtes avec titre et difficulté.
*   **Difficultés :** 
    *   Petite Tâche (10 XP)
    *   Quête Moyenne (50 XP)
    *   Défi Épique (150 XP)
*   **Validation :** Bouton "Valider" qui supprime la quête et octroie l'XP instantanément.

### 2.2. Gamification (RPG)
*   **Profils :** Création d'un héros avec nom et choix d'avatar (🛡️, 🔮, 🌿, ⚡, 🐱).
*   **Progression :** 
    *   Barre d'XP visuelle en temps réel.
    *   Système de niveaux (Niveau supérieur tous les `Niveau * 100` XP).
    *   Alertes visuelles lors du passage de niveau.

### 2.3. Infrastructure & Technique
*   **Architecture :** PWA (Progressive Web App) fonctionnant en mode déconnecté.
*   **Stockage :** Serverless, utilise l'API Google Drive v3 de l'utilisateur (`chorequest_db.json`).
*   **Déploiement :** GitHub Pages avec intégration continue via GitHub Actions.
*   **Mode Dev :** Interface de debug masquée (accessible via un triple-clic sur le titre).

## 3. Architecture Technique détaillée

*   **Frontend :** HTML5 / CSS3 (Thème Dark RPG) / Vanilla JS.
*   **Auth :** Google Identity Services (GSI) avec OAuth 2.0.
*   **Base de Données :** Fichier JSON unique sur le Drive de l'utilisateur.

### Modèle de Données (JSON)
```json
{
  "meta": {
    "version": 2,
    "created_at": "2026-02-07T..."
  },
  "users": [
    { "id": "u123", "name": "Yohann", "xp": 45, "level": 2, "avatar": "🛡️" }
  ],
  "tasks": [
    { "id": 123456, "title": "Nettoyer le four", "xp": 150 }
  ]
}
```

## 4. Roadmap (Prochaines Étapes)

### 4.1. Collaboration (Le "Groupe")
*   Partager le fichier de quêtes avec d'autres comptes Google.
*   Gestion des droits d'écriture pour les membres du foyer.

### 4.2. Automatisation (Répétition)
*   Tâches récurrentes (quotidiennes, hebdomadaires).
*   Réapparition automatique des quêtes validées après un certain délai.

### 4.3. Boutique & Récompenses
*   Définir des récompenses réelles (ex: "Choix du film", "Grâce matinée").
*   Acheter ces récompenses avec les points accumulés.

## 5. Design & UX
*   **Thème :** Interface sombre, accents bleus électriques et rouges épiques.
*   **Mobile :** Optimisé pour une utilisation à une main sur smartphone.