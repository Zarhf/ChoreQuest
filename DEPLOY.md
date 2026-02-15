# Guide de Déploiement ChoreQuest

Ce document décrit la procédure automatisée pour publier une nouvelle version de ChoreQuest.

## 🛠️ Pré-requis
- Node.js installé.
- Être authentifié sur Firebase CLI (`npx firebase login`).
- Avoir les droits d'écriture sur le dépôt GitHub.

## 🚀 Procédure de Publication Automatisée

Pour mettre à jour la version, incrémenter le build, et déployer sur toutes les plateformes (Firebase + GitHub), utilisez la commande suivante à la racine du dossier `ChoreQuest` :

```bash
npm run release -- "Description de vos changements" "Type"
```

### Paramètres :
1. **Description** : Le message décrivant la mise à jour (ex: "fix: correction du tri des quêtes").
2. **Type** (Optionnel) : Le type de changement pour le changelog automatique. Valeurs possibles : `added`, `fixed`, `changed` (défaut), `deprecated`, `removed`, `security`, `performance`, `other`.

### Exemple :
```bash
npm run release -- "feat: ajout du système de halo rouge" "added"
```

## 🔄 Ce que fait le script automatiquement
1. **Versioning** : Incrémente le numéro de `build` (+1) dans `version.json`, `v.json` et `status.json`.
2. **Cache Busting** : Met à jour les références `?v=XXX` dans `index.html` et la constante `BUILD` dans `js/config.js`.
3. **Backend** : Déploie les fichiers sur **Firebase Hosting** et met à jour les **Cloud Functions**.
4. **Frontend** : Effectue un `git commit` et un `git push`. Cela déclenche le workflow GitHub Actions qui déploie la version finale sur **GitHub Pages**.

## 🧪 Vérification après déploiement
1. Ouvrez l'application et vérifiez le numéro de version en haut à gauche (il doit correspondre au nouveau build).
2. Testez les notifications via le bouton **"🧪 Tester l'envoi"** dans votre profil.
3. Vérifiez le journal de la guilde pour voir si l'entrée de mise à jour système est présente.

---
*Note : Si le script échoue lors du déploiement Firebase, vérifiez votre connexion internet ou vos identifiants Firebase.*
