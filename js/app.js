const app = {
    guildId: null,
    data: null,
    currentUser: null, 
    mainUser: null,    
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
                alert("Impossible de rejoindre cette guilde.");
                await this.loadGuild();
            }
        } catch (err) { console.error(err); await this.loadGuild(); }
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
        } catch (err) { console.error("Load Guild Error:", err); this.showLoading(false); }
    },

    handleDataUpdate() {
        this.watchForToasts();
        this.mainUser = this.data.users.find(u => u.email === auth.user.email);
        if (!this.mainUser) {
            this.currentUser = null;
            this.showModal('onboarding-modal');
        } else {
            const impersonatedId = localStorage.getItem('impersonatedHeroId');
            this.currentUser = impersonatedId ? (this.data.users.find(u => u.id === impersonatedId) || this.mainUser) : this.mainUser;
            this.syncSettingsUI();
            this.render();
        }
    },

    async save() { if (this.guildId && this.data) await db.updateGuild(this.guildId, this.data); },

    // --- Hero & Squire Management ---
    async addSquire() {
        const name = document.getElementById('squire-name').value;
        const avatar = document.getElementById('squire-avatar').value;
        if (!name) return;
        const newSquire = { id: 'sq_' + Date.now(), name, avatar, xp: 0, level: 1, managedBy: this.mainUser.id };
        this.data.users.push(newSquire);
        await this.save();
        this.hideModals();
        document.getElementById('squire-name').value = '';
    },

    impersonate(heroId) {
        localStorage.setItem('impersonatedHeroId', heroId);
        this.handleDataUpdate();
        this.hideModals();
    },

    stopImpersonating() {
        localStorage.removeItem('impersonatedHeroId');
        this.handleDataUpdate();
    },

    rotateUser() {
        const squires = this.data.users.filter(u => u.managedBy === this.mainUser.id);
        const rotationList = [this.mainUser, ...squires];
        const currentIndex = rotationList.findIndex(u => u.id === this.currentUser.id);
        const nextUser = rotationList[(currentIndex + 1) % rotationList.length];
        if (nextUser.id === this.mainUser.id) this.stopImpersonating();
        else this.impersonate(nextUser.id);
    },

    // --- Quest Logic & Assignment ---
    async claimQuest(instanceId) {
        const quest = this.data.activeQuests.find(q => q.id === instanceId);
        if (!quest) return;
        quest.assignedTo = this.currentUser.id;
        await this.save();
    },

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
            id: 'log_' + Date.now(), type: 'completion', title: quest.title,
            completedBy: this.currentUser.id, completedAt: new Date().toISOString(),
            xpEarned: quest.xp, instanceId: instanceId, definitionId: quest.definitionId
        });
        if (this.data.questLog.length > 50) this.data.questLog.pop();

        if (def && def.frequency && def.frequency !== 'none') {
            quest.dueDate = this.calculateNextDueDate(def).toISOString();
            // Important: Reset assignee if default was "For all"
            quest.assignedTo = def.defaultAssignee || null;
        } else {
            this.data.activeQuests.splice(index, 1);
        }
        await this.save();
    },

    calculateNextDueDate(def, fromDate = new Date()) {
        let next = new Date(fromDate);
        const interval = parseInt(def.interval || 1);
        if (def.frequency === 'daily') next.setDate(next.getDate() + interval);
        else if (def.frequency === 'weekly') {
            let found = false;
            for (let i = 1; i <= 7 * interval; i++) {
                let check = new Date(fromDate); check.setDate(fromDate.getDate() + i);
                if (def.days && def.days.includes(check.getDay().toString())) { next = check; found = true; break; }
            }
            if (!found) next.setDate(fromDate.getDate() + 7 * interval);
        }
        else if (def.frequency === 'monthly') next.setMonth(next.getMonth() + interval);
        next.setHours(4, 0, 0, 0);
        return next;
    },

    calculateFirstDueDate(def) {
        const now = new Date();
        if (def.frequency === 'weekly' && def.days && def.days.length > 0) {
            if (def.days.includes(now.getDay().toString())) return now;
            return this.calculateNextDueDate(def, now);
        }
        return now;
    },

    async addQuest() {
        const title = document.getElementById('quest-title').value;
        const xp = parseInt(document.getElementById('quest-difficulty').value);
        const freq = document.getElementById('quest-frequency').value;
        const interval = document.getElementById('quest-interval').value;
        const assignee = document.getElementById('quest-assignee').value || null;
        const tStart = document.getElementById('quest-time-start').value;
        const tEnd = document.getElementById('quest-time-end').value;
        const days = Array.from(document.querySelectorAll('input[name="quest-day"]:checked')).map(cb => cb.value);

        if (!title || isNaN(xp)) return;
        const defId = 'def_' + Date.now();
        const timeSlot = (tStart && tEnd) ? { start: tStart, end: tEnd } : null;
        const definition = { id: defId, title, baseXp: xp, frequency: freq, interval, days, timeSlot, defaultAssignee: assignee };
        const firstDueDate = this.calculateFirstDueDate(definition);

        this.data.questDefinitions.push(definition);
        this.data.activeQuests.push({ id: 'inst_' + Date.now(), definitionId: defId, title, xp, dueDate: firstDueDate.toISOString(), timeSlot, assignedTo: assignee });
        this.data.questLog.unshift({ id: 'log_cr_'+Date.now(), type: 'system', title: `Nouvelle quête : ${title}`, completedBy: this.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });
        await this.save();
        this.hideModals();
    },

    openEditQuestModal(instanceId) {
        const realId = instanceId.replace('virtual_', '');
        let quest = this.data.activeQuests.find(q => q.id === realId);
        let defId = quest ? quest.definitionId : realId;
        const def = this.data.questDefinitions.find(d => d.id === defId);
        if (!def) return;

        document.getElementById('edit-quest-id').value = def.id; 
        document.getElementById('edit-quest-title').value = def.title;
        document.getElementById('edit-quest-difficulty').value = def.baseXp;
        document.getElementById('edit-quest-frequency').value = def.frequency || 'none';
        document.getElementById('edit-quest-assignee').value = def.defaultAssignee || '';
        
        if (def.timeSlot) {
            document.getElementById('edit-quest-time-start').value = def.timeSlot.start;
            document.getElementById('edit-quest-time-end').value = def.timeSlot.end;
        } else {
            document.getElementById('edit-quest-time-start').value = '';
            document.getElementById('edit-quest-time-end').value = '';
        }
        const days = def.days || [];
        document.querySelectorAll('input[name="edit-quest-day"]').forEach(cb => cb.checked = days.includes(cb.value));
        document.getElementById('edit-quest-interval').value = def.interval || 1;
        this.toggleRecurrenceUI('edit-quest');
        this.showModal('edit-quest-modal');
    },

    async saveQuestEdits() {
        const defId = document.getElementById('edit-quest-id').value;
        const title = document.getElementById('edit-quest-title').value;
        const xp = parseInt(document.getElementById('edit-quest-difficulty').value);
        const freq = document.getElementById('edit-quest-frequency').value;
        const interval = document.getElementById('edit-quest-interval').value;
        const assignee = document.getElementById('edit-quest-assignee').value || null;
        const tStart = document.getElementById('edit-quest-time-start').value;
        const tEnd = document.getElementById('edit-quest-time-end').value;
        const days = Array.from(document.querySelectorAll('input[name="edit-quest-day"]:checked')).map(cb => cb.value);

        if (!title || isNaN(xp)) return;
        const defIdx = this.data.questDefinitions.findIndex(d => d.id === defId);
        if (defIdx === -1) return;

        const timeSlot = (tStart && tEnd) ? { start: tStart, end: tEnd } : null;
        const oldDef = this.data.questDefinitions[defIdx];
        const changedSchedule = oldDef.frequency !== freq || JSON.stringify(oldDef.days) !== JSON.stringify(days) || oldDef.interval !== interval;

        this.data.questDefinitions[defIdx] = { ...oldDef, title, baseXp: xp, frequency: freq, interval, days, timeSlot, defaultAssignee: assignee };
        this.data.activeQuests.forEach(q => {
            if (q.definitionId === defId) {
                q.title = title; q.xp = xp; q.timeSlot = timeSlot;
                // If it's a new instance or we forced a reschedule
                if (changedSchedule) q.dueDate = this.calculateFirstDueDate(this.data.questDefinitions[defIdx]).toISOString();
                // Update assignment only if it wasn't manually claimed
                if (!q.assignedTo || q.assignedTo === oldDef.defaultAssignee) q.assignedTo = assignee;
            }
        });
        await this.save();
        this.hideModals();
    },

    async archiveQuest() {
        const defId = document.getElementById('edit-quest-id').value;
        if (!confirm("Archiver cette quête ?")) return;
        const def = this.data.questDefinitions.find(d => d.id === defId);
        if (def) def.archived = true;
        this.data.activeQuests = this.data.activeQuests.filter(q => q.definitionId !== defId);
        await this.save();
        this.hideModals();
    },

    async undoLog(logId) {
        const idx = this.data.questLog.findIndex(l => l.id === logId);
        if (idx === -1) return;
        const log = this.data.questLog[idx];
        if (!confirm(`Annuler "${log.title}" ?`)) return;
        const user = this.data.users.find(u => u.id === log.completedBy);
        if (user) {
            user.xp -= log.xpEarned;
            if (user.xp < 0 && user.level > 1) { user.level--; user.xp += (user.level * 100); }
            else if (user.xp < 0) user.xp = 0;
        }
        const quest = this.data.activeQuests.find(q => q.definitionId === log.definitionId);
        if (quest) quest.dueDate = new Date(0).toISOString();
        else if (log.type === 'completion') {
            this.data.activeQuests.push({ id: log.instanceId, definitionId: log.definitionId, title: log.title, xp: log.xpEarned, dueDate: new Date(0).toISOString() });
        }
        this.data.questLog.splice(idx, 1);
        this.data.questLog.unshift({ id: 'log_undo_' + Date.now(), type: 'system', title: `Annulation : ${log.title}`, completedBy: this.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });
        await this.save();
    },

    // --- UI Rendering ---
    render() {
        if (!this.currentUser) return;
        document.getElementById('content').classList.remove('hidden');
        
        const isSquire = this.currentUser.id !== this.mainUser.id;
        document.getElementById('user-name').innerText = (isSquire ? '📜 ' : '') + this.currentUser.name;
        document.getElementById('user-avatar-display').innerText = this.currentUser.avatar;
        document.getElementById('user-level').innerText = this.currentUser.level || 1;
        document.getElementById('user-xp').innerText = this.currentUser.xp;
        const xpNeeded = (this.currentUser.level || 1) * 100;
        document.getElementById('next-level-xp').innerText = xpNeeded;
        document.getElementById('xp-progress').style.width = `${(this.currentUser.xp / xpNeeded) * 100}%`;

        const squires = this.data.users.filter(u => u.managedBy === this.mainUser.id);
        const switchBtn = document.getElementById('quick-switch-btn');
        if (squires.length > 0) {
            switchBtn.classList.remove('hidden');
            const rotationList = [this.mainUser, ...squires];
            const currentIndex = rotationList.findIndex(u => u.id === this.currentUser.id);
            const nextUser = rotationList[(currentIndex + 1) % rotationList.length];
            switchBtn.innerText = nextUser.avatar;
            switchBtn.title = `Passer à ${nextUser.name}`;
        } else {
            switchBtn.classList.add('hidden');
        }
        
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
        const now = new Date();
        const endOfToday = new Date(now); endOfToday.setHours(23,59,59,999);
        const active = this.data.activeQuests.filter(q => new Date(q.dueDate) <= endOfToday);
        let upcoming = this.data.activeQuests.filter(q => new Date(q.dueDate) > endOfToday);

        active.forEach(q => {
            const def = this.data.questDefinitions.find(d => d.id === q.definitionId);
            if (def && def.frequency && def.frequency !== 'none') {
                upcoming.push({ ...q, id: 'virtual_' + q.id, dueDate: this.calculateNextDueDate(def, new Date(q.dueDate)).toISOString(), isVirtual: true });
            }
        });
        upcoming.sort((a,b) => a.dueDate.localeCompare(b.dueDate));

        const html = (q, up) => {
            const rarity = this.getQuestRarity(q.xp);
            const def = this.data.questDefinitions.find(d => d.id === q.definitionId);
            const freq = (def && def.frequency !== 'none') ? '🔄' : '';
            const time = q.timeSlot ? ` • 🕒 ${q.timeSlot.start}-${q.timeSlot.end}` : '';
            
            // Assignee Badge
            const assignee = this.data.users.find(u => u.id === q.assignedTo);
            const assigneeHtml = assignee ? `<span class="assignee-badge" title="Assigné à ${assignee.name}">${assignee.avatar}</span>` : `<span class="assignee-badge empty" title="Pour tous">⚔️</span>`;
            
            // Claim Button
            const canClaim = !q.assignedTo && !up;

            return `<div class="quest-card ${rarity} ${up ? 'upcoming' : ''}">
                <div class="quest-info" onclick="app.openEditQuestModal('${q.id}')" style="cursor:pointer">
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${assigneeHtml}
                        <div>
                            <h4>${freq} ${q.title} <span class="edit-icon">✏️</span></h4>
                            <span>💰 ${q.xp} XP${time}</span>
                        </div>
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:5px;">
                    ${!up ? `<button class="complete-btn" onclick="app.completeTask('${q.id}')">Valider</button>` : ''}
                    ${canClaim ? `<button class="action-btn" onclick="app.claimQuest('${q.id}')" style="padding:2px 8px; font-size:0.7rem; background:#27ae60;">✋ Je prends</button>` : ''}
                </div>
            </div>`;
        };

        document.getElementById('task-list').innerHTML = active.map(q => html(q, false)).join('') || '<p style="text-align:center; opacity:0.5;">Tout est fait !</p>';
        const groups = {};
        upcoming.forEach(q => {
            const d = new Date(q.dueDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            if (!groups[d]) groups[d] = []; groups[d].push(q);
        });
        document.getElementById('upcoming-task-list').innerHTML = Object.keys(groups).map(day => `<div class="upcoming-day-group"><div class="upcoming-day-title">${day}</div>${groups[day].map(q => html(q, true)).join('')}</div>`).join('') || '<p style="text-align:center; opacity:0.2;">Rien de prévu.</p>';
    },

    getQuestRarity(xp) {
        const maxXP = Math.max(...this.data.questDefinitions.map(d => d.baseXp), 10);
        const r = xp / maxXP;
        if (r >= 0.9) return 'rarity-legendary';
        if (r >= 0.7) return 'rarity-epic';
        if (r >= 0.4) return 'rarity-rare';
        if (r >= 0.2) return 'rarity-uncommon';
        return 'rarity-common';
    },

    renderHistory() {
        document.getElementById('history-list').innerHTML = this.data.questLog.map(log => {
            const user = this.data.users.find(u => u.id === log.completedBy || u.email === log.completedBy);
            const color = log.type === 'system' ? '#e94560' : '#4a90e2';
            return `<div class="history-item" style="border-left-color: ${color}"><div style="display:flex; justify-content:space-between; align-items:start;"><div><strong>${log.title}</strong><br><small>${user ? user.name : '??'} • ${new Date(log.completedAt).toLocaleString()}</small></div>${log.type === 'completion' ? `<button class="undo-btn" onclick="app.undoLog('${log.id}')">Annuler</button>` : ''}</div></div>`;
        }).join('');
    },

    watchForToasts() {
        if (!this.data || !this.data.questLog?.length) return;
        const latest = this.data.questLog[0];
        if (!this.lastLogId) { this.lastLogId = latest.id; return; }
        if (latest.id !== this.lastLogId) {
            this.lastLogId = latest.id;
            if (latest.completedBy === this.currentUser?.id || latest.completedBy === auth.user.email) return;
            this.showActivityToast(latest);
        }
    },

    showActivityToast(log) {
        const t = document.getElementById('activity-toast');
        const user = this.data.users.find(u => u.id === log.completedBy || u.email === log.completedBy);
        const name = user ? user.name : 'Un membre';
        let verb = log.type === 'system' ? "info :" : "a validé";
        if (log.title.includes('Annulation')) verb = "a annulé";
        document.getElementById('toast-icon').innerText = log.type === 'system' ? '🛡️' : '⚔️';
        document.getElementById('toast-message').innerText = `${name} ${verb} : "${log.title}"`;
        t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 5000);
    },

    syncSettingsUI() {
        document.getElementById('edit-guild-name').value = this.data.meta.guildName;
        document.getElementById('edit-guild-public').value = String(!!this.data.meta.isPublic);
        document.getElementById('edit-guild-open').value = String(!!this.data.meta.isOpen);
        this.renderGuildMembers();
        
        // Update Assignee Selectors (with safety check)
        const memberOptions = `<option value="">⚔️ Pour tous</option>` + this.data.users.map(u => `<option value="${u.id}">${u.avatar} ${u.name}</option>`).join('');
        
        const elQuestAssignee = document.getElementById('quest-assignee');
        if (elQuestAssignee) elQuestAssignee.innerHTML = memberOptions;
        
        const elEditQuestAssignee = document.getElementById('edit-quest-assignee');
        if (elEditQuestAssignee) elEditQuestAssignee.innerHTML = memberOptions;

        const elUName = document.getElementById('edit-user-name');
        if (elUName) elUName.value = this.mainUser.name;
        document.getElementById('edit-user-avatar').value = this.mainUser.avatar;
        
        const squires = this.data.users.filter(u => u.managedBy === this.mainUser.id);
        const impersonatedId = localStorage.getItem('impersonatedHeroId');
        document.getElementById('squire-list').innerHTML = squires.map(s => `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px; border-radius:5px; margin-bottom:5px;"><span>${s.avatar} <b>${s.name}</b></span>${impersonatedId === s.id ? `<button class="action-btn danger-btn" onclick="app.stopImpersonating()" style="width:auto; padding:2px 8px; font-size:0.7rem;">Quitter</button>` : `<button class="action-btn" onclick="app.impersonate('${s.id}')" style="width:auto; padding:2px 8px; font-size:0.7rem;">Incarner</button>`}</div>`).join('') || '<p style="font-size:0.7rem; opacity:0.5;">Aucun écuyer.</p>';
        const qBtn = document.getElementById('quit-guild-btn'); if (qBtn) qBtn.style.display = (this.data.meta.owner === auth.user.email) ? 'none' : 'block';
    },

    toggleRecurrenceUI(prefix) {
        const val = document.getElementById(`${prefix}-frequency`).value;
        const intervalContainer = document.getElementById(`${prefix}-interval-container`);
        const daysSelector = document.getElementById(`${prefix}-days-selector`);
        if (intervalContainer) intervalContainer.classList.toggle('hidden', val === 'none');
        if (daysSelector) daysSelector.classList.toggle('hidden', val !== 'weekly');
    },

    renderGuildMembers() { document.getElementById('guild-members-list').innerHTML = this.data.users.map(u => `<div style="display:flex; gap:10px; margin-bottom:5px;"><span>${u.avatar}</span><span>${u.name} (Lvl ${u.level || 1})</span></div>`).join(''); },
    updateCurrentUserInfo() { this.mainUser.name = document.getElementById('edit-user-name').value; this.mainUser.avatar = document.getElementById('edit-user-avatar').value; this.save(); },
    renderDevMode() { document.getElementById('debug-guild-id').innerText = this.guildId; document.getElementById('debug-users').innerHTML = `<h4>Membres</h4>` + this.data.users.map(u => `<div>${u.name}</div>`).join('') + `<h4>Définitions</h4>` + this.data.questDefinitions.map(d => `<div>${d.title}</div>`).join(''); },
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
        this.showLoading(true); const guilds = await db.searchPublicGuilds(q); this.showLoading(false);
        document.getElementById('guild-search-results').innerHTML = guilds.length ? guilds.map(g => `<div style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between; align-items:center;"><span>${g.meta.guildName}</span><button class="action-btn" style="width:auto; padding:5px 10px;" onclick="app.handleJoinLink('${g.id}')">Rejoindre</button></div>`).join('') : "<p>Rien trouvé.</p>";
    },
    async copyInviteLink() { const url = `${window.location.origin}${window.location.pathname}?join=${this.guildId}`; await navigator.clipboard.writeText(url); alert("Lien copié !"); },
    switchGuild(id) { localStorage.setItem('currentGuildId', id); window.location.reload(); },
    async toggleGuildPublic() { this.data.meta.isPublic = !this.data.meta.isPublic; await this.save(); this.syncSettingsUI(); },
    async leaveGuild() { if (!confirm("Quitter ?")) return; this.showLoading(true); await db.leaveGuild(this.guildId, auth.user.email); localStorage.removeItem('currentGuildId'); window.location.reload(); },
    async updateGuildSettings() { if (!this.data) return; this.data.meta.guildName = document.getElementById('edit-guild-name').value; this.data.meta.isPublic = document.getElementById('edit-guild-public').value === 'true'; this.data.meta.isOpen = document.getElementById('edit-guild-open').value === 'true'; await this.save(); },
};
app.init();