# Spécifications : ChoreQuest (v2.16)

## 1. Concept
**"Level up your home, one quest at a time."**
ChoreQuest est une application web progressive (PWA) gamifiée qui transforme les corvées ménagères en une aventure RPG épique. Suivez vos tâches, gagnez de l'XP et montez en niveau en famille.

## 2. Architecture Technique

*   **Frontend :** HTML5 / CSS3 (Mobile First) / Vanilla JS.
*   **Backend :** Google Firebase (Firestore + Auth).
*   **Identité :** API **DiceBear** (Génération d'avatars SVG dynamiques via seeds).
*   **Système de Mise à jour Automatique (3 Couches) :**
    1.  **Stratégie "Network First" (Service Worker) :** Le SW est configuré pour toujours privilégier le réseau pour les fichiers critiques (`index.html`, `version.json`). Il ne sert le cache qu'en cas d'absence de connexion.
    2.  **Vérification au Démarrage (Boot Check) :** Un script ultra-léger au sommet du HTML compare le build local (`localStorage`) avec le build serveur (`version.json?t=...`). En cas de différence, il force la désinscription du SW, vide le cache et recharge la page immédiatement.
    3.  **"Kill Switch" Temps Réel (Firestore) :** L'application écoute en continu le document `system/config` sur Firebase. Dès que le `minBuild` distant est incrémenté, toutes les instances ouvertes déclenchent un rechargement forcé.

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
  "memberEmails": ["..."],
  "users": [
    { 
      "id": "u1", 
      "name": "Yohann", 
      "avatar": "https://api.dicebear.com/...", 
      "xp": 1200, 
      "level": 5, 
      "email": "...", // Null pour les Écuyers
      "managedBy": "u_admin_id" // Lien parent-enfant
    }
  ],
  "questDefinitions": [
    { 
      "id": "def_1", 
      "title": "Vaisselle", 
      "baseXp": 50, 
      "frequency": "weekly", 
      "interval": "1", 
      "days": ["1", "3", "5"], // Lundi, Mercredi, Vendredi
      "defaultAssignee": "u1", // Optionnel
      "timeSlot": { "start": "18:00", "end": "20:00" },
      "archived": false
    }
  ],
  "activeQuests": [
    { 
      "id": "inst_101", 
      "definitionId": "def_1", 
      "title": "Vaisselle", 
      "xp": 50, 
      "dueDate": "2026-02-07T04:00:00Z",
      "assignedTo": "u1", // Peut être null (Pour tous)
      "timeSlot": { "start": "18:00", "end": "20:00" }
    }
  ],
  "questLog": [
    {
      "id": "log_1",
      "type": "completion", // completion, system
      "title": "Vaisselle",
      "completedBy": "u1",
      "completedAt": "2026-02-06T19:30:00Z",
      "xpEarned": 50
    }
  ]
}
```

## 3. Fonctionnalités Implémentées

### 3.1. Gestion des Utilisateurs & Identité
*   **Authentification :** Connexion Google.
*   **Écuyers (Comptes Enfants) :** Création de héros sans email gérés par un compte parent.
*   **Rotation Rapide :** Bouton dans le header pour basculer instantanément entre les héros de la suite familiale.
*   **Personnalisation DiceBear :** Générateur d'avatar basé sur un "mot magique" (seed) avec plusieurs styles (RPG, Pixel, Mignon).

### 3.2. Système de Guilde
*   **Multi-Guilde :** Un utilisateur peut appartenir à plusieurs guildes et basculer entre elles.
*   **Recherche :** Trouver des guildes publiques ou rejoindre via un lien direct (`?join=ID`).
*   **Administration :** Modifier le nom, la visibilité et l'accès (Ouvert/Fermé).

### 3.3. Système de Quêtes RPG
*   **Affectation Flexible :** Quêtes assignées d'office ou libres (`?`).
*   **Actions Dynamiques :**
    *   **☝️ Je prends :** S'assigner une quête libre.
    *   **❌ Abandonner :** Rendre une quête dont on était responsable.
    *   **🥷 Voler :** Si une tâche est en retard, les autres membres peuvent la voler pour gagner l'XP à votre place.
*   **Rareté Visuelle :** Cartes colorées selon l'XP (Gris, Vert, Bleu, Violet, Or).
*   **Calendrier :** Section "Prochainement" avec projection intelligente des tâches récurrentes évitant les erreurs de dates passées.

### 3.4. UX & Administration
*   **Console Admin Royale :** Modale plein écran accessible uniquement au propriétaire ou à l'administrateur principal. Permet d'éditer les statistiques des joueurs (XP, Niveau, Nom) et de réparer les dates corrompues.
*   **Toasts :** Notifications en temps réel lors des actions des membres (vol, abandon, validation).
*   **Journal :** Historique complet avec fonction d'annulation.

## 4. Roadmap (Prochaines Évolutions)

### 4.1. Économie & Récompenses
*   **L'Or du Royaume :** Gagner des pièces d'or lors des validations.
*   **Boutique de la Guilde :** Acheter des récompenses personnalisables (ex: "Temps d'écran").

### 4.2. Rappels & Notifications Push
*   Notifications au début de la plage horaire d'une quête et alertes de "volabilité".
