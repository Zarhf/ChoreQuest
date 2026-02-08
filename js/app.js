const app = {
    guildId: null,
    data: null,
    currentUser: null,
    currentView: 'board',

    async init() {
        auth.init(async (user) => {
            if (user) {
                await this.loadGuild();
            }
        });
    },

    async loadGuild() {
        this.showLoading(true);
        try {
            // 1. Get Preferred or Discover Guilds
            let savedGuildId = localStorage.getItem('currentGuildId');
            const availableGuilds = await db.getAvailableGuilds(auth.user.email);

            if (availableGuilds.length > 0) {
                // Pick saved one if still available, or the first one
                const matched = availableGuilds.find(g => g.id === savedGuildId);
                this.guildId = matched ? matched.id : availableGuilds[0].id;
            } else {
                // First time: Create a default guild
                this.guildId = await db.createGuild(auth.user.email, "Ma Guilde");
            }

            localStorage.setItem('currentGuildId', this.guildId);

            // 2. Start Real-time listener
            db.listenToGuild(this.guildId, (data) => {
                this.data = data;
                this.handleDataUpdate();
                this.showLoading(false);
            });

        } catch (err) {
            console.error("Guild loading failed:", err);
            this.showLoading(false);
        }
    },

    handleDataUpdate() {
        // Find Hero linked to current Google Account
        const matchedUser = this.data.users.find(u => u.email === auth.user.email);
        
        if (!matchedUser) {
            this.currentUser = null;
            this.showModal('onboarding-modal');
        } else {
            this.currentUser = matchedUser;
            this.syncSettingsUI();
            this.render();
        }
    },

    // --- Actions (Write to Firebase) ---
    async save() {
        if (this.guildId && this.data) {
            await db.updateGuild(this.guildId, this.data);
        }
    },

    async completeTask(instanceId) {
        const index = this.data.activeQuests.findIndex(q => q.id === instanceId);
        if (index === -1) return;

        const quest = this.data.activeQuests[index];
        const def = this.data.questDefinitions.find(d => d.id === quest.definitionId);
        
        // Reward
        this.currentUser.xp += parseInt(quest.xp);
        const xpNeeded = (this.currentUser.level || 1) * 100;
        if (this.currentUser.xp >= xpNeeded) {
            this.currentUser.level = (this.currentUser.level || 1) + 1;
            this.currentUser.xp -= xpNeeded;
            alert(`🎊 LEVEL UP! ${this.currentUser.name} passe niveau ${this.currentUser.level} !`);
        }

        // History
        this.data.questLog.unshift({
            id: 'log_' + Date.now(),
            title: quest.title,
            completedBy: this.currentUser.id,
            completedAt: new Date().toISOString(),
            xpEarned: quest.xp
        });
        if (this.data.questLog.length > 50) this.data.questLog.pop();

        // Recurrence
        if (def && def.frequency && def.frequency !== 'none') {
            const now = new Date();
            let nextDate = new Date();
            switch(def.frequency) {
                case 'daily': nextDate.setDate(now.getDate() + 1); break;
                case 'weekly': nextDate.setDate(now.getDate() + 7); break;
                case 'monthly': nextDate.setMonth(now.getMonth() + 1); break;
            }
            nextDate.setHours(4, 0, 0, 0);
            quest.dueDate = nextDate.toISOString();
        } else {
            this.data.activeQuests.splice(index, 1);
        }

        await this.save();
    },

    async addQuest() {
        const title = document.getElementById('quest-title').value;
        const xp = document.getElementById('quest-difficulty').value;
        const freq = document.getElementById('quest-frequency').value;
        if (!title) return;

        const defId = 'def_' + Date.now();
        this.data.questDefinitions.push({ id: defId, title, baseXp: parseInt(xp), frequency: freq });
        this.data.activeQuests.push({
            id: 'inst_' + Date.now(),
            definitionId: defId,
            title: title,
            xp: parseInt(xp),
            dueDate: new Date().toISOString()
        });

        await this.save();
        this.hideModals();
        document.getElementById('quest-title').value = '';
    },

    async finishOnboarding() {
        const name = document.getElementById('new-user-name').value;
        const avatar = document.getElementById('new-user-avatar').value;
        if (!name) return;

        const newUser = {
            id: 'u' + Date.now(),
            name,
            avatar,
            xp: 0,
            level: 1,
            email: auth.user.email
        };
        this.data.users.push(newUser);
        await this.save();
        this.hideModals();
    },

    async createNewGuild() {
        const name = prompt("Nom de la nouvelle Guilde :");
        if (!name) return;
        this.showLoading(true);
        const newId = await db.createGuild(auth.user.email, name);
        localStorage.setItem('currentGuildId', newId);
        window.location.reload();
    },

    async openGuildSwitcher() {
        this.showLoading(true);
        const guilds = await db.getAvailableGuilds(auth.user.email);
        this.showLoading(false);

        const listHtml = guilds.map(g => `
            <div style="background:${g.id === this.guildId ? '#4a90e2' : '#0f3460'}; padding:10px; margin-bottom:5px; border-radius:5px; cursor:pointer;" 
                 onclick="app.switchGuild('${g.id}')">
                <strong>${g.meta.guildName}</strong><br>
                <small>ID: ${g.id}</small>
            </div>`).join('');
        
        document.getElementById('guild-list-container').innerHTML = listHtml;
        this.showModal('guild-modal');
    },

    switchGuild(id) {
        localStorage.setItem('currentGuildId', id);
        window.location.reload();
    },

    async renameGuild() {
        const newName = prompt("Nouveau nom :", this.data.meta.guildName);
        if (newName) {
            this.data.meta.guildName = newName;
            await this.save();
        }
    },

    // --- UI Helpers ---
    setView(v) {
        this.currentView = v;
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.id === `tab-${v}`));
        this.render();
    },

    render() {
        if (!this.currentUser) return;
        document.getElementById('content').classList.remove('hidden');
        
        // Profile
        document.getElementById('user-name').innerText = this.currentUser.name;
        document.getElementById('user-avatar').innerText = this.currentUser.avatar;
        document.getElementById('user-level').innerText = this.currentUser.level || 1;
        document.getElementById('user-xp').innerText = this.currentUser.xp;
        const xpNeeded = (this.currentUser.level || 1) * 100;
        document.getElementById('next-level-xp').innerText = xpNeeded;
        document.getElementById('xp-progress').style.width = `${(this.currentUser.xp / xpNeeded) * 100}%`;

        if (this.currentView === 'board') {
            document.getElementById('quest-board').classList.remove('hidden');
            document.getElementById('history-board').classList.add('hidden');
            this.renderBoard();
        } else {
            document.getElementById('quest-board').classList.add('hidden');
            document.getElementById('history-board').classList.remove('hidden');
            this.renderHistory();
        }
    },

    renderBoard() {
        const now = new Date().toISOString();
        const visible = this.data.activeQuests.filter(q => q.dueDate <= now);
        const list = document.getElementById('task-list');
        list.innerHTML = visible.length === 0 ? '<p style="text-align:center; opacity:0.5;">Tout est fait !</p>' : 
            visible.map(q => `
                <div class="quest-card">
                    <div class="quest-info">
                        <h4>${q.title}</h4>
                        <span>💰 ${q.xp} XP</span>
                    </div>
                    <button class="complete-btn" onclick="app.completeTask('${q.id}')">Valider</button>
                </div>`).join('');
    },

    renderHistory() {
        const list = document.getElementById('history-list');
        list.innerHTML = this.data.questLog.map(log => {
            const user = this.data.users.find(u => u.id === log.completedBy);
            return `<div class="history-item">
                <strong>${log.title}</strong><br>
                <small>Par ${user ? user.name : '??'} • ${new Date(log.completedAt).toLocaleString()}</small>
            </div>`;
        }).join('');
    },

    syncSettingsUI() {
        const elGuild = document.getElementById('current-guild-name');
        if (elGuild) elGuild.innerText = this.data.meta.guildName;
        document.getElementById('edit-user-name').value = this.currentUser.name;
        document.getElementById('edit-user-avatar').value = this.currentUser.avatar;
    },

    updateCurrentUserInfo() {
        this.currentUser.name = document.getElementById('edit-user-name').value;
        this.currentUser.avatar = document.getElementById('edit-user-avatar').value;
        this.save();
    },

    renderDevMode() {
        document.getElementById('debug-guild-id').innerText = this.guildId;
        document.getElementById('debug-users').innerHTML = this.data.users.map(u => `<div>${u.avatar} ${u.name} (${u.email})</div>`).join('');
    },

    showLoading(s) { document.getElementById('loading').classList.toggle('hidden', !s); },
    showModal(id) { document.getElementById(id).classList.remove('hidden'); },
    hideModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); },
    forceAppReset() { if(confirm('Réinitialiser ?')) { localStorage.clear(); window.location.reload(); } }
};

app.init();