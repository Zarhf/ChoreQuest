const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const PROJECT_DIR = path.resolve(__dirname, '..');
const FILES = {
    version: path.join(PROJECT_DIR, 'version.json'),
    v: path.join(PROJECT_DIR, 'v.json'),
    status: path.join(PROJECT_DIR, 'status.json'),
    html: path.join(PROJECT_DIR, 'index.html'),
    config: path.join(PROJECT_DIR, 'js/config.js')
};

// Récupérer le message de commit depuis les arguments
const commitMessage = process.argv[2] || 'chore: maintenance update';
const changelogType = process.argv[3] || 'changed'; // added, fixed, changed

console.log("🛡️  Début de la procédure de déploiement ChoreQuest...");

try {
    // 1. Lecture et Incrémentation du Build
    const versionData = JSON.parse(fs.readFileSync(FILES.version, 'utf8'));
    const oldBuild = versionData.build;
    const newBuild = oldBuild + 1;
    versionData.build = newBuild;
    
    console.log(`📈 Passage du Build ${oldBuild} -> ${newBuild}`);

    // 2. Mise à jour des fichiers JSON
    const jsonFiles = [FILES.version, FILES.v, FILES.status];
    jsonFiles.forEach(file => {
        if (fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(versionData, null, 2));
            console.log(`   ✅ Mis à jour : ${path.basename(file)}`);
        }
    });

    // 3. Mise à jour de index.html (Cache Busting)
    let htmlContent = fs.readFileSync(FILES.html, 'utf8');
    // Regex pour remplacer ?v=XXX ou build XXX dans les commentaires
    htmlContent = htmlContent.replace(/(\?v=)\d+/g, `$1${newBuild}`);
    htmlContent = htmlContent.replace(/(Build\s)\d+/g, `$1${newBuild}`);
    fs.writeFileSync(FILES.html, htmlContent);
    console.log(`   ✅ Mis à jour : index.html`);

    // 4. Mise à jour de js/config.js (Local)
    if (fs.existsSync(FILES.config)) {
        let configContent = fs.readFileSync(FILES.config, 'utf8');
        configContent = configContent.replace(/(BUILD:\s*)\d+/g, `$1${newBuild}`);
        fs.writeFileSync(FILES.config, configContent);
        console.log(`   ✅ Mis à jour : js/config.js`);
    }

    // 5. Déploiement Firebase (Backend)
    console.log("
🔥 Déploiement sur Firebase Hosting & Functions...");
    try {
        execSync('npx firebase-tools deploy --project chorequest-1c5b6', { stdio: 'inherit', cwd: PROJECT_DIR });
    } catch (e) {
        console.error("❌ Erreur lors du déploiement Firebase. Arrêt.");
        process.exit(1);
    }

    // 6. Git Commit & Push (Frontend + Déclencheur GH Pages)
    console.log("
📦 Envoi vers GitHub...");
    execSync('git add .', { cwd: PROJECT_DIR });
    
    const gitMsg = `${commitMessage} (build ${newBuild})`;
    // Utilisation de guillemets pour Windows
    execSync(`git commit -m "${gitMsg}" -m "Changelog: ${changelogType}"`, { cwd: PROJECT_DIR });
    
    execSync('git push origin main', { stdio: 'inherit', cwd: PROJECT_DIR });

    console.log("
✨ SUCCÈS ! Déploiement terminé.");
    console.log(`   👉 Version : v${versionData.version} (Build ${newBuild})`);
    console.log(`   👉 Frontend en cours de build sur GitHub...`);

} catch (error) {
    console.error("
❌ Une erreur fatale est survenue :", error);
    process.exit(1);
}
