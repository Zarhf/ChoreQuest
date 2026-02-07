# Spécifications : ChoreQuest

## 1. Concept
**"Level up your home, one quest at a time."**
ChoreQuest est une application web progressive (PWA) gamifiée qui transforme les corvées ménagères en une aventure RPG épique. Suivez vos tâches, gagnez de l'XP et montez en niveau en famille tout en gardant vos données privées et synchronisées via Google Drive.

## 2. Fonctionnalités Implémentées (v1.4)
*Voir versions précédentes pour détails.*

## 3. Roadmap Priorisée (Technique)

### 3.1. Refonte du Modèle de Données (CORE - En cours)
Objectif : Séparer la définition des quêtes de leur exécution pour permettre l'historique et les statistiques.

**Nouveau Modèle JSON :**
```json
{
  "meta": { "version": 3 },
  "users": [ ... ],
  
  // Le catalogue des quêtes possibles (Modèles)
  "questDefinitions": [
    { 
      "id": "def_1", 
      "title": "Vaisselle", 
      "baseXp": 50, 
      "frequency": "daily", 
      "defaultAssignee": null 
    }
  ],

  // Les quêtes actives (Instances à faire)
  "activeQuests": [
    { 
      "id": "inst_101", 
      "definitionId": "def_1", 
      "title": "Vaisselle", // Copie pour perf
      "xp": 50, 
      "dueDate": "2026-02-07T20:00:00Z",
      "assignedTo": "u1",
      "status": "todo" // todo, done
    }
  ],

  // L'historique (Archives)
  "questLog": [
    {
      "id": "log_1",
      "definitionId": "def_1",
      "completedBy": "u1",
      "completedAt": "2026-02-06T19:30:00Z",
      "xpEarned": 50
    }
  ]
}
```

### 3.2. Gestion des Rôles & Comptes "Écuyers"
*   Distinction Identité Google vs Profil Héros.
*   Un compte Google peut gérer plusieurs Héros (Parents + Enfants).

### 3.3. Système Économique
*   Introduction de l'Or (Gold) en plus de l'XP.
*   Portefeuille par utilisateur.

### 3.4. Mécaniques de Gameplay
*   Vol de quête, Négociation, Quêtes Royales.

### 3.5. Multi-Guildes
*   Support de plusieurs fichiers DB.

## 4. Architecture Technique
*   **Frontend :** HTML5 / CSS3 / Vanilla JS.
*   **Données :** JSON sur Google Drive.
*   **Sécurité :** OAuth 2.0.