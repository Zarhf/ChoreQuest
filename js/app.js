const app = {
    guildId: null,
    data: null,
    currentUser: null,
    currentView: 'board',

    async init() {
        auth.init(async (user) => {
            if (user) {
                // Check URL for Invitation
                const params = new URLSearchParams(window.location.search);
                const joinId = params.get('join');
                if (joinId) {
                    await this.handleJoinLink(joinId);
                } else {
                    await this.loadGuild();
                }
            }
        });
    },

    async handleJoinLink(id) {
        this.showLoading(true);
        try {
            const success = await db.joinGuild(id, auth.user.email);
            if (success) {
                localStorage.setItem('currentGuildId', id);
                window.history.replaceState({}, document.title, window.location.pathname);
                window.location.reload();
            } else {
                alert("Impossible de rejoindre cette guilde (Elle est peut-être fermée ou n'existe plus).");
                await this.loadGuild();
            }
        } catch (err) {
            console.error(err);
            alert("Erreur lors de l'adhésion.");
            await this.loadGuild();
        }
    },

    async loadGuild() {
        this.showLoading(true);
        try {
            let savedId = localStorage.getItem('currentGuildId');
            const guilds = await db.getAvailableGuilds(auth.user.email);
            
            if (guilds.length > 0) {
                const matched = guilds.find(g => g.id === savedId);
                this.guildId = matched ? matched.id : guilds[0].id;
            } else {
                // No guild at all, we don't auto-create anymore, 
                // we'll let the user choose or create in the welcome screen logic
                // But for now, to avoid blocking, let's create a default one if absolutely none found
                this.guildId = await db.createGuild(auth.user.email, "Ma Guilde");
            }
            
            localStorage.setItem('currentGuildId', this.guildId);
            db.listenToGuild(this.guildId, (data) => {
                this.data = data;
                this.handleDataUpdate();
                this.showLoading(false);
            });
        } catch (err) { 
            console.error("Load Guild Error:", err); 
            this.showLoading(false); 
        }
    },

    handleDataUpdate() {
        // Watch for changes before rendering (to detect new logs)
        this.watchForToasts();

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

    async save() { if (this.guildId && this.data) await db.updateGuild(this.guildId, this.data); },

    async completeTask(instanceId) {
        const index = this.data.activeQuests.findIndex(q => q.id === instanceId);
        if (index === -1) return;
        const quest = this.data.activeQuests[index];
        const def = this.data.questDefinitions.find(d => d.id === quest.definitionId);
        this.currentUser.xp += parseInt(quest.xp);
        const xpNeeded = (this.currentUser.level || 1) * 100;
        if (this.currentUser.xp >= xpNeeded) {
            this.currentUser.level = (this.currentUser.level || 1) + 1;
            this.currentUser.xp -= xpNeeded;
            alert(`🎊 LEVEL UP! ${this.currentUser.name} est Niveau ${this.currentUser.level} !`);
        }
        this.data.questLog.unshift({
            id: 'log_' + Date.now(),
            title: quest.title,
            completedBy: this.currentUser.id,
            completedAt: new Date().toISOString(),
            xpEarned: quest.xp
        });
        if (this.data.questLog.length > 50) this.data.questLog.pop();
        if (def && def.frequency && def.frequency !== 'none') {
            const next = new Date();
            if (def.frequency === 'daily') next.setDate(next.getDate() + 1);
            else if (def.frequency === 'weekly') next.setDate(next.getDate() + 7);
            else if (def.frequency === 'monthly') next.setMonth(next.getMonth() + 1);
            next.setHours(4, 0, 0, 0);
            quest.dueDate = next.toISOString();
        } else { this.data.activeQuests.splice(index, 1); }
        await this.save();
    },

    async addQuest() {
        const title = document.getElementById('quest-title').value;
        const xp = document.getElementById('quest-difficulty').value;
        const freq = document.getElementById('quest-frequency').value;
        if (!title) return;
        const defId = 'def_' + Date.now();
        this.data.questDefinitions.push({ id: defId, title, baseXp: parseInt(xp), frequency: freq });
        this.data.activeQuests.push({ id: 'inst_' + Date.now(), definitionId: defId, title, xp: parseInt(xp), dueDate: new Date().toISOString() });
        await this.save();
        this.hideModals();
        document.getElementById('quest-title').value = '';
    },

    async finishOnboarding() {
        const name = document.getElementById('new-user-name').value;
        const avatar = document.getElementById('new-user-avatar').value;
        if (!name) return;
        this.data.users.push({ id: 'u' + Date.now(), name, avatar, xp: 0, level: 1, email: auth.user.email });
        await this.save();
        this.hideModals();
    },

    async confirmCreateGuild() {
        const name = document.getElementById('new-guild-name').value;
        const isPublic = document.getElementById('new-guild-public').value === 'true';
        const isOpen = document.getElementById('new-guild-open').value === 'true';

        if (!name) return alert("Le nom de la guilde est requis.");

        this.showLoading(true);
        try {
            const id = await db.createGuild(auth.user.email, name, isPublic, isOpen);
            this.switchGuild(id);
        } catch (err) {
            console.error(err);
            alert("Erreur lors de la création.");
            this.showLoading(false);
        }
    },

    async updateGuildSettings() {
        if (!this.data) return;
        this.data.meta.guildName = document.getElementById('edit-guild-name').value;
        this.data.meta.isPublic = document.getElementById('edit-guild-public').value === 'true';
        this.data.meta.isOpen = document.getElementById('edit-guild-open').value === 'true';
        await this.save();
    },

    async renameGuild() {
        this.updateGuildSettings();
    },

    async openGuildSwitcher() {
        this.showLoading(true);
        const guilds = await db.getAvailableGuilds(auth.user.email);
        this.showLoading(false);
        document.getElementById('guild-list-container').innerHTML = guilds.map(g => `
            <div style="background:${g.id === this.guildId ? '#4a90e2' : '#0f3460'}; padding:10px; margin-bottom:5px; border-radius:5px; cursor:pointer;" 
                 onclick="app.switchGuild('${g.id}')">
                <strong>${g.meta.guildName}</strong>
            </div>`).join('');
        this.showModal('guild-switcher-modal');
    },

    async searchGuilds() {
        const q = document.getElementById('guild-search-input').value;
        if (!q) return;
        this.showLoading(true);
        const results = await db.searchPublicGuilds(q);
        this.showLoading(false);
        document.getElementById('guild-search-results').innerHTML = results.length === 0 ? "<p>Rien trouvé.</p>" : 
            results.map(g => `<div style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between; align-items:center;">
                <span>${g.meta.guildName}</span>
                <button class="action-btn" style="width:auto; padding:5px 10px;" onclick="app.handleJoinLink('${g.id}')">Rejoindre</button>
            </div>`).join('');
    },

    async copyInviteLink() {
        const url = `${window.location.origin}${window.location.pathname}?join=${this.guildId}`;
        await navigator.clipboard.writeText(url);
        alert("Lien copié ! Partagez-le avec vos amis.");
    },

    switchGuild(id) { localStorage.setItem('currentGuildId', id); window.location.reload(); },

    async toggleGuildPublic() {
        this.data.meta.isPublic = !this.data.meta.isPublic;
        await this.save();
        this.syncSettingsUI();
    },

    setView(v) {
        this.currentView = v;
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.id === `tab-${v}`));
        this.render();
    },

    render() {
        if (!this.currentUser) return;
        const elContent = document.getElementById('content');
        if (elContent) elContent.classList.remove('hidden');
        
        // Profile
        const elName = document.getElementById('user-name');
        const elAvatar = document.getElementById('user-avatar-display');
        const elLevel = document.getElementById('user-level');
        const elXP = document.getElementById('user-xp');
        const elNextXP = document.getElementById('next-level-xp');
        const elProgress = document.getElementById('xp-progress');

        if (elName) elName.innerText = this.currentUser.name;
        if (elAvatar) elAvatar.innerText = this.currentUser.avatar;
        if (elLevel) elLevel.innerText = this.currentUser.level || 1;
        if (elXP) elXP.innerText = this.currentUser.xp;
        
        const xpNeeded = (this.currentUser.level || 1) * 100;
        if (elNextXP) elNextXP.innerText = xpNeeded;
        if (elProgress) elProgress.style.width = `${(this.currentUser.xp / xpNeeded) * 100}%`;
        
        if (this.currentView === 'board') {
            const elBoard = document.getElementById('quest-board');
            const elHistory = document.getElementById('history-board');
            if (elBoard) elBoard.classList.remove('hidden');
            if (elHistory) elHistory.classList.add('hidden');
            this.renderBoard();
        } else {
            const elBoard = document.getElementById('quest-board');
            const elHistory = document.getElementById('history-board');
            if (elBoard) elBoard.classList.add('hidden');
            if (elHistory) elHistory.classList.remove('hidden');
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

    async leaveGuild() {
        if (!confirm("Voulez-vous vraiment quitter cette guilde ?")) return;
        this.showLoading(true);
        await db.leaveGuild(this.guildId, auth.user.email);
        localStorage.removeItem('currentGuildId');
        window.location.reload();
    },

    renderHistory() {
        const list = document.getElementById('history-list');
        list.innerHTML = this.data.questLog.map(log => {
            const isSystem = log.type === 'system';
            // Try to find user by ID, if not found (e.g. email for new joiner), use raw ID
            const user = this.data.users.find(u => u.id === log.completedBy || u.email === log.completedBy);
            const userName = user ? user.name : (log.completedBy || 'Système');
            const date = new Date(log.completedAt).toLocaleString();
            
            let icon = '📜';
            let color = '#aaa';
            
            if (isSystem) {
                if (log.title === 'Nouveau membre') { icon = '👋'; color = '#27ae60'; }
                if (log.title === 'Départ') { icon = '🚪'; color = '#e94560'; }
            } else {
                icon = '✅'; color = '#4a90e2';
            }

            return `<div class="history-item" style="border-left-color: ${color}">
                <strong>${icon} ${log.title}</strong><br>
                <small>${userName} • ${date} ${log.xpEarned > 0 ? '• +' + log.xpEarned + ' XP' : ''}</small>
            </div>`;
        }).join('');
    },

    // --- Toast Notification System ---
    lastLogId: null,

    watchForToasts() {
        if (!this.data || !this.data.questLog || this.data.questLog.length === 0) return;
        
        const latestLog = this.data.questLog[0];
        
        // First run: just store the ID
        if (!this.lastLogId) {
            this.lastLogId = latestLog.id;
            return;
        }

        // New log detected!
        if (latestLog.id !== this.lastLogId) {
            this.lastLogId = latestLog.id;
            // Don't toast for my own actions (avoid double feedback)
            if (latestLog.completedBy === this.currentUser.id || latestLog.completedBy === auth.user.email) return;

            this.showToastNotification(latestLog);
        }
    },

    showToastNotification(log) {
        const toast = document.getElementById('update-toast');
        const btn = document.getElementById('update-btn');
        const span = toast.querySelector('span');
        
        // Find user name
        const user = this.data.users.find(u => u.id === log.completedBy || u.email === log.completedBy);
        const userName = user ? user.name : 'Quelqu\'un';

        span.innerText = `${userName} : ${log.title}`;
        btn.style.display = 'none'; // No button for info toast
        
        toast.classList.remove('hidden');
        
        // Hide after 4s
        setTimeout(() => {
            toast.classList.add('hidden');
            btn.style.display = 'inline-block'; // Restore for updates
        }, 4000);
    },

    syncSettingsUI() {
        // ... existing syncSettingsUI code ...
        // Add Quit Button if not owner
        const isOwner = this.data.meta.owner === auth.user.email;
        const quitBtn = document.getElementById('quit-guild-btn');
        if (quitBtn) {
            if (isOwner) {
                quitBtn.style.display = 'none';
            } else {
                quitBtn.style.display = 'block';
            }
        }
    },
        // Guild Modal
        const elGuildName = document.getElementById('edit-guild-name');
        if (elGuildName) elGuildName.value = this.data.meta.guildName;
        
        const elPublic = document.getElementById('edit-guild-public');
        if (elPublic) elPublic.value = String(!!this.data.meta.isPublic);

        const elOpen = document.getElementById('edit-guild-open');
        if (elOpen) elOpen.value = String(!!this.data.meta.isOpen);

        this.renderGuildMembers();

        // Profile Modal
        const elUserName = document.getElementById('edit-user-name');
        if (elUserName) elUserName.value = this.currentUser.name;
        
        const elUserAvatar = document.getElementById('edit-user-avatar');
        if (elUserAvatar) elUserAvatar.value = this.currentUser.avatar;
    },

    renderGuildMembers() {
        const list = document.getElementById('guild-members-list');
        if (!list) return;
        
        list.innerHTML = this.data.users.map(u => `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:5px; font-size:0.9rem;">
                <span style="font-size:1.2rem;">${u.avatar}</span>
                <span style="flex-grow:1;">${u.name}</span>
                <span style="opacity:0.6; font-size:0.8rem;">Lvl ${u.level || 1}</span>
            </div>
        `).join('');
    },

    updateCurrentUserInfo() { this.currentUser.name = document.getElementById('edit-user-name').value; this.currentUser.avatar = document.getElementById('edit-user-avatar').value; this.save(); },
    renderDevMode() { 
        document.getElementById('debug-guild-id').innerText = this.guildId; 
        document.getElementById('debug-users').innerHTML = this.data.users.map(u => `<div>${u.avatar} ${u.name} (${u.email})</div>`).join(''); 
    },
    showLoading(s) { 
        const el = document.getElementById('loading');
        if (el) el.classList.toggle('hidden', !s); 
    },
    
    showModal(id) { 
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('hidden');
        } else {
            console.error(`Modal with ID '${id}' not found!`);
        }
    },
    
    hideModals() { 
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); 
    },
    forceAppReset() { if(confirm('Réinitialiser ?')) { localStorage.clear(); window.location.reload(); } }
};
app.init();