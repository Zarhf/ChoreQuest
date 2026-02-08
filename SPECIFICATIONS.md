# Spécifications : ChoreQuest

## 1. Concept
**"Level up your home, one quest at a time."**
ChoreQuest est une application web progressive (PWA) gamifiée qui transforme les corvées ménagères en une aventure RPG épique. Suivez vos tâches, gagnez de l'XP et montez en niveau en famille.

## 2. Architecture Technique (Mise à jour v2.0)

*   **Frontend :** HTML5 / CSS3 (Mobile First) / Vanilla JS.
*   **Backend :** Google Firebase (Firestore + Auth).
    *   *Abandon de l'architecture "Serverless Drive" (v1) pour cause de limitations de partage.*
*   **Hébergement :** GitHub Pages.
*   **Mise à jour :** Système de "Version Manager" avec auto-nettoyage du cache SW.

### Modèle de Données (Firestore)
Collection `guilds` -> Document `{guildId}` :
```json
{
  "meta": {
    "version": 3,
    "guildName": "Maison Gras",
    "owner": "email@gmail.com",
    "isPublic": true,
    "isOpen": true
  },
  "memberEmails": ["email1@gmail.com", "email2@gmail.com"],
  "users": [
    { "id": "u1", "name": "Yohann", "avatar": "🛡️", "xp": 1200, "level": 5, "email": "..." }
  ],
  "questDefinitions": [
    { "id": "def_1", "title": "Vaisselle", "baseXp": 50, "recurrence": { "type": "daily", "days": [1,3,5] } }
  ],
  "activeQuests": [
    { 
      "id": "inst_101", 
      "definitionId": "def_1", 
      "title": "Vaisselle", 
      "xp": 50, 
      "dueDate": "2026-02-07T20:00:00Z",
      "status": "todo",
      "timeSlot": { "start": "18:00", "end": "20:00" } // Optionnel
    }
  ],
  "questLog": [
    {
      "id": "log_1",
      "type": "completion", // completion, join, leave, create_task
      "title": "Vaisselle",
      "user": "u1",
      "date": "2026-02-06T19:30:00Z",
      "xp": 50
    }
  ]
}
```

## 3. Fonctionnalités Implémentées (v2.3)
*   **Multi-Guilde :** Création, Recherche, Adhésion (via ID ou Recherche Publique).
*   **Gestion Membres :** Liste des membres, Niveaux.
*   **Système de Quêtes :** Création simple, Validation, Historique.
*   **Temps Réel :** Synchronisation instantanée via Firestore.

## 4. Roadmap (Prochaines Évolutions)

### 4.1. Journal & Notifications (UX)
*   **Traçabilité complète :** Enregistrer les Entrées/Sorties de membres et les Créations de tâches dans le journal.
*   **Annulation (Rollback) :** Possibilité d'annuler une action du journal (ex: "J'ai validé par erreur"), ce qui restaure la tâche et retire l'XP.
*   **Toaster Temps Réel :** Notification visuelle ("Toast") pour tous les connectés lors d'un événement (validation, arrivée...).

### 4.2. Gestion Avancée des Quêtes
*   **Affichage Amélioré :**
    *   Indicateur visuel de récurrence (ex: "Tous les Lun, Mar").
    *   Section "À venir" pour les tâches futures (J+1 et plus).
    *   Code couleur dynamique (Gris -> Or) selon le montant d'XP (relatif au max de la guilde).
*   **Création Flexible :**
    *   Champ XP libre (input number) au lieu d'une liste fixe.
    *   Plage horaire facultative (ex: "Entre 18h et 20h").
*   **Récurrence Complexe :**
    *   Moteur type Google Agenda : "Tous les X jours/semaines", choix des jours de la semaine.

### 4.3. Comptes Écuyers (Enfants)
*   Création de profils sans email gérés par les parents.
*   Basculer d'un profil à l'autre sans déconnexion ("Incarner").
