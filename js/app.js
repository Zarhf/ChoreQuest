const app = {
    guildId: null,
    data: null,
    currentUser: null, 
    mainUser: null,    
    currentView: 'board',
    lastLogId: null,
    currentAvatarStyle: 'adventurer',
    _pendingAction: null,

    async init() {
        auth.init(async (user) => {
            if (user) {
                const params = new URLSearchParams(window.location.search);
                const joinId = params.get('join');
                if (joinId) await app.handleJoinLink(joinId);
                else await app.loadGuild();
            }
        });
    },

    async handleJoinLink(id) {
        app.showLoading(true);
        try {
            const success = await db.joinGuild(id, auth.user.email);
            if (success) {
                localStorage.setItem('currentGuildId', id);
                window.history.replaceState({}, document.title, window.location.pathname);
                window.location.reload();
            } else {
                alert("Impossible de rejoindre.");
                await app.loadGuild();
            }
        } catch (err) { console.error(err); await app.loadGuild(); }
    },

    async loadGuild() {
        if (!app.data) app.showLoading(true); 
        try {
            let savedId = localStorage.getItem('currentGuildId');
            const guilds = await db.getAvailableGuilds(auth.user.email);
            if (guilds.length > 0) {
                const matched = guilds.find(g => g.id === savedId);
                app.guildId = matched ? matched.id : guilds[0].id;
            } else {
                app.guildId = await db.createGuild(auth.user.email, "Ma Guilde");
            }
            localStorage.setItem('currentGuildId', app.guildId);
            db.listenToGuild(app.guildId, (data) => {
                const indicator = document.getElementById('sync-indicator');
                if (indicator) indicator.classList.add('syncing');
                app.data = data;
                app.handleDataUpdate();
                app.showLoading(false);
                setTimeout(() => { if (indicator) indicator.classList.remove('syncing'); }, 1000);
            });
        } catch (err) { console.error("Load Guild Error:", err); app.showLoading(false); }
    },

    handleDataUpdate() {
        app.watchForToasts();
        app.mainUser = app.data.users.find(u => u.email === auth.user.email);
        if (!app.mainUser) {
            app.currentUser = null;
            app.showModal('onboarding-modal');
        } else {
            let needsSave = false;
            app.data.users.forEach(u => {
                if (!u.avatar || !u.avatar.startsWith('http')) {
                    u.avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(u.name || 'Hero')}`;
                    needsSave = true;
                }
            });
            if (needsSave) app.save();
            const impersonatedId = localStorage.getItem('impersonatedHeroId');
            app.currentUser = impersonatedId ? (app.data.users.find(u => u.id === impersonatedId) || app.mainUser) : app.mainUser;
            app.syncSettingsUI();
            app.render();
        }
    },

    async save() { if (app.guildId && app.data) await db.updateGuild(app.guildId, app.data); },

    // --- Confirmation Engine ---
    askConfirm(message, callback) {
        app._pendingAction = callback;
        document.getElementById('confirm-message').innerText = message;
        app.showModal('confirm-modal');
        const btn = document.getElementById('confirm-yes-btn');
        btn.onclick = () => {
            if (app._pendingAction) app._pendingAction();
            app.hideModals();
            app._pendingAction = null;
        };
    },

    // --- Avatar Management ---
    getAvatarHtml(avatarStr, size = "40px") {
        if (!avatarStr || !avatarStr.startsWith('http')) {
            const seed = app.currentUser?.name || 'Hero';
            avatarStr = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
        }
        return `<img src="${avatarStr}" alt="Avatar" style="width:${size}; height:${size}; border-radius:50%; display:block; object-fit:cover; border: 1px solid rgba(255,255,255,0.1);">`;
    },

    setAvatarStyle(style, prefix = 'edit') {
        app.currentAvatarStyle = style;
        document.querySelectorAll(`#${prefix}-avatar-preview ~ .style-selector .style-btn`).forEach(btn => {
            btn.classList.toggle('active', btn.innerText.toLowerCase().includes(style.slice(0,3)));
        });
        app.updateAvatarPreview(prefix, true);
    },

    updateAvatarPreview(prefix = 'edit', forceSave = false) {
        const seedInput = document.getElementById(`${prefix}-avatar-seed`);
        const seed = (seedInput && seedInput.value) ? seedInput.value : (app.currentUser?.name || 'Quest');
        const url = `https://api.dicebear.com/7.x/${app.currentAvatarStyle}/svg?seed=${encodeURIComponent(seed)}`;
        const preview = document.getElementById(`${prefix}-avatar-preview`);
        if (preview) preview.innerHTML = `<img src="${url}" alt="Preview" style="width:100%; height:100%; object-fit:cover;">`;
        if (prefix === 'edit' && app.currentUser) {
            if (forceSave || (seedInput && seedInput.value)) {
                app.currentUser.avatar = url;
                app.save();
            }
        }
    },

    randomAvatar() {
        const rand = Math.random().toString(36).substring(7);
        const el = document.getElementById('edit-avatar-seed');
        if (el) el.value = rand;
        app.updateAvatarPreview('edit', true);
    },

    // --- Hero & Squire Management ---
    async addSquire() {
        const name = document.getElementById('squire-name').value;
        const seed = document.getElementById('squire-avatar-seed').value || name;
        const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
        if (!name) return;
        const newSquire = { id: 'sq_' + Date.now(), name, avatar, xp: 0, level: 1, managedBy: app.mainUser.id };
        app.data.users.push(newSquire);
        await app.save();
        app.hideModals();
        document.getElementById('squire-name').value = '';
        document.getElementById('squire-avatar-seed').value = '';
    },

    impersonate(heroId) {
        localStorage.setItem('impersonatedHeroId', heroId);
        window.location.reload(); 
    },

    stopImpersonating() {
        localStorage.removeItem('impersonatedHeroId');
        window.location.reload();
    },

    rotateUser() {
        const squires = app.data.users.filter(u => u.managedBy === app.mainUser.id);
        const rotationList = [app.mainUser, ...squires];
        const currentIndex = rotationList.findIndex(u => u.id === app.currentUser.id);
        const nextUser = rotationList[(currentIndex + 1) % rotationList.length];
        if (nextUser.id === app.mainUser.id) app.stopImpersonating();
        else app.impersonate(nextUser.id);
    },

    async finishOnboarding() {
        const name = document.getElementById('new-user-name').value;
        const seed = document.getElementById('onboard-avatar-seed').value || name;
        const avatar = `https://api.dicebear.com/7.x/${app.currentAvatarStyle}/svg?seed=${encodeURIComponent(seed)}`;
        if (!name) return;
        app.data.users.push({ id: 'u_' + Date.now(), name, avatar, email: auth.user.email, xp: 0, level: 1 });
        await app.save();
        app.hideModals();
    },

    // --- Quest Logic ---
    async claimQuest(instanceId) {
        const quest = app.data.activeQuests.find(q => q.id === instanceId);
        if (!quest) return;
        quest.assignedTo = app.currentUser.id;
        await app.save();
    },

    async completeTask(instanceId) {
        const index = app.data.activeQuests.findIndex(q => q.id === instanceId);
        if (index === -1) return;
        const quest = app.data.activeQuests[index];
        const def = app.data.questDefinitions.find(d => d.id === quest.definitionId);
        app.currentUser.xp += parseInt(quest.xp);
        const xpNeeded = (app.currentUser.level || 1) * 100;
        if (app.currentUser.xp >= xpNeeded) {
            app.currentUser.level = (app.currentUser.level || 1) + 1;
            app.currentUser.xp -= (app.currentUser.level - 1) * 100;
            alert(`🎊 LEVEL UP! ${app.currentUser.name} est Niveau ${app.currentUser.level} !`);
        }
        app.data.questLog.unshift({ id: 'log_'+Date.now(), type: 'completion', title: quest.title, completedBy: app.currentUser.id, completedAt: new Date().toISOString(), xpEarned: quest.xp, instanceId: instanceId, definitionId: quest.definitionId });
        if (app.data.questLog.length > 50) app.data.questLog.pop();
        if (def && def.frequency && def.frequency !== 'none') {
            quest.dueDate = app.calculateNextDueDate(def).toISOString();
            quest.assignedTo = def.defaultAssignee || null;
        } else app.data.activeQuests.splice(index, 1);
        await app.save();
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
            return app.calculateNextDueDate(def, now);
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
        const firstDueDate = app.calculateFirstDueDate(definition);
        app.data.questDefinitions.push(definition);
        app.data.activeQuests.push({ id: 'inst_' + Date.now(), definitionId: defId, title, xp, dueDate: firstDueDate.toISOString(), timeSlot, assignedTo: assignee });
        app.data.questLog.unshift({ id: 'log_cr_'+Date.now(), type: 'system', title: `Nouvelle quête : ${title}`, completedBy: app.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });
        await app.save();
        app.hideModals();
    },

    openEditQuestModal(instanceId) {
        const realId = instanceId.replace('virtual_', '');
        let quest = app.data.activeQuests.find(q => q.id === realId);
        let defId = quest ? quest.definitionId : realId;
        const def = app.data.questDefinitions.find(d => d.id === defId);
        if (!def) return;
        document.getElementById('edit-quest-id').value = def.id; 
        document.getElementById('edit-quest-title').value = def.title;
        document.getElementById('edit-quest-difficulty').value = def.baseXp;
        document.getElementById('edit-quest-frequency').value = def.frequency || 'none';
        const elAssignee = document.getElementById('edit-quest-assignee');
        if (elAssignee) elAssignee.value = def.defaultAssignee || '';
        if (def.timeSlot) { document.getElementById('edit-quest-time-start').value = def.timeSlot.start; document.getElementById('edit-quest-time-end').value = def.timeSlot.end; }
        else { document.getElementById('edit-quest-time-start').value = ''; document.getElementById('edit-quest-time-end').value = ''; }
        const days = def.days || [];
        document.querySelectorAll('input[name="edit-quest-day"]').forEach(cb => cb.checked = days.includes(cb.value));
        document.getElementById('edit-quest-interval').value = def.interval || 1;
        app.toggleRecurrenceUI('edit-quest');
        app.showModal('edit-quest-modal');
    },

    async saveQuestEdits() {
        app.askConfirm("Sauvegarder les modifications ?", async () => {
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
            const defIdx = app.data.questDefinitions.findIndex(d => d.id === defId);
            if (defIdx === -1) return;
            const timeSlot = (tStart && tEnd) ? { start: tStart, end: tEnd } : null;
            const oldDef = app.data.questDefinitions[defIdx];
            const changedSchedule = oldDef.frequency !== freq || JSON.stringify(oldDef.days) !== JSON.stringify(days) || oldDef.interval !== interval;
            app.data.questDefinitions[defIdx] = { ...oldDef, title, baseXp: xp, frequency: freq, interval, days, timeSlot, defaultAssignee: assignee };
            app.data.activeQuests.forEach(q => {
                if (q.definitionId === defId) {
                    q.title = title; q.xp = xp; q.timeSlot = timeSlot;
                    if (changedSchedule) q.dueDate = app.calculateFirstDueDate(app.data.questDefinitions[defIdx]).toISOString();
                    if (!q.assignedTo || q.assignedTo === oldDef.defaultAssignee) q.assignedTo = assignee;
                }
            });
            await app.save();
            app.hideModals();
        });
    },

    async archiveQuest() {
        app.askConfirm("Supprimer cette quête ?", async () => {
            const defId = document.getElementById('edit-quest-id').value;
            const def = app.data.questDefinitions.find(d => d.id === defId);
            if (def) def.archived = true;
            app.data.activeQuests = app.data.activeQuests.filter(q => q.definitionId !== defId);
            await app.save();
            app.hideModals();
        });
    },

    async undoLog(logId) {
        app.askConfirm("Annuler cet exploit ?", async () => {
            const idx = app.data.questLog.findIndex(l => l.id === logId);
            if (idx === -1) return;
            const log = app.data.questLog[idx];
            const user = app.data.users.find(u => u.id === log.completedBy);
            if (user) { user.xp -= log.xpEarned; if (user.xp < 0 && user.level > 1) { user.level--; user.xp += (user.level * 100); } else if (user.xp < 0) user.xp = 0; }
            const quest = app.data.activeQuests.find(q => q.definitionId === log.definitionId);
            if (quest) quest.dueDate = new Date(0).toISOString();
            else if (log.type === 'completion') app.data.activeQuests.push({ id: log.instanceId, definitionId: log.definitionId, title: log.title, xp: log.xpEarned, dueDate: new Date(0).toISOString() });
            app.data.questLog.splice(idx, 1);
            app.data.questLog.unshift({ id: 'log_undo_' + Date.now(), type: 'system', title: `Annulation : ${log.title}`, completedBy: app.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });
            await app.save();
        });
    },

    // --- UI Rendering ---
    render() {
        if (!app.currentUser) return;
        document.getElementById('content').classList.remove('hidden');
        const isSquire = app.currentUser.id !== app.mainUser.id;
        document.getElementById('user-name').innerText = (isSquire ? '📜 ' : '') + app.currentUser.name;
        document.getElementById('user-avatar-display').innerHTML = app.getAvatarHtml(app.currentUser.avatar, "80px");
        document.getElementById('user-level').innerText = app.currentUser.level || 1;
        document.getElementById('user-xp').innerText = app.currentUser.xp;
        const xpNeeded = (app.currentUser.level || 1) * 100;
        document.getElementById('next-level-xp').innerText = xpNeeded;
        document.getElementById('xp-progress').style.width = `${(app.currentUser.xp / xpNeeded) * 100}%`;
        const profBtn = document.getElementById('profile-btn');
        if (profBtn) profBtn.innerHTML = app.getAvatarHtml(app.currentUser.avatar, "40px");
        const squires = app.data.users.filter(u => u.managedBy === app.mainUser.id);
        const switchBtn = document.getElementById('quick-switch-btn');
        if (squires.length > 0) {
            switchBtn.classList.remove('hidden');
            const rotationList = [app.mainUser, ...squires];
            const currentIndex = rotationList.findIndex(u => u.id === app.currentUser.id);
            const nextUser = rotationList[(currentIndex + 1) % rotationList.length];
            switchBtn.innerHTML = app.getAvatarHtml(nextUser.avatar, "30px");
            switchBtn.title = `Passer à ${nextUser.name}`;
        } else switchBtn.classList.add('hidden');
        if (app.currentView === 'board') { document.getElementById('quest-board').classList.remove('hidden'); document.getElementById('history-board').classList.add('hidden'); app.renderBoard(); }
        else { document.getElementById('quest-board').classList.add('hidden'); document.getElementById('history-board').classList.remove('hidden'); app.renderHistory(); }
    },

    renderBoard() {
        const now = new Date();
        const endOfToday = new Date(now); endOfToday.setHours(23,59,59,999);
        const active = app.data.activeQuests.filter(q => new Date(q.dueDate) <= endOfToday);
        let upcoming = app.data.activeQuests.filter(q => new Date(q.dueDate) > endOfToday);
        active.forEach(q => { const def = app.data.questDefinitions.find(d => d.id === q.definitionId); if (def && def.frequency && def.frequency !== 'none') { upcoming.push({ ...q, id: 'virtual_' + q.id, dueDate: app.calculateNextDueDate(def, new Date(q.dueDate)).toISOString(), isVirtual: true }); } });
        upcoming.sort((a,b) => a.dueDate.localeCompare(b.dueDate));
        const html = (q, up) => {
            const rarity = app.getQuestRarity(q.xp);
            const def = app.data.questDefinitions.find(d => d.id === q.definitionId);
            const freq = (def && def.frequency !== 'none') ? '🔄' : '';
            const time = q.timeSlot ? ` • 🕒 ${q.timeSlot.start}-${q.timeSlot.end}` : '';
            const assignee = app.data.users.find(u => u.id === q.assignedTo);
            const assigneeHtml = `<div class="assignee-badge ${!assignee ? 'empty' : ''}">${app.getAvatarHtml(assignee ? assignee.avatar : '?', "36px")}</div>`;
            const canClaim = !q.assignedTo && !up;
            return `<div class="quest-card ${rarity} ${up ? 'upcoming' : ''}">
                <div class="quest-body" onclick="app.openEditQuestModal('${q.id}')" style="cursor:pointer">
                    ${assigneeHtml}
                    <div class="quest-info">
                        <h4>${freq} ${q.title} <span class="edit-icon">✏️</span></h4>
                        <span>💰 ${q.xp} XP${time}</span>
                    </div>
                </div>
                <div class="quest-actions-container">
                    ${canClaim ? `<button class="quest-action-btn btn-claim" onclick="event.stopPropagation(); app.askConfirm('Prendre cette quête ?', () => app.claimQuest('${q.id}'))" title="✋ Je prends">☝️</button>` : ''}
                    ${!up ? `<button class="quest-action-btn btn-complete" onclick="event.stopPropagation(); app.askConfirm('Terminer cette quête ?', () => app.completeTask('${q.id}'))" title="Valider">✅</button>` : ''}
                </div>
            </div>`;
        };
        document.getElementById('task-list').innerHTML = active.map(q => html(q, false)).join('') || '<p style="text-align:center; opacity:0.5;">Tout est fait !</p>';
        const groups = {};
        upcoming.forEach(q => { const d = new Date(q.dueDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); if (!groups[d]) groups[d] = []; groups[d].push(q); });
        document.getElementById('upcoming-task-list').innerHTML = Object.keys(groups).map(day => `<div class="upcoming-day-group"><div class="upcoming-day-title">${day}</div>${groups[day].map(q => html(q, true)).join('')}</div>`).join('') || '<p style="text-align:center; opacity:0.2;">Rien de prévu.</p>';
    },

    getQuestRarity(xp) { const maxXP = Math.max(...app.data.questDefinitions.map(d => d.baseXp), 10); const r = xp / maxXP; if (r >= 0.9) return 'rarity-legendary'; if (r >= 0.7) return 'rarity-epic'; if (r >= 0.4) return 'rarity-rare'; if (r >= 0.2) return 'rarity-uncommon'; return 'rarity-common'; },
    renderHistory() { document.getElementById('history-list').innerHTML = app.data.questLog.map(log => { const user = app.data.users.find(u => u.id === log.completedBy || u.email === log.completedBy); const color = log.type === 'system' ? '#e94560' : '#4a90e2'; return `<div class="history-item" style="border-left-color: ${color}"><div style="display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; gap:10px;">${app.getAvatarHtml(user ? user.avatar : '?', "30px")}<div><strong>${log.title}</strong><br><small>${user ? user.name : '??'} • ${new Date(log.completedAt).toLocaleString()}</small></div></div>${log.type === 'completion' ? `<button class="undo-btn" onclick="app.undoLog('${log.id}')">Annuler</button>` : ''}</div></div>`; }).join(''); },
    watchForToasts() { if (!app.data || !app.data.questLog?.length) return; const latest = app.data.questLog[0]; if (!app.lastLogId) { app.lastLogId = latest.id; return; } if (latest.id !== app.lastLogId) { app.lastLogId = latest.id; if (latest.completedBy === app.currentUser?.id || latest.completedBy === auth.user.email) return; app.showActivityToast(latest); } },
    showActivityToast(log) { const t = document.getElementById('activity-toast'); const user = app.data.users.find(u => u.id === log.completedBy || u.email === log.completedBy); const elAvatar = document.getElementById('toast-avatar'); if (elAvatar) elAvatar.innerHTML = app.getAvatarHtml(user ? user.avatar : '?', "30px"); let verb = log.type === 'system' ? "info :" : "a validé"; if (log.title.includes('Annulation')) verb = "a annulé"; document.getElementById('toast-message').innerText = `${user ? user.name : 'Un membre'} ${verb} : "${log.title}"`; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 5000); },
    syncSettingsUI() {
        const elName = document.getElementById('edit-guild-name'); if (elName) elName.value = app.data.meta.guildName;
        app.renderGuildMembers();
        const memberOptions = `<option value="">❓ Pour tous</option>` + app.data.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
        const elQAssignee = document.getElementById('quest-assignee'); if (elQAssignee) elQAssignee.innerHTML = memberOptions;
        const elEditQAssignee = document.getElementById('edit-quest-assignee'); if (elEditQAssignee) elEditQAssignee.innerHTML = memberOptions;
        const elUName = document.getElementById('edit-user-name'); if (elUName) elUName.value = app.currentUser.name;
        const elSeed = document.getElementById('edit-avatar-seed'); if (elSeed && !elSeed.value && app.currentUser.avatar.includes('seed=')) { const urlParts = app.currentUser.avatar.split('seed='); if (urlParts.length > 1) elSeed.value = decodeURIComponent(urlParts[1]); }
        app.updateAvatarPreview('edit');
        const squires = app.data.users.filter(u => u.managedBy === app.mainUser.id);
        const impersonatedId = localStorage.getItem('impersonatedHeroId');
        const elSquireList = document.getElementById('squire-list'); if (elSquireList) elSquireList.innerHTML = squires.map(s => `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px; border-radius:5px; margin-bottom:5px;"><span>${app.getAvatarHtml(s.avatar, "20px")} <b>${s.name}</b></span>${impersonatedId === s.id ? `<button class="action-btn danger-btn" onclick="app.stopImpersonating()" style="width:auto; padding:2px 8px; font-size:0.7rem;">Quitter</button>` : `<button class="action-btn" onclick="app.impersonate('${s.id}')" style="width:auto; padding:2px 8px; font-size:0.7rem;">Incarner</button>`}</div>`).join('') || '<p style="font-size:0.7rem; opacity:0.5;">Aucun écuyer.</p>';
    },
    toggleRecurrenceUI(prefix) { const elFreq = document.getElementById(`${prefix}-frequency`); if (!elFreq) return; const val = elFreq.value; const intervalContainer = document.getElementById(`${prefix}-interval-container`); const daysSelector = document.getElementById(`${prefix}-days-selector`); if (intervalContainer) intervalContainer.classList.toggle('hidden', val === 'none'); if (daysSelector) daysSelector.classList.toggle('hidden', val !== 'weekly'); },
    renderGuildMembers() { const elList = document.getElementById('guild-members-list'); if (elList) elList.innerHTML = app.data.users.map(u => `<div style="display:flex; gap:10px; margin-bottom:5px;"><span>${app.getAvatarHtml(u.avatar, "20px")}</span><span>${u.name} (Lvl ${u.level || 1})</span></div>`).join(''); },
    updateCurrentUserInfo() { app.currentUser.name = document.getElementById('edit-user-name').value; app.save(); },
    renderDevMode() { document.getElementById('debug-guild-id').innerText = app.guildId; document.getElementById('debug-users').innerHTML = `<h4>Membres</h4>` + app.data.users.map(u => `<div>${u.name}</div>`).join('') + `<h4>Définitions</h4>` + app.data.questDefinitions.map(d => `<div>${d.title}</div>`).join(''); },
    setView(v) { app.currentView = v; document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.id === `tab-${v}`)); app.render(); },
    showLoading(s) { const el = document.getElementById('loading'); if (el) el.classList.toggle('hidden', !s); },
    showModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); },
    hideModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); },
    forceAppReset() { if(confirm('Réinitialiser ?')) { localStorage.clear(); window.location.reload(); } },
    async renameGuild() { if (!app.data) return; app.data.meta.guildName = document.getElementById('edit-guild-name').value; await app.save(); },
    async openGuildSwitcher() { app.showLoading(true); const guilds = await db.getAvailableGuilds(auth.user.email); app.showLoading(false); document.getElementById('guild-list-container').innerHTML = guilds.map(g => `<div style="background:${g.id === app.guildId ? '#4a90e2' : '#0f3460'}; padding:10px; margin-bottom:5px; border-radius:5px; cursor:pointer;" onclick="app.switchGuild('${g.id}')"><strong>${g.meta.guildName}</strong></div>`).join(''); app.showModal('guild-switcher-modal'); },
    async searchGuilds() { const q = document.getElementById('guild-search-input').value; if (!q) return; app.showLoading(true); const guilds = await db.searchPublicGuilds(q); app.showLoading(false); document.getElementById('guild-search-results').innerHTML = guilds.length ? guilds.map(g => `<div style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between; align-items:center;"><span>${g.meta.guildName}</span><button class="action-btn" style="width:auto; padding:5px 10px;" onclick="app.handleJoinLink('${g.id}')">Rejoindre</button></div>`).join('') : "<p>Rien trouvé.</p>"; },
    async copyInviteLink() { const url = `${window.location.origin}${window.location.pathname}?join=${app.guildId}`; await navigator.clipboard.writeText(url); alert("Lien copié !"); },
    switchGuild(id) { localStorage.setItem('currentGuildId', id); window.location.reload(); },
    async toggleGuildPublic() { app.data.meta.isPublic = !app.data.meta.isPublic; await app.save(); app.syncSettingsUI(); },
    async leaveGuild() { if (!confirm("Quitter ?")) return; app.showLoading(true); await db.leaveGuild(app.guildId, auth.user.email); localStorage.removeItem('currentGuildId'); window.location.reload(); },
    async updateGuildSettings() { if (!app.data) return; app.data.meta.guildName = document.getElementById('edit-guild-name').value; app.data.meta.isPublic = document.getElementById('edit-guild-public').value === 'true'; app.data.meta.isOpen = document.getElementById('edit-guild-open').value === 'true'; await app.save(); },
};
app.init();