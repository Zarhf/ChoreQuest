# Spécifications : ChoreQuest (v2.15)

## 1. Concept
**"Level up your home, one quest at a time."**
ChoreQuest est une application web progressive (PWA) gamifiée qui transforme les corvées ménagères en une aventure RPG épique. Suivez vos tâches, gagnez de l'XP et montez en niveau en famille.

## 2. Architecture Technique

*   **Frontend :** HTML5 / CSS3 (Mobile First) / Vanilla JS.
*   **Backend :** Google Firebase (Firestore + Auth).
*   **Identité :** API **DiceBear** (Génération d'avatars SVG dynamiques via seeds).
*   **Versioning & Sync :** 
    *   **Kill Switch :** Les clients écoutent un document Firestore `system/config` pour déclencher une mise à jour forcée.
    *   **Version Manager :** Vérification périodique (5 min) et vuidage automatique des caches (Service Worker + Caches API) en cas de nouveau build détecté.
    *   **Emergency Console :** Page `admin.html` permettant de forcer manuellement une version globale.

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
*   **Affectation Flexible :**
    *   Quêtes assignées d'office à un membre.
    *   Quêtes "Pour tous" marquées d'un `?`.
*   **Actions Dynamiques :**
    *   **☝️ Je prends :** S'assigner une quête libre (pour l'occurrence actuelle).
    *   **❌ Abandonner :** Rendre une quête dont on était responsable.
    *   **🥷 Voler :** Si une tâche est en retard (heure de fin dépassée), les autres membres peuvent la voler.
*   **Rareté Visuelle :** Cartes colorées selon l'XP (Gris, Vert, Bleu, Violet, Or).
*   **Calendrier :** Section "Prochainement" groupée par jour avec projection intelligente des tâches récurrentes.

### 3.4. UX & Robustesse
*   **Confirmation :** Modale de confirmation légère pour toute action critique.
*   **Toasts :** Notifications en temps réel lors des exploits des autres membres.
*   **Annulation :** Le journal permet d'annuler une validation (restitution de la tâche et retrait de l'XP).
*   **Fluidité :** Rendu "Lazy" sans écran blanc lors des mises à jour Firestore.

## 4. Roadmap (Prochaines Évolutions)

### 4.1. Économie & Récompenses
*   **L'Or du Royaume :** En plus de l'XP, gagner des pièces d'or lors des validations.
*   **Boutique de la Guilde :** Les parents (Rois) créent des récompenses (ex: "30 min de console", "Dessert au choix") achetables avec l'or.

### 4.2. Rappels & Notifications Push
*   **Signal de Départ :** Notification sur le téléphone au début de la plage horaire d'une quête.
*   **Alerte de Vol :** Prévenir le responsable quand sa quête devient "Volable" par les autres.

### 4.3. Succès & Badges
*   **Hauts Faits :** Gagner des badges spéciaux (ex: "Nettoyeur de l'Ombre" pour 10 vols réussis).