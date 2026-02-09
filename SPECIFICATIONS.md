# Spécifications : ChoreQuest (v2.21)

## 1. Concept
**"Level up your home, one quest at a time."**
ChoreQuest est une application web progressive (PWA) de management familial transformée en une aventure RPG médiévale. Les corvées deviennent des contrats négociés au Conseil, rapportant XP et Or pour gravir les échelons de la hiérarchie.

## 2. Architecture Technique

*   **Frontend :** HTML5 / CSS3 (Thème Médiéval) / Vanilla JS.
*   **Backend :** Google Firebase (Firestore + Auth).
*   **Système de Mise à jour "Nucléaire" :**
    1.  **Cache Killer :** Script inline prioritaire dans le `<head>` comparant le build local au `version.json` distant à chaque chargement.
    2.  **Force Reload :** Désinscription automatique du Service Worker et vidage des caches navigateurs en cas de montée de version.
    3.  **Kill Switch Firestore :** Écoute en temps réel de `system/config` pour forcer le rafraîchissement global de toutes les instances actives.

## 3. Système Social & Hiérarchie

### 3.1. Rôles et Dashboard
*   **Le Dashboard des Membres :** Un centre de commandement dans les réglages affichant l'avatar, le rôle, le niveau et l'or de chaque membre.
*   **👑 Administrateurs :** Le propriétaire de la guilde (et `yohann.gras@gmail.com`) dispose des pleins pouvoirs : édition des quêtes, gestion de l'économie, et exclusion de membres.
*   **🛡️ Chevaliers :** Membres standards avec un compte email lié. Ils votent au Conseil.
*   **📜 Écuyers :** Comptes gérés (enfants) sans email. Ils ne votent pas et ne peuvent pas s'auto-incarner sans le compte parent.

### 3.2. Le Conseil (Négociation de Quêtes)
Toute nouvelle quête ou mission royale passe par **Le Conseil** sous forme de Parchemin avant d'apparaître sur le tableau.
*   **Vote à la Majorité :** Pour les quêtes "Pour tous", l'approbation de la majorité absolue des membres humains est requise. Les écuyers sont exclus du calcul de la majorité.
*   **Double Signature :** Pour les quêtes assignées, l'accord conjoint du **Créateur** et de l'**Assigné** est obligatoire.
*   **Négociation :** Pas de bouton "Rejeter". Le Conseil force le dialogue via des **Contre-offres** permettant de modifier titre, récompenses, assigné ou de justifier les changements par un message.
*   **Traçabilité :** Historique des révisions (Rév. 1, 2...) affiché sur le parchemin.

## 4. Économie & Progression

### 4.1. Fortune du Royaume
*   **Monnaie Custom :** Chaque guilde définit le nom et le symbole de sa monnaie (ex: Écus 🪙, Cookies 🍪).
*   **Boutique de la Guilde :** Les membres achètent des récompenses définies par l'admin.
*   **Missions Royales :** Quêtes spéciales créées par les membres contre de l'or (gratuit pour les admins). Remboursement automatique si supprimées.

### 4.2. Formule de Récompense
Le mérite est récompensé par un bonus de niveau :
`Gain Réel = Gain de Base * (1 + Niveau / 100)`
(Chaque niveau apporte +1% de bonus permanent sur l'XP et l'Or).

## 5. Système de Quêtes RPG

*   **Affectation & Vol (🥷) :**
    *   **☝️ Je prends :** S'assigner une quête libre.
    *   **🥷 Voler :** Si une tâche est en retard, un membre peut la voler. Il dispose alors de **15 minutes** pour la valider, faute de quoi elle retourne au pot commun.
*   **Rareté Visuelle :** Common, Uncommon, Rare, Epic, Legendary (Missions Royales).
*   **Gestion du Temps :**
    *   Héritage des créneaux horaires (Start/End).
    *   Masquage des tâches futures.
    *   Projection virtuelle des tâches récurrentes dans la section "Prochainement".

## 6. Journal & Audit
*   **Journal du Royaume :** Historique complet des validations, achats, vols et décisions du Conseil.
*   **Annulation Royale :** Les admins peuvent annuler n'importe quel log pour retirer l'XP/Or et remettre la quête en jeu en cas d'erreur.