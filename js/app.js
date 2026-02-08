const app = {
    guildId: null,
    data: null,
    currentUser: null,
    currentView: 'board',
    lastLogId: null,

    async init() {
        auth.init(async (user) => {
            if (user) {
                const params = new URLSearchParams(window.location.search);
                const joinId = params.get('join');
                if (joinId) await this.handleJoinLink(joinId);
                else await this.loadGuild();
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
                alert("Impossible de rejoindre.");
                await this.loadGuild();
            }
        } catch (err) {
            console.error(err);
            await this.loadGuild();
        }
    },

    async loadGuild() {
        if (!this.data) this.showLoading(true); 
        try {
            let savedId = localStorage.getItem('currentGuildId');
            const guilds = await db.getAvailableGuilds(auth.user.email);
            if (guilds.length > 0) {
                const matched = guilds.find(g => g.id === savedId);
                this.guildId = matched ? matched.id : guilds[0].id;
            } else {
                this.guildId = await db.createGuild(auth.user.email, "Ma Guilde");
            }
            localStorage.setItem('currentGuildId', this.guildId);
            db.listenToGuild(this.guildId, (data) => {
                const indicator = document.getElementById('sync-indicator');
                if (indicator) indicator.classList.add('syncing');
                this.data = data;
                this.handleDataUpdate();
                this.showLoading(false);
                setTimeout(() => { if (indicator) indicator.classList.remove('syncing'); }, 1000);
            });
        } catch (err) { console.error(err); this.showLoading(false); }
    },

    handleDataUpdate() {
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

    // --- Game Logic ---
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
            type: 'completion',
            title: quest.title,
            completedBy: this.currentUser.id,
            completedAt: new Date().toISOString(),
            xpEarned: quest.xp,
            instanceId: instanceId,
            definitionId: quest.definitionId
        });
        if (this.data.questLog.length > 50) this.data.questLog.pop();

        if (def && def.frequency && def.frequency !== 'none') {
            quest.dueDate = this.calculateNextDueDate(def).toISOString();
        } else {
            this.data.activeQuests.splice(index, 1);
        }
        await this.save();
    },

    calculateNextDueDate(def) {
        const now = new Date();
        let next = new Date();
        if (def.frequency === 'daily') next.setDate(now.getDate() + 1);
        else if (def.frequency === 'weekly') {
            let found = false;
            for (let i = 1; i <= 7; i++) {
                let check = new Date(); check.setDate(now.getDate() + i);
                if (def.days && def.days.includes(check.getDay().toString())) { next = check; found = true; break; }
            }
            if (!found) next.setDate(now.getDate() + 7);
        }
        else if (def.frequency === 'monthly') next.setMonth(now.getMonth() + 1);
        next.setHours(4, 0, 0, 0);
        return next;
    },

    async undoLog(logId) {
        const idx = this.data.questLog.findIndex(l => l.id === logId);
        if (idx === -1) return;
        const log = this.data.questLog[idx];
        if (!confirm(`Annuler "${log.title}" ?`)) return;

        // 1. Rollback XP
        const user = this.data.users.find(u => u.id === log.completedBy);
        if (user) {
            user.xp -= log.xpEarned;
            if (user.xp < 0 && user.level > 1) { user.level--; user.xp += (user.level * 100); }
            else if (user.xp < 0) user.xp = 0;
        }

        // 2. Rollback Task
        const quest = this.data.activeQuests.find(q => q.definitionId === log.definitionId);
        if (quest) quest.dueDate = new Date(0).toISOString();
        else if (log.type === 'completion') {
            this.data.activeQuests.push({ id: log.instanceId, definitionId: log.definitionId, title: log.title, xp: log.xpEarned, dueDate: new Date(0).toISOString() });
        }

        // 3. Special Undo Log
        this.data.questLog.splice(idx, 1);
        this.data.questLog.unshift({
            id: 'log_undo_' + Date.now(),
            type: 'system',
            title: `Annulation : ${log.title}`,
            completedBy: this.currentUser.id,
            completedAt: new Date().toISOString(),
            xpEarned: 0
        });

        await this.save();
    },

    async addQuest() {
        const title = document.getElementById('quest-title').value;
        const xp = parseInt(document.getElementById('quest-difficulty').value);
        const freq = document.getElementById('quest-frequency').value;
        const tStart = document.getElementById('quest-time-start').value;
        const tEnd = document.getElementById('quest-time-end').value;
        const days = Array.from(document.querySelectorAll('input[name="quest-day"]:checked')).map(cb => cb.value);

        if (!title || isNaN(xp)) return;
        const defId = 'def_' + Date.now();
        const timeSlot = (tStart && tEnd) ? { start: tStart, end: tEnd } : null;

        this.data.questDefinitions.push({ id: defId, title, baseXp: xp, frequency: freq, days, timeSlot });
        this.data.activeQuests.push({ id: 'inst_' + Date.now(), definitionId: defId, title, xp, dueDate: new Date().toISOString(), timeSlot });
        
        this.data.questLog.unshift({ id: 'log_cr_'+Date.now(), type: 'system', title: `Nouvelle quête : ${title}`, completedBy: this.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });
        await this.save();
        this.hideModals();
    },

    // --- UI ---
    getQuestRarity(xp) {
        const maxXP = Math.max(...this.data.questDefinitions.map(d => d.baseXp), 10);
        const r = xp / maxXP;
        if (r >= 0.9) return 'rarity-legendary';
        if (r >= 0.7) return 'rarity-epic';
        if (r >= 0.4) return 'rarity-rare';
        if (r >= 0.2) return 'rarity-uncommon';
        return 'rarity-common';
    },

    render() {
        if (!this.currentUser) return;
        const elContent = document.getElementById('content');
        if (elContent) elContent.classList.remove('hidden');
        document.getElementById('user-name').innerText = this.currentUser.name;
        document.getElementById('user-avatar-display').innerText = this.currentUser.avatar;
        document.getElementById('user-level').innerText = this.currentUser.level || 1;
        document.getElementById('user-xp').innerText = this.currentUser.xp;
        const xpNeeded = (this.currentUser.level || 1) * 100;
        document.getElementById('next-level-xp').innerText = xpNeeded;
        document.getElementById('xp-progress').style.width = `${(this.currentUser.xp / xpNeeded) * 100}%`;
        
        const elBoard = document.getElementById('quest-board');
        const elHistory = document.getElementById('history-board');
        if (this.currentView === 'board') {
            elBoard.classList.remove('hidden'); elHistory.classList.add('hidden');
            this.renderBoard();
        } else {
            elBoard.classList.add('hidden'); elHistory.classList.remove('hidden');
            this.renderHistory();
        }
    },

    renderBoard() {
        const now = new Date().toISOString();
        const active = this.data.activeQuests.filter(q => q.dueDate <= now);
        const upcoming = this.data.activeQuests.filter(q => q.dueDate > now).sort((a,b) => a.dueDate.localeCompare(b.dueDate));

        // Projeter les suivantes
        active.forEach(q => {
            const def = this.data.questDefinitions.find(d => d.id === q.definitionId);
            if (def && def.frequency !== 'none') {
                const nextDate = this.calculateNextDueDate(def);
                upcoming.push({ ...q, id: 'virtual_' + q.id, dueDate: nextDate.toISOString(), isVirtual: true });
            }
        });
        upcoming.sort((a,b) => a.dueDate.localeCompare(b.dueDate));

        const html = (q, up) => {
            const rarity = this.getQuestRarity(q.xp);
            const def = this.data.questDefinitions.find(d => d.id === q.definitionId);
            const freq = (def && def.frequency !== 'none') ? '🔄' : '';
            const time = q.timeSlot ? ` • 🕒 ${q.timeSlot.start}-${q.timeSlot.end}` : '';
            return `<div class="quest-card ${rarity} ${up ? 'upcoming' : ''}">
                <div class="quest-info">
                    <h4>${freq} ${q.title}</h4>
                    <span>💰 ${q.xp} XP${time}</span>
                </div>
                ${!up ? `<button class="complete-btn" onclick="app.completeTask('${q.id}')">Valider</button>` : ''}
            </div>`;
        };

        document.getElementById('task-list').innerHTML = active.length ? active.map(q => html(q, false)).join('') : '<p style="text-align:center; opacity:0.5;">Tout est calme...</p>';
        
        const groups = {};
        upcoming.forEach(q => {
            const d = new Date(q.dueDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            if (!groups[d]) groups[d] = [];
            groups[d].push(q);
        });

        document.getElementById('upcoming-task-list').innerHTML = upcoming.length ? 
            Object.keys(groups).map(day => `
                <div class="upcoming-day-group">
                    <div class="upcoming-day-title">${day}</div>
                    ${groups[day].map(q => html(q, true)).join('')}
                </div>`).join('') : '<p style="text-align:center; opacity:0.2;">Rien de prévu.</p>';
    },

    renderHistory() {
        document.getElementById('history-list').innerHTML = this.data.questLog.map(log => {
            const user = this.data.users.find(u => u.id === log.completedBy || u.email === log.completedBy);
            const color = log.type === 'system' ? '#e94560' : '#4a90e2';
            let actionText = log.type === 'completion' ? "a triomphé de" : "a effectué";
            if (log.title.includes('Annulation')) actionText = "a annulé";
            if (log.title.includes('Nouvelle quête')) actionText = "a forgé";
            
            return `<div class="history-item" style="border-left-color: ${color}">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div><strong>${log.title}</strong><br><small>${user ? user.name : 'Système'} ${actionText} • ${new Date(log.completedAt).toLocaleString()}</small></div>
                    ${log.type === 'completion' ? `<button class="undo-btn" onclick="app.undoLog('${log.id}')">Annuler</button>` : ''}
                </div>
            </div>`;
        }).join('');
    },

    watchForToasts() {
        if (!this.data || !this.data.questLog?.length) return;
        const latest = this.data.questLog[0];
        if (!this.lastLogId) { this.lastLogId = latest.id; return; }
        if (latest.id !== this.lastLogId) {
            this.lastLogId = latest.id;
            const isMe = (latest.completedBy === this.currentUser?.id || latest.completedBy === auth.user.email);
            if (!isMe) this.showActivityToast(latest);
        }
    },

    showActivityToast(log) {
        const t = document.getElementById('activity-toast');
        const user = this.data.users.find(u => u.id === log.completedBy || u.email === log.completedBy);
        const name = user ? user.name : 'Un membre';
        let verb = "a validé";
        if (log.type === 'system') verb = "info :";
        if (log.title.includes('Annulation')) verb = "a annulé l'action";
        if (log.title.includes('Nouvelle quête')) verb = "a créé une quête";

        document.getElementById('toast-icon').innerText = log.type === 'system' ? '🛡️' : '⚔️';
        document.getElementById('toast-message').innerText = `${name} ${verb} : "${log.title}"`;
        t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 5000);
    },

    syncSettingsUI() {
        document.getElementById('edit-guild-name').value = this.data.meta.guildName;
        document.getElementById('edit-guild-public').value = String(!!this.data.meta.isPublic);
        document.getElementById('edit-guild-open').value = String(!!this.data.meta.isOpen);
        this.renderGuildMembers();
        document.getElementById('edit-user-name').value = this.currentUser.name;
        document.getElementById('edit-user-avatar').value = this.currentUser.avatar;
        const qBtn = document.getElementById('quit-guild-btn'); if (qBtn) qBtn.style.display = (this.data.meta.owner === auth.user.email) ? 'none' : 'block';
    },

    renderGuildMembers() {
        document.getElementById('guild-members-list').innerHTML = this.data.users.map(u => `<div style="display:flex; gap:10px; margin-bottom:5px;"><span>${u.avatar}</span><span>${u.name} (Lvl ${u.level || 1})</span></div>`).join('');
    },

    updateCurrentUserInfo() { this.currentUser.name = document.getElementById('edit-user-name').value; this.currentUser.avatar = document.getElementById('edit-user-avatar').value; this.save(); },
    renderDevMode() { document.getElementById('debug-guild-id').innerText = this.guildId; document.getElementById('debug-users').innerHTML = this.data.users.map(u => `<div>${u.name} (${u.email})</div>`).join(''); },
    setView(v) { this.currentView = v; document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.id === `tab-${v}`)); this.render(); },
    showLoading(s) { const el = document.getElementById('loading'); if (el) el.classList.toggle('hidden', !s); },
    showModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); },
    hideModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); },
    forceAppReset() { if(confirm('Réinitialiser ?')) { localStorage.clear(); window.location.reload(); } },
    async renameGuild() { if (!this.data) return; this.data.meta.guildName = document.getElementById('edit-guild-name').value; await this.save(); },
    async openGuildSwitcher() {
        this.showLoading(true); const guilds = await db.getAvailableGuilds(auth.user.email); this.showLoading(false);
        document.getElementById('guild-list-container').innerHTML = guilds.map(g => `<div style="background:${g.id === this.guildId ? '#4a90e2' : '#0f3460'}; padding:10px; margin-bottom:5px; border-radius:5px; cursor:pointer;" onclick="app.switchGuild('${g.id}')"><strong>${g.meta.guildName}</strong></div>`).join('');
        this.showModal('guild-switcher-modal');
    },
    async searchGuilds() {
        const q = document.getElementById('guild-search-input').value; if (!q) return;
        this.showLoading(true); const results = await db.searchPublicGuilds(q); this.showLoading(false);
        document.getElementById('guild-search-results').innerHTML = results.length ? results.map(g => `<div style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between; align-items:center;"><span>${g.meta.guildName}</span><button class="action-btn" style="width:auto; padding:5px 10px;" onclick="app.handleJoinLink('${g.id}')">Rejoindre</button></div>`).join('') : "<p>Rien trouvé.</p>";
    },
    async copyInviteLink() { const url = `${window.location.origin}${window.location.pathname}?join=${this.guildId}`; await navigator.clipboard.writeText(url); alert("Lien copié !"); },
    switchGuild(id) { localStorage.setItem('currentGuildId', id); window.location.reload(); },
    async toggleGuildPublic() { this.data.meta.isPublic = !this.data.meta.isPublic; await this.save(); this.syncSettingsUI(); },
    async leaveGuild() { if (!confirm("Quitter ?")) return; this.showLoading(true); await db.leaveGuild(this.guildId, auth.user.email); localStorage.removeItem('currentGuildId'); window.location.reload(); },
    async updateGuildSettings() { if (!this.data) return; this.data.meta.guildName = document.getElementById('edit-guild-name').value; this.data.meta.isPublic = document.getElementById('edit-guild-public').value === 'true'; this.data.meta.isOpen = document.getElementById('edit-guild-open').value === 'true'; await this.save(); },
};
app.init();