const app = {
    dbFileId: null,
    data: null,
    currentUser: null,
    clickCount: 0,
    currentView: 'board', // board, history

    async init() {
        this.showLoading(true);
        try {
            // Check if we have a stored guild preference
            const preferredGuildId = localStorage.getItem('currentGuildId');
            
            if (preferredGuildId) {
                try {
                    this.data = await DriveAPI.readFile(preferredGuildId);
                    this.dbFileId = preferredGuildId;
                } catch (e) {
                    console.warn("Preferred guild not found, fallback to discovery");
                    this.dbFileId = null;
                }
            }

            if (!this.dbFileId) {
                // Discovery mode
                const guilds = await DriveAPI.listAvailableGuilds();
                if (guilds.length > 0) {
                    // Pick the first one
                    this.dbFileId = guilds[0].id;
                    this.data = await DriveAPI.readFile(this.dbFileId);
                } else {
                    // STOP! Don't create silently. Ask user.
                    // But for first launch, we might want to create.
                    // Let's check if we really found nothing or if it was an error.
                    this.data = this.getInitialData();
                    this.dbFileId = await DriveAPI.createDBFile(this.data);
                    console.log("Nouvelle guilde créée par défaut.");
                }
            }
            
            // Save current choice
            if(this.dbFileId) localStorage.setItem('currentGuildId', this.dbFileId);

            await this.checkAndMigrateData(); 

            if (this.data.users.length === 0) {
                this.showModal('onboarding-modal');
            } else {
                // IMPORTANT: Reset current user if not found in this guild
                const lastUserId = localStorage.getItem('lastUserId');
                this.currentUser = this.data.users.find(u => u.id === lastUserId);
                
                // If user not found in this DB (switching guilds), pick the first one or ask to join
                if (!this.currentUser && this.data.users.length > 0) {
                     // For now, auto-pick first user to avoid being blocked
                     this.currentUser = this.data.users[0];
                }
                
                this.syncSettingsUI();
                this.render();
            }
        } catch (err) {
            console.error("Initialization failed:", err);
            // Show error UI instead of silent fail
            document.getElementById('loading').innerHTML = `
                <p>Erreur de connexion à la Guilde.</p>
                <button class="action-btn" onclick="window.location.reload()">Réessayer</button>
                <button class="action-btn secondary-btn" onclick="app.openGuildSwitcher()">Changer de Guilde</button>
            `;
            return; // Stop here
        } finally {
            if(this.data) this.showLoading(false);
        }
    },

    getInitialData() {
        return {
            meta: { 
                version: 3, 
                created_at: new Date().toISOString(),
                guildName: "Nouvelle Guilde" // Default Name
            },
            users: [],
            questDefinitions: [], 
            activeQuests: [],     
            questLog: []          
        };
    },

    // --- Guild Management ---
    renameGuild() {
        const newName = prompt("Nouveau nom pour cette Guilde :", this.data.meta.guildName || "Ma Guilde");
        if (newName && newName.trim() !== "") {
            this.data.meta.guildName = newName.trim();
            this.saveAndRender();
            this.syncSettingsUI();
        }
    },

    async openGuildSwitcher() {
        this.showLoading(true);
        const guilds = await DriveAPI.listAvailableGuilds();
        this.showLoading(false);

        const listHtml = guilds.map(g => {
            const isCurrent = g.id === this.dbFileId;
            return `
            <div style="background:${isCurrent ? '#4a90e2' : '#0f3460'}; padding:10px; margin-bottom:5px; border-radius:5px; cursor:pointer; border:1px solid #aaa;" onclick="app.switchGuild('${g.id}')">
                <strong>${g.name}</strong><br>
                <small>Propriétaire : ${g.owner} ${isCurrent ? '(Actuelle)' : ''}</small>
            </div>`;
        }).join('');

        document.getElementById('guild-list-container').innerHTML = listHtml;
        this.showModal('guild-modal');
    },

    switchGuild(fileId) {
        if (fileId === this.dbFileId) return this.hideModals();
        
        localStorage.setItem('currentGuildId', fileId);
        localStorage.removeItem('lastUserId'); 
        window.location.reload();
    },

    async searchGuildOnDrive() {
        try {
            const fileId = await DriveAPI.showPicker();
            if (fileId) {
                this.switchGuild(fileId);
            }
        } catch (err) {
            console.error("Picker failed:", err);
            alert("Impossible d'ouvrir l'explorateur Google Drive.");
        }
    },

    // --- Migration System ---
    async checkAndMigrateData() {
        // Migration V2 (Simple Tasks) -> V3 (Definitions/Active/Log)
        if (!this.data.meta.version || this.data.meta.version < 3) {
            console.log("Migrating to V3...");
            
            // Init new structures if missing
            if (!this.data.questDefinitions) this.data.questDefinitions = [];
            if (!this.data.activeQuests) this.data.activeQuests = [];
            if (!this.data.questLog) this.data.questLog = [];

            // Convert old tasks
            if (this.data.tasks && this.data.tasks.length > 0) {
                this.data.tasks.forEach(oldTask => {
                    // Create Definition
                    const defId = 'def_' + oldTask.id;
                    const definition = {
                        id: defId,
                        title: oldTask.title,
                        baseXp: parseInt(oldTask.xp),
                        frequency: oldTask.frequency || 'none'
                    };
                    this.data.questDefinitions.push(definition);

                    // Create Active Instance
                    this.data.activeQuests.push({
                        id: 'inst_' + Date.now() + Math.random().toString(36).substr(2, 5),
                        definitionId: defId,
                        title: oldTask.title,
                        xp: parseInt(oldTask.xp),
                        dueDate: oldTask.nextDueDate || new Date().toISOString(),
                        status: 'todo'
                    });
                });
                delete this.data.tasks; // Cleanup
            }

            this.data.meta.version = 3;
            await this.saveAndRender();
            alert("Mise à jour des données effectuée (v3) !");
        }
    },

    // --- Gestion Utilisateurs ---
    finishOnboarding() {
        const name = document.getElementById('new-user-name').value;
        const avatar = document.getElementById('new-user-avatar').value;
        if (!name) return alert("Votre héros doit avoir un nom !");
        this.addUser(name, avatar);
        this.hideModals();
    },

    addUser(name, avatar) {
        const newUser = { id: 'u' + Date.now(), name, avatar, xp: 0, level: 1 };
        this.data.users.push(newUser);
        this.currentUser = newUser;
        localStorage.setItem('lastUserId', newUser.id);
        this.syncSettingsUI();
        this.saveAndRender();
    },

    syncSettingsUI() {
        if (!this.currentUser) return;
        const elName = document.getElementById('edit-user-name');
        const elAvatar = document.getElementById('edit-user-avatar');
        const elGuild = document.getElementById('current-guild-name');

        if (elName) elName.value = this.currentUser.name;
        if (elAvatar) elAvatar.value = this.currentUser.avatar;
        if (elGuild) elGuild.innerText = (this.data.meta && this.data.meta.guildName) ? this.data.meta.guildName : "Ma Guilde";
    },

    updateCurrentUserInfo() {
        if (!this.currentUser) return;
        this.currentUser.name = document.getElementById('edit-user-name').value;
        this.currentUser.avatar = document.getElementById('edit-user-avatar').value;
        this.saveAndRender();
    },

    switchUser(userId) {
        const user = this.data.users.find(u => u.id === userId);
        if (user) {
            this.currentUser = user;
            localStorage.setItem('lastUserId', user.id);
            this.syncSettingsUI();
            this.render();
            this.hideModals();
        }
    },

    deleteUser(userId) {
        if (!confirm("Supprimer ce héros ?")) return;
        this.data.users = this.data.users.filter(u => u.id !== userId);
        if (this.currentUser.id === userId) this.currentUser = this.data.users[0] || null;
        if (!this.currentUser) {
            this.showModal('onboarding-modal');
        } else {
            localStorage.setItem('lastUserId', this.currentUser.id);
            this.syncSettingsUI();
        }
        this.saveAndRender();
        this.renderDevMode();
    },

    // --- Game Logic (V3) ---
    async completeTask(instanceId) {
        const index = this.data.activeQuests.findIndex(q => q.id === instanceId);
        if (index === -1) return;

        const quest = this.data.activeQuests[index];
        const def = this.data.questDefinitions.find(d => d.id === quest.definitionId);
        
        // 1. Give Rewards
        this.currentUser.xp += parseInt(quest.xp);
        
        // Level Up
        const xpNeeded = this.currentUser.level * 100;
        if (this.currentUser.xp >= xpNeeded) {
            this.currentUser.level++;
            this.currentUser.xp -= xpNeeded;
            alert(`🎊 NIVEAU SUPÉRIEUR ! ${this.currentUser.name} passe niveau ${this.currentUser.level} !`);
        }

        // 2. Add to History (Log)
        this.data.questLog.unshift({
            id: 'log_' + Date.now(),
            definitionId: quest.definitionId,
            title: quest.title,
            completedBy: this.currentUser.id,
            completedAt: new Date().toISOString(),
            xpEarned: quest.xp
        });

        // Limit log size (keep last 50)
        if (this.data.questLog.length > 50) this.data.questLog.pop();

        // 3. Handle Recurrence
        if (def && def.frequency && def.frequency !== 'none') {
            const now = new Date();
            let nextDate = new Date();
            switch(def.frequency) {
                case 'daily': nextDate.setDate(now.getDate() + 1); break;
                case 'weekly': nextDate.setDate(now.getDate() + 7); break;
                case 'monthly': nextDate.setMonth(now.getMonth() + 1); break;
            }
            nextDate.setHours(4, 0, 0, 0); // Reset to 4 AM
            
            // Update the instance for next time
            quest.dueDate = nextDate.toISOString();
            console.log("Next due date:", quest.dueDate);
        } else {
            // Remove one-off quest
            this.data.activeQuests.splice(index, 1);
        }

        await this.saveAndRender();
    },

    addQuest() {
        const title = document.getElementById('quest-title').value;
        const xp = document.getElementById('quest-difficulty').value;
        const freq = document.getElementById('quest-frequency').value;

        if (!title) return alert("Titre manquant !");

        // 1. Create Definition
        const defId = 'def_' + Date.now();
        const newDef = {
            id: defId,
            title: title,
            baseXp: parseInt(xp),
            frequency: freq
        };
        this.data.questDefinitions.push(newDef);

        // 2. Create Active Instance
        this.data.activeQuests.push({
            id: 'inst_' + Date.now(),
            definitionId: defId,
            title: title,
            xp: parseInt(xp),
            dueDate: new Date().toISOString(),
            status: 'todo'
        });

        this.saveAndRender();
        this.hideModals();
        document.getElementById('quest-title').value = '';
        document.getElementById('quest-frequency').value = 'none';
    },

    // --- UI Navigation ---
    setView(viewName) {
        this.currentView = viewName;
        
        // Update Tabs UI
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${viewName}`).classList.add('active');

        this.render();
    },

    // --- UI Rendering ---
    render() {
        if (!this.currentUser) return;
        document.getElementById('content').classList.remove('hidden');
        document.getElementById('welcome-screen').classList.add('hidden');
        
        // Render Profile
        document.getElementById('user-name').innerText = this.currentUser.name;
        document.getElementById('user-avatar').innerText = this.currentUser.avatar;
        document.getElementById('user-level').innerText = this.currentUser.level;
        document.getElementById('user-xp').innerText = this.currentUser.xp;
        const xpNeeded = this.currentUser.level * 100;
        document.getElementById('next-level-xp').innerText = xpNeeded;
        document.getElementById('xp-progress').style.width = `${(this.currentUser.xp / xpNeeded) * 100}%`;

        // Render Main Content based on View
        const board = document.getElementById('quest-board');
        const history = document.getElementById('history-board');

        if (this.currentView === 'board') {
            board.classList.remove('hidden');
            if(history) history.classList.add('hidden');
            this.renderBoard();
        } else {
            board.classList.add('hidden');
            if(history) history.classList.remove('hidden');
            this.renderHistory();
        }
    },

    renderBoard() {
        const now = new Date().toISOString();
        const visibleTasks = this.data.activeQuests.filter(t => !t.dueDate || t.dueDate <= now);
        const list = document.getElementById('task-list');
        
        list.innerHTML = visibleTasks.length === 0 ? 
            '<p style="text-align:center; opacity:0.5;">Tout est calme... trop calme.</p>' : 
            visibleTasks.map(t => {
                const def = this.data.questDefinitions.find(d => d.id === t.definitionId);
                const isRecurring = def && def.frequency && def.frequency !== 'none';
                return `
                <div class="quest-card">
                    <div class="quest-info">
                        <h4>${isRecurring ? '🔄 ' : ''}${t.title}</h4>
                        <span>💰 ${t.xp} XP</span>
                    </div>
                    <button class="complete-btn" onclick="app.completeTask('${t.id}')">Valider</button>
                </div>
            `}).join('');
    },

    renderHistory() {
        const container = document.getElementById('history-list');
        if (!container) return;

        container.innerHTML = this.data.questLog.length === 0 ?
            '<p style="text-align:center; opacity:0.5;">Le journal est vide.</p>' :
            this.data.questLog.map(log => {
                const user = this.data.users.find(u => u.id === log.completedBy);
                const userName = user ? user.name : 'Inconnu';
                const date = new Date(log.completedAt).toLocaleDateString() + ' ' + new Date(log.completedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                return `
                <div class="history-item">
                    <div style="font-weight:bold;">${log.title}</div>
                    <div style="font-size:0.8rem; color:#aaa;">
                        Par ${userName} • ${date} • <span style="color:#4a90e2">+${log.xpEarned} XP</span>
                    </div>
                </div>
            `}).join('');
    },

    // --- Helpers ---
    async checkForUpdates() {
        if ('serviceWorker' in navigator) {
            const r = await navigator.serviceWorker.getRegistration();
            if (r) { await r.update(); location.reload(); }
        }
    },

    async inviteMember() {
        const email = document.getElementById('invite-email').value;
        if (!email || !email.includes('@')) return alert("Veuillez saisir un email valide.");

        this.showLoading(true);
        try {
            await DriveAPI.shareFile(this.dbFileId, email);
            alert(`Succès ! Le fichier a été partagé avec ${email}.`);
            document.getElementById('invite-email').value = '';
        } catch (err) {
            alert("Erreur lors du partage.");
        } finally {
            this.showLoading(false);
        }
    },

    async saveAndRender() {
        this.render();
        if (this.dbFileId) {
            try {
                await DriveAPI.updateFile(this.dbFileId, this.data);
            } catch (err) {
                console.error("Save failed:", err);
            }
        }
    },

    forceAppReset() {
        if (!confirm("Attention : Cela va redémarrer l'application et forcer le téléchargement de la dernière version. Continuer ?")) return;
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) { registration.unregister(); }
            });
        }
        caches.keys().then(names => {
            for (let name of names) caches.delete(name);
        });
        
        // Petite pause pour laisser le temps au nettoyage
        setTimeout(() => {
            alert('Application nettoyée. Redémarrage...');
            window.location.reload();
        }, 500);
    },

    renderDevMode() {
        if (!this.data) return;

        // Render Users Admin
        const userHTML = this.data.users.map(u => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#0f3460; padding:5px; margin-bottom:5px; border-radius:4px;">
                <span>${u.avatar} <b>${u.name}</b> (Lvl ${u.level})</span>
                <div>
                    <button onclick="app.switchUser('${u.id}')" style="background:#27ae60; color:white; border:none; padding:2px 5px; cursor:pointer">Incarner</button>
                    <button onclick="app.deleteUser('${u.id}')" style="background:#e94560; color:white; border:none; padding:2px 5px; cursor:pointer">Supprimer</button>
                </div>
            </div>
        `).join('');
        document.getElementById('debug-users').innerHTML = userHTML || 'Aucun utilisateur';

        // Render Active Quests Admin (Raw)
        const taskHTML = this.data.activeQuests.map(t => `
            <div style="font-size:0.8rem; background:#16213e; padding:5px; margin-bottom:2px; border-radius:4px;">
                - <b>${t.title}</b> (${t.xp} XP) <br> Échéance: ${new Date(t.dueDate).toLocaleString()}
            </div>
        `).join('');
        
        // On va ajouter un conteneur pour ces tâches dans le HTML (ou le créer dynamiquement)
        let tasksContainer = document.getElementById('debug-tasks');
        if (!tasksContainer) {
            const div = document.createElement('div');
            div.id = 'debug-tasks';
            document.getElementById('debug-users').parentElement.insertAdjacentElement('afterend', div);
            tasksContainer = div;
            const title = document.createElement('h4');
            title.innerText = "Quêtes Actives (Système)";
            tasksContainer.insertAdjacentElement('beforebegin', title);
        }
        tasksContainer.innerHTML = taskHTML || 'Aucune tâche active';

        // Display Guild ID and Metadata
        const metaContainer = document.getElementById('debug-meta');
        if (metaContainer) {
            metaContainer.innerHTML = `ID Guilde Actuelle : <br><code style="user-select:all; background:#222; padding:5px; display:block; margin:10px 0; word-break:break-all;">${this.dbFileId}</code><br>` + JSON.stringify(this.data.meta, null, 2);
        }
    },

    showLoading(s) { document.getElementById('loading').classList.toggle('hidden', !s); },
    showModal(id) { document.getElementById(id).classList.remove('hidden'); },
    hideModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); }
};

document.addEventListener('DOMContentLoaded', () => {
    // Initial UI Setup handled by auth.js checkAuthStatus
});