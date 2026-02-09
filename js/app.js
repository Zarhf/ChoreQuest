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
        console.log("🛡️ ChoreQuest Build 103 starting...");
        fetch('version.json?t='+Date.now()).then(r => r.json()).then(v => {
            const el = document.getElementById('app-version');
            if (el) el.innerText = `v${v.version}.${v.build}`;
        });

        auth.init(async (user) => {
            if (user) {
                db.listenToSystemConfig((config) => {
                    if (config && config.minBuild) {
                        const localBuild = parseInt(localStorage.getItem('app_build') || '0');
                        if (config.minBuild > localBuild) {
                            console.log(`🔥 KILL SWITCH: Remote ${config.minBuild} > Local ${localBuild}`);
                            
                            // Nuke Cache
                            if ('serviceWorker' in navigator) {
                                navigator.serviceWorker.getRegistrations().then(registrations => {
                                    for(let registration of registrations) registration.unregister();
                                });
                            }
                            if (window.caches) {
                                caches.keys().then(names => {
                                    for (let name of names) caches.delete(name);
                                });
                            }
                            
                            localStorage.setItem('app_build', config.minBuild);
                            
                            // Reload with cache busting
                            window.location.reload(true);
                        }
                    }
                });
                const params = new URLSearchParams(window.location.search);
                const joinId = params.get('join');
                if (joinId) await app.handleJoinLink(joinId);
                else await app.loadGuild();
            } else {
                app.showView('welcome-screen');
            }
        });
    },

    async handleJoinLink(id) {
        app.showLoading(true);
        try {
            const result = await db.joinGuild(id, auth.user.email);
            if (result.success) {
                localStorage.setItem('currentGuildId', id);
                window.history.replaceState({}, document.title, window.location.pathname);
                app.hideModals();
                if (!result.alreadyMember) alert("🛡️ Bienvenue !");
                await app.loadGuild();
            } else {
                alert("❌ Erreur : " + result.error);
                await app.loadGuild();
            }
        } catch (err) { console.error(err); await app.loadGuild(); }
    },

    async loadGuild() {
        app.showLoading(true); 
        try {
            let savedId = localStorage.getItem('currentGuildId');
            const guilds = await db.getAvailableGuilds(auth.user.email);
            if (guilds.length > 0) {
                const targetGuild = guilds.find(g => g.id === savedId) || guilds[0];
                app.guildId = targetGuild.id;
                localStorage.setItem('currentGuildId', app.guildId);
                db.listenToGuild(app.guildId, (data) => {
                    const indicator = document.getElementById('sync-indicator');
                    if (indicator) indicator.classList.add('syncing');
                    app.data = data;
                    app.handleDataUpdate();
                    app.showLoading(false);
                    setTimeout(() => { if (indicator) indicator.classList.remove('syncing'); }, 1000);
                });
            } else {
                app.showView('entry-choice-screen');
                app.showLoading(false);
            }
        } catch (err) { console.error("Load Error:", err); app.showLoading(false); }
    },

    isAdmin() {
        if (!app.data || !app.data.meta || !app.mainUser) return false;
        const isMainAdmin = app.data.meta.owner === auth.user.email || auth.user && auth.user.email === 'yohann.gras@gmail.com';
        const isImpersonating = app.currentUser && app.mainUser && app.currentUser.id !== app.mainUser.id;
        return isMainAdmin && !isImpersonating;
    },

    handleDataUpdate() {
        app.watchForToasts();
        if (!app.data || !app.data.users) return;

        app.mainUser = app.data.users.find(u => u.email === auth.user.email);
        
        if (!app.mainUser) {
            app.currentUser = null;
            const onboardName = document.getElementById('new-user-name');
            if (onboardName) onboardName.value = auth.user.displayName || "";
            app.showView('content'); app.showModal('onboarding-modal');
            return;
        }

        const impersonatedId = localStorage.getItem('impersonatedHeroId');
        app.currentUser = impersonatedId ? (app.data.users.find(u => u.id === impersonatedId) || app.mainUser) : app.mainUser;

        app.checkDeadlines();

        // Migration/Initialization for new features
        if (!app.data.currency) app.data.currency = { name: "Écus", symbol: "🪙" };
        if (!app.data.ranks) app.data.ranks = [
            { minLevel: 1, title: "Roturier" }, { minLevel: 5, title: "Écuyer" },
            { minLevel: 10, title: "Chevalier" }, { minLevel: 20, title: "Héros" }, { minLevel: 50, title: "Légende" }
        ];
        if (!app.data.market) app.data.market = [
            { id: 'royal_bounty', title: 'Mission Royale', cost: 0, description: 'Quête spéciale créée par le chef de guilde.', icon: '👑', isSpecial: true }
        ];
        app.data.users.forEach(u => {
            if (u.gold === undefined) u.gold = 0;
            if (u.inventory === undefined) u.inventory = [];
        });

        if (app.isAdmin()) {
            if (!sessionStorage.getItem('system_version_pushed')) {
                db.setSystemConfig(104); 
                sessionStorage.setItem('system_version_pushed', 'true');
            }
        }
        
        app.showView('content');
        app.syncSettingsUI();
        app.render();
    },

    showView(viewId) {
        ['welcome-screen', 'entry-choice-screen', 'content'].forEach(v => {
            const el = document.getElementById(v);
            if (el) el.classList.toggle('hidden', v !== viewId);
        });
    },

    async save() { if (app.guildId && app.data) await db.updateGuild(app.guildId, app.data); },

    askConfirm(message, callback) {
        app._pendingAction = callback;
        const msgEl = document.getElementById('confirm-message');
        if (msgEl) msgEl.innerText = message;
        app.showModal('confirm-modal');
        const btn = document.getElementById('confirm-yes-btn');
        if (btn) btn.onclick = () => { if (app._pendingAction) app._pendingAction(); app.hideModals(); app._pendingAction = null; };
    },

    // --- Avatar ---
    getAvatarHtml(avatarStr, size = "40px") {
        if (!avatarStr || !avatarStr.startsWith('http')) {
            const seed = (app.currentUser ? app.currentUser.name : 'Hero');
            const fallback = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
            if (avatarStr && avatarStr.length <= 8) return `<div style="width:${size}; height:${size}; display:flex; align-items:center; justify-content:center; font-size:calc(${size} * 0.5); font-weight:bold; color:rgba(255,255,255,0.5);">${avatarStr}</div>`;
            avatarStr = fallback;
        }
        return `<img src="${avatarStr}" alt="Avatar" style="width:${size}; height:${size}; border-radius:50%; display:block; object-fit:cover; border: 1px solid rgba(255,255,255,0.1);">`;
    },

    setAvatarStyle(style, prefix = 'edit') {
        app.currentAvatarStyle = style;
        document.querySelectorAll(`#${prefix}-avatar-preview ~ .style-selector .style-btn`).forEach(btn => btn.classList.toggle('active', btn.innerText.toLowerCase().includes(style.slice(0,3))));
        app.updateAvatarPreview(prefix, true);
    },

    updateAvatarPreview(prefix = 'edit', forceSave = false) {
        const seedInput = document.getElementById(`${prefix}-avatar-seed`);
        const seed = (seedInput && seedInput.value) ? seedInput.value : (app.currentUser?.name || auth.user?.displayName || 'Quest');
        const url = `https://api.dicebear.com/7.x/${app.currentAvatarStyle}/svg?seed=${encodeURIComponent(seed)}`;
        const preview = document.getElementById(`${prefix}-avatar-preview`);
        if (preview) preview.innerHTML = `<img src="${url}" alt="Preview" style="width:100%; height:100%; object-fit:cover;">`;
        if (prefix === 'edit' && app.currentUser && forceSave) { app.currentUser.avatar = url; app.save(); }
    },

    randomAvatar() {
        const rand = Math.random().toString(36).substring(7);
        const el = document.getElementById('edit-avatar-seed'); if (el) el.value = rand;
        app.updateAvatarPreview('edit', true);
    },

    // --- Hero Management ---
    async addSquire() {
        const name = document.getElementById('squire-name').value;
        const seed = document.getElementById('squire-avatar-seed').value || name;
        if (!name) return;
        app.data.users.push({ id: 'sq_'+Date.now(), name, avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`, xp: 0, level: 1, managedBy: app.mainUser.id });
        await app.save(); app.hideModals();
    },

    impersonate(heroId) { localStorage.setItem('impersonatedHeroId', heroId); window.location.reload(); },
    stopImpersonating() { localStorage.removeItem('impersonatedHeroId'); window.location.reload(); },
    rotateUser() {
        if (!app.data || !app.mainUser) return;
        const squires = app.data.users.filter(u => u.managedBy === app.mainUser.id);
        const rotationList = [app.mainUser, ...squires];
        const currentIndex = rotationList.findIndex(u => u.id === app.currentUser.id);
        const nextUser = rotationList[(currentIndex + 1) % rotationList.length];
        if (nextUser.id === app.mainUser.id) app.stopImpersonating(); else app.impersonate(nextUser.id);
    },

    async finishOnboarding() {
        const nameInput = document.getElementById('new-user-name');
        const name = nameInput ? nameInput.value : '';
        const seed = document.getElementById('onboard-avatar-seed').value || name;
        if (!name) return alert("Nom requis !");
        app.data.users.push({ id: 'u_'+Date.now(), name, avatar: `https://api.dicebear.com/7.x/${app.currentAvatarStyle}/svg?seed=${encodeURIComponent(seed)}`, email: auth.user.email, xp: 0, level: 1 });
        await app.save(); app.hideModals();
    },

    // --- Actions ---
    async claimQuest(instanceId) {
        const quest = app.data.activeQuests.find(q => q.id === instanceId);
        if (!quest) return;
        
        const isSteal = quest.assignedTo && quest.assignedTo !== app.currentUser.id;
        quest.assignedTo = app.currentUser.id;
        
        if (isSteal) {
            quest.stealDeadline = Date.now() + 15 * 60 * 1000;
            app.data.questLog.unshift({ id: 'log_steal_'+Date.now(), type: 'system', title: `Quête VOLÉE : ${quest.title}`, completedBy: app.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });
        } else {
            delete quest.stealDeadline;
            app.data.questLog.unshift({ id: 'log_cl_'+Date.now(), type: 'system', title: `Quête acceptée : ${quest.title}`, completedBy: app.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });
        }
        
        await app.save();
    },

    checkDeadlines() {
        if (!app.data || !app.data.activeQuests) return;
        let changed = false;
        const now = Date.now();
        app.data.activeQuests.forEach(q => {
            if (q.stealDeadline && now > q.stealDeadline) {
                const oldAssignee = q.assignedTo;
                q.assignedTo = null; // Retour au pot commun
                delete q.stealDeadline;
                app.data.questLog.unshift({ id: 'log_fail_'+Date.now(), type: 'system', title: `Échec du vol (temps écoulé) : ${q.title}`, completedBy: oldAssignee, completedAt: new Date().toISOString(), xpEarned: 0 });
                changed = true;
            }
        });
        if (changed) app.save();
    },

    async unclaimQuest(instanceId) {
        const quest = app.data.activeQuests.find(q => q.id === instanceId);
        if (!quest) return;
        
        const def = app.data.questDefinitions.find(d => d.id === q.definitionId);
        if (def && def.defaultAssignee) return alert("Désolé, tu ne peux pas abandonner un ordre direct !");

        const oldTitle = quest.title;
        quest.assignedTo = null; 
        delete quest.stealDeadline;
        app.data.questLog.unshift({ id: 'log_un_'+Date.now(), type: 'system', title: `Quête abandonnée : ${oldTitle}`, completedBy: app.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });
        await app.save();
    },

    async completeTask(instanceId) {
        const index = app.data.activeQuests.findIndex(q => q.id === instanceId);
        if (index === -1) return;
        const quest = app.data.activeQuests[index];
        const def = app.data.questDefinitions.find(d => d.id === quest.definitionId);
        
        // Calcul du bonus de niveau (1% par niveau)
        const userLevel = app.currentUser.level || 1;
        const bonusMultiplier = 1 + (userLevel / 100);
        
        const earnedXp = Math.ceil(parseInt(quest.xp || 0) * bonusMultiplier);
        const earnedGold = Math.ceil(parseInt(quest.gold || 0) * bonusMultiplier);

        app.currentUser.xp += earnedXp;
        app.currentUser.gold = (app.currentUser.gold || 0) + earnedGold;

        const xpNeeded = (app.currentUser.level || 1) * 100;
        if (app.currentUser.xp >= xpNeeded) {
            app.currentUser.level = (app.currentUser.level || 1) + 1;
            app.currentUser.xp -= (app.currentUser.level - 1) * 100;
            alert(`🎊 LEVEL UP! ${app.currentUser.name} est Niveau ${app.currentUser.level} !`);
        }
        
        app.data.questLog.unshift({ 
            id: 'log_'+Date.now(), 
            type: 'completion', 
            title: quest.title, 
            completedBy: app.currentUser.id, 
            completedAt: new Date().toISOString(), 
            xpEarned: earnedXp,
            goldEarned: earnedGold,
            instanceId: instanceId, 
            definitionId: quest.definitionId 
        });
        
        if (app.data.questLog.length > 50) app.data.questLog.pop();
        if (def && def.frequency && def.frequency !== 'none') {
            quest.dueDate = app.calculateNextDueDate(def, new Date(quest.dueDate)).toISOString();
            quest.assignedTo = def.defaultAssignee || null;
            delete quest.stealDeadline;
        } else app.data.activeQuests.splice(index, 1);
        await app.save();
    },

    isStealable(q) {
        if (!q.assignedTo || q.assignedTo === app.currentUser.id) return false;
        
        // Protection du voleur pendant 15min
        if (q.stealDeadline && Date.now() < q.stealDeadline) return false;

        const now = new Date();
        const due = new Date(q.dueDate);
        const def = app.data.questDefinitions.find(d => d.id === q.definitionId);
        const isOneTime = !def || def.frequency === 'none';

        if (isOneTime && !q.dueDate && (!q.timeSlot || !q.timeSlot.end)) return false;

        if (q.timeSlot && q.timeSlot.end) {
            const [h, m] = q.timeSlot.end.split(':');
            due.setHours(parseInt(h), parseInt(m), 0, 0);
        } else {
            due.setHours(23, 59, 59, 999);
        }

        return now > due;
    },

    updateTimeEnablement(prefix) {
        const freq = document.getElementById(`${prefix}-frequency`).value;
        const dateVal = document.getElementById(`${prefix}-date`).value;
        const start = document.getElementById(`${prefix}-time-start`);
        const end = document.getElementById(`${prefix}-time-end`);
        
        if (freq === 'none') {
            const hasDate = !!dateVal;
            start.disabled = !hasDate;
            end.disabled = !hasDate;
            if (!hasDate) { start.value = ''; end.value = ''; }
        } else {
            start.disabled = false;
            end.disabled = false;
        }
    },

    async addQuest() {
        const titleEl = document.getElementById('quest-title');
        const xpEl = document.getElementById('quest-difficulty');
        const goldEl = document.getElementById('quest-gold');
        const freqEl = document.getElementById('quest-frequency');
        const dateEl = document.getElementById('quest-date');
        const assigneeEl = document.getElementById('quest-assignee');
        
        if (!titleEl || !xpEl) return;

        const title = titleEl.value;
        const xp = parseInt(xpEl.value);
        const gold = parseInt(goldEl ? goldEl.value : 0) || 0;
        const freq = freqEl ? freqEl.value : 'none';
        const assignee = assigneeEl ? assigneeEl.value : null;
        
        const tStart = document.getElementById('quest-time-start').value;
        const tEnd = document.getElementById('quest-time-end').value;
        const days = Array.from(document.querySelectorAll('input[name="quest-day"]:checked')).map(cb => cb.value);
        
        if (!title || isNaN(xp)) return;

        const defId = 'def_'+Date.now();
        const timeSlot = (tStart || tEnd) ? { start: tStart, end: tEnd } : null;
        
        // Calcul de la première date
        let dueDate = null;
        if (freq === 'none') {
            dueDate = dateEl.value ? new Date(dateEl.value).toISOString() : null;
        } else {
            const def = { frequency: freq, days, interval: 1 };
            dueDate = app.calculateFirstDueDate(def).toISOString();
        }

        const def = { id: defId, title, baseXp: xp, baseGold: gold, frequency: freq, interval: 1, days, timeSlot, defaultAssignee: assignee, isRoyal: false };
        app.data.questDefinitions.push(def);
        app.data.activeQuests.push({ id: 'inst_'+Date.now(), definitionId: defId, title, xp, gold, dueDate, timeSlot, assignedTo: assignee, isRoyal: false });
        await app.save(); app.hideModals();
    },

    openEditQuestModal(instanceId) {
        if (!app.isAdmin()) return;
        const realId = instanceId.replace('virtual_', '');
        let quest = app.data.activeQuests.find(q => q.id === realId);
        let defId = quest ? quest.definitionId : realId;
        const def = app.data.questDefinitions.find(d => d.id === defId);
        if (!def) return;
        
        // Don't open standard edit for Royal Missions from board if you want them special, 
        // but for now let's just populate.
        
        document.getElementById('edit-quest-id').value = def.id; 
        document.getElementById('edit-quest-title').value = def.title;
        document.getElementById('edit-quest-difficulty').value = def.baseXp;
        document.getElementById('edit-quest-gold').value = def.baseGold || 0;
        document.getElementById('edit-quest-frequency').value = def.frequency || 'none';
        const elAssignee = document.getElementById('edit-quest-assignee'); if (elAssignee) elAssignee.value = def.defaultAssignee || '';
        if (def.timeSlot) { document.getElementById('edit-quest-time-start').value = def.timeSlot.start; document.getElementById('edit-quest-time-end').value = def.timeSlot.end; }
        else { document.getElementById('edit-quest-time-start').value = ''; document.getElementById('edit-quest-time-end').value = ''; }
        const days = def.days || []; document.querySelectorAll('input[name="edit-quest-day"]').forEach(cb => cb.checked = days.includes(cb.value));
        document.getElementById('edit-quest-interval').value = def.interval || 1;
        
        // Update labels
        document.querySelectorAll('.currency-name-label').forEach(el => el.innerText = app.data.currency.name);

        app.toggleRecurrenceUI('edit-quest'); app.showModal('edit-quest-modal');
    },

    async saveQuestEdits() {
        app.askConfirm("Sauvegarder ?", async () => {
            const defId = document.getElementById('edit-quest-id').value;
            const title = document.getElementById('edit-quest-title').value;
            const xp = parseInt(document.getElementById('edit-quest-difficulty').value);
            const gold = parseInt(document.getElementById('edit-quest-gold').value || 0);
            const freq = document.getElementById('edit-quest-frequency').value;
            const interval = document.getElementById('edit-quest-interval').value;
            const assignee = document.getElementById('edit-quest-assignee').value || null;
            const tStart = document.getElementById('edit-quest-time-start').value;
            const tEnd = document.getElementById('edit-quest-time-end').value;
            const days = Array.from(document.querySelectorAll('input[name="edit-quest-day"]:checked')).map(cb => cb.value);
            if (!title || isNaN(xp)) return;
            const defIdx = app.data.questDefinitions.findIndex(d => d.id === defId); if (defIdx === -1) return;
            const oldDef = app.data.questDefinitions[defIdx];
            const timeSlot = (tStart && tEnd) ? { start: tStart, end: tEnd } : null;
            const changed = oldDef.frequency !== freq || JSON.stringify(oldDef.days) !== JSON.stringify(days) || oldDef.interval !== interval;
            app.data.questDefinitions[defIdx] = { ...oldDef, title, baseXp: xp, baseGold: gold, frequency: freq, interval, days, timeSlot, defaultAssignee: assignee };
            app.data.activeQuests.forEach(q => { if (q.definitionId === defId) { q.title = title; q.xp = xp; q.gold = gold; q.timeSlot = timeSlot; if (changed) q.dueDate = app.calculateFirstDueDate(app.data.questDefinitions[defIdx]).toISOString(); if (!q.assignedTo || q.assignedTo === oldDef.defaultAssignee) q.assignedTo = assignee; } });
            await app.save(); app.hideModals();
        });
    },

    async archiveQuest() {
        app.askConfirm("Supprimer ?", async () => {
            const defId = document.getElementById('edit-quest-id').value;
            const def = app.data.questDefinitions.find(d => d.id === defId); if (def) def.archived = true;
            app.data.activeQuests = app.data.activeQuests.filter(q => q.definitionId !== defId);
            await app.save(); app.hideModals();
        });
    },

    async undoLog(logId) {
        if (!app.isAdmin()) return;
        app.askConfirm("Annuler ?", async () => {
            const idx = app.data.questLog.findIndex(l => l.id === logId); if (idx === -1) return;
            const log = app.data.questLog[idx]; const user = app.data.users.find(u => u.id === log.completedBy);
            if (user) { 
                user.xp -= log.xpEarned; 
                user.gold = (user.gold || 0) - (log.goldEarned || 0);
                if (user.xp < 0 && user.level > 1) { user.level--; user.xp += (user.level * 100); } else if (user.xp < 0) user.xp = 0; 
            }
            const quest = app.data.activeQuests.find(q => q.definitionId === log.definitionId);
            if (quest) quest.dueDate = new Date(0).toISOString(); else if (log.type === 'completion') app.data.activeQuests.push({ id: log.instanceId, definitionId: log.definitionId, title: log.title, xp: log.xpEarned, dueDate: new Date(0).toISOString() });
            app.data.questLog.splice(idx, 1);
            app.data.questLog.unshift({ id: 'log_undo_'+Date.now(), type: 'system', title: `Annulation : ${log.title}`, completedBy: app.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });
            await app.save();
        });
    },

    // --- Marché & Économie ---
    renderMarket() {
        const marketList = document.getElementById('market-list');
        if (!marketList) return;
        
        marketList.innerHTML = app.data.market.map(item => {
            const isOut = item.stock === 0;
            const canAfford = app.currentUser.gold >= item.cost;
            const isAdmin = app.isAdmin();
            
            let actionBtn = '';
            if (item.isSpecial) {
                actionBtn = `<button class="action-btn" onclick="app.openRoyalMissionModal()" style="background:linear-gradient(135deg, #d97706, #78350f); color:white; border:1px solid #fcd34d;">👑 Proposer</button>`;
            } else {
                actionBtn = `<button class="action-btn" onclick="app.buyItem('${item.id}')" ${(!canAfford || isOut) ? 'disabled' : ''}>Acheter</button>`;
            }

            const editBtn = (isAdmin && !item.isSpecial) ? `<button class="icon-btn" onclick="event.stopPropagation(); app.openEditMarketItemModal('${item.id}')" title="Modifier">✏️</button>` : '';

            return `
                <div class="market-item ${isOut ? 'sold-out' : ''}">
                    <div class="market-item-icon">${item.icon || '🎁'}</div>
                    <div class="market-item-info">
                        <h4>${item.title}</h4>
                        <p>${item.description || ''}</p>
                        <div class="market-item-price">
                            ${item.cost} ${app.data.currency.symbol}
                        </div>
                    </div>
                    <div class="market-item-actions">
                        ${actionBtn}
                        ${editBtn}
                    </div>
                    ${item.stock > 0 ? `<div class="market-item-stock">Stock: ${item.stock}</div>` : ''}
                </div>
            `;
        }).join('');

        app.renderInventory();
    },

    renderInventory() {
        const invList = document.getElementById('inventory-list');
        if (!invList) return;
        const inv = app.currentUser.inventory || [];
        if (inv.length === 0) {
            invList.innerHTML = '<p style="opacity:0.5; font-size:0.8rem;">Ton inventaire est vide.</p>';
            return;
        }
        
        invList.innerHTML = inv.map((item, idx) => {
            const fullItem = app.data.market.find(m => m.id === item.id) || { title: item.title, icon: item.icon };
            return `
                <div class="inventory-item">
                    <span class="inventory-item-icon">${fullItem.icon || '📦'}</span>
                    <div class="inventory-item-name">${fullItem.title}</div>
                    <button class="use-btn" onclick="app.useItem(${idx})">Utiliser</button>
                </div>
            `;
        }).join('');
    },

    async addMarketItem() {
        if (!app.isAdmin()) return;
        const title = document.getElementById('market-item-title').value;
        const desc = document.getElementById('market-item-desc').value;
        const cost = parseInt(document.getElementById('market-item-cost').value);
        const icon = document.getElementById('market-item-icon').value || '🎁';
        const stock = parseInt(document.getElementById('market-item-stock').value);
        
        if (!title || isNaN(cost)) return;
        
        app.data.market.push({
            id: 'item_' + Date.now(),
            title, description: desc, cost, icon, stock
        });
        
        await app.save();
        app.hideModals();
        app.renderMarket();
    },

    async removeMarketItem(id) {
        if (!confirm("Supprimer cet article ?")) return;
        app.data.market = app.data.market.filter(i => i.id !== id);
        await app.save();
        app.renderMarket();
    },

    async buyItem(itemId) {
        const item = app.data.market.find(i => i.id === itemId);
        if (!item) return;
        if (app.currentUser.gold < item.cost) return alert("Pas assez de monnaie !");
        
        app.askConfirm(`Acheter ${item.title} pour ${item.cost} ${app.data.currency.symbol} ?`, async () => {
            app.currentUser.gold -= item.cost;
            if (item.stock > 0) item.stock--;
            
            if (!app.currentUser.inventory) app.currentUser.inventory = [];
            app.currentUser.inventory.push({ id: item.id, title: item.title, icon: item.icon, boughtAt: new Date().toISOString() });
            
            app.data.questLog.unshift({ 
                id: 'log_buy_'+Date.now(), 
                type: 'system', 
                title: `Achat : ${item.title}`, 
                completedBy: app.currentUser.id, 
                completedAt: new Date().toISOString(), 
                xpEarned: 0 
            });
            
            await app.save();
            app.render();
            app.renderMarket();
        });
    },

    async useItem(index) {
        const item = app.currentUser.inventory[index];
        app.askConfirm(`Utiliser ${item.title} ? (Cela préviendra le chef de guilde)`, async () => {
            app.data.questLog.unshift({ 
                id: 'log_use_'+Date.now(), 
                type: 'system', 
                title: `Objet utilisé : ${item.title}`, 
                completedBy: app.currentUser.id, 
                completedAt: new Date().toISOString(), 
                xpEarned: 0 
            });
            app.currentUser.inventory.splice(index, 1);
            await app.save();
            app.render();
        });
    },

    async updateGuildEconomy() {
        if (!app.isAdmin()) return;
        app.data.currency.name = document.getElementById('guild-currency-name').value || "Écus";
        app.data.currency.symbol = document.getElementById('guild-currency-symbol').value;
        await app.save();
        app.render();
    },

    renderGuildRanks() {
        const container = document.getElementById('guild-ranks-list');
        if (!container) return;
        const ranks = app.data.ranks || [];
        ranks.sort((a,b) => a.minLevel - b.minLevel);
        const isAdmin = app.isAdmin();
        
        container.innerHTML = ranks.map((r, idx) => `
            <div style="display:grid; grid-template-columns: 50px 1fr 40px; gap:5px; margin-bottom:5px; align-items:center;">
                <input type="number" value="${r.minLevel}" onchange="app.updateRank(${idx}, 'minLevel', this.value)" style="padding:2px; font-size:0.7rem;" ${!isAdmin ? 'disabled' : ''}>
                <input type="text" value="${r.title}" onchange="app.updateRank(${idx}, 'title', this.value)" style="padding:2px; font-size:0.7rem;" ${!isAdmin ? 'disabled' : ''}>
                ${isAdmin ? `<button onclick="app.removeRank(${idx})" style="background:none; border:none; cursor:pointer;">❌</button>` : ''}
            </div>
        `).join('');
    },

    updateRank(idx, field, value) {
        if (!app.isAdmin()) return;
        app.data.ranks[idx][field] = field === 'minLevel' ? parseInt(value) : value;
        app.save();
    },

    removeRank(idx) {
        if (!app.isAdmin()) return;
        app.data.ranks.splice(idx, 1);
        app.save();
        app.renderGuildRanks();
    },

    addRankRow() {
        if (!app.isAdmin()) return;
        if (!app.data.ranks) app.data.ranks = [];
        app.data.ranks.push({ minLevel: 1, title: "Nouveau Rang" });
        app.renderGuildRanks();
    },

    getRank(level) {
        if (!app.data.ranks) return "Héros";
        const sorted = [...app.data.ranks].sort((a,b) => b.minLevel - a.minLevel);
        const rank = sorted.find(r => level >= r.minLevel);
        return rank ? rank.title : "Héros";
    },

    // --- Market Item Management ---
    openEditMarketItemModal(itemId) {
        if (!app.isAdmin()) return;
        const item = app.data.market.find(i => i.id === itemId);
        if (!item || item.isSpecial) return; // Special items like Royal Mission are not editable here

        document.getElementById('edit-market-item-id').value = item.id;
        document.getElementById('edit-market-item-title').value = item.title;
        document.getElementById('edit-market-item-desc').value = item.description || '';
        document.getElementById('edit-market-item-cost').value = item.cost;
        document.getElementById('edit-market-item-icon').value = item.icon || '';
        document.getElementById('edit-market-item-stock').value = item.stock;
        
        app.showModal('edit-market-item-modal');
    },

    async saveMarketItemEdits() {
        if (!app.isAdmin()) return;
        const id = document.getElementById('edit-market-item-id').value;
        const title = document.getElementById('edit-market-item-title').value;
        const desc = document.getElementById('edit-market-item-desc').value;
        const cost = parseInt(document.getElementById('edit-market-item-cost').value);
        const icon = document.getElementById('edit-market-item-icon');
        const stock = parseInt(document.getElementById('edit-market-item-stock').value);

        if (!title || isNaN(cost)) return;

        const idx = app.data.market.findIndex(i => i.id === id);
        if (idx !== -1) {
            app.data.market[idx] = { ...app.data.market[idx], title, description: desc, cost, icon: icon ? icon.value : '', stock };
            await app.save();
            app.hideModals();
            app.renderMarket();
        }
    },

    async deleteMarketItem() {
        if (!app.isAdmin()) return;
        if (!confirm("Supprimer définitivement cet article ?")) return;
        const id = document.getElementById('edit-market-item-id').value;
        app.data.market = app.data.market.filter(i => i.id !== id);
        await app.save();
        app.hideModals();
        app.renderMarket();
    },

    // --- Renders ---
    render() {
        if (!app.currentUser) return;
        const isSquire = app.currentUser.id !== app.mainUser.id;
        document.getElementById('user-name').innerText = (isSquire ? '📜 ' : '') + app.currentUser.name;
        document.getElementById('user-avatar-display').innerHTML = app.getAvatarHtml(app.currentUser.avatar, "80px");
        document.getElementById('user-level').innerText = app.currentUser.level || 1;
        document.getElementById('user-rank').innerText = app.getRank(app.currentUser.level || 1);
        document.getElementById('user-xp').innerText = app.currentUser.xp;
        
        const goldEl = document.getElementById('user-currency-amount');
        if (goldEl) goldEl.innerText = app.currentUser.gold || 0;
        const symbolEl = document.getElementById('user-currency-symbol');
        if (symbolEl) symbolEl.innerText = app.data.currency.symbol;

        const xpNeeded = (app.currentUser.level || 1) * 100;
        document.getElementById('next-level-xp').innerText = xpNeeded;
        document.getElementById('xp-progress').style.width = `${(app.currentUser.xp / xpNeeded) * 100}%`;
        const profBtn = document.getElementById('profile-btn'); if (profBtn) profBtn.innerHTML = app.getAvatarHtml(app.currentUser.avatar, "40px");
        const squires = app.data.users.filter(u => u.managedBy === app.mainUser.id);
        const switchBtn = document.getElementById('quick-switch-btn');
        if (switchBtn) {
            if (squires.length > 0) {
                switchBtn.classList.remove('hidden'); const rotationList = [app.mainUser, ...squires]; const currentIndex = rotationList.findIndex(u => u.id === app.currentUser.id); const nextUser = rotationList[(currentIndex + 1) % rotationList.length]; switchBtn.innerHTML = app.getAvatarHtml(nextUser.avatar, "26px");
            } else switchBtn.classList.add('hidden');
        }
        
        if (app.currentView === 'board') { 
            document.getElementById('quest-board').classList.remove('hidden'); 
            document.getElementById('market-board').classList.add('hidden');
            document.getElementById('history-board').classList.add('hidden'); 
            app.renderBoard(); 
        } else if (app.currentView === 'market') {
            document.getElementById('quest-board').classList.add('hidden');
            document.getElementById('market-board').classList.remove('hidden');
            document.getElementById('history-board').classList.add('hidden');
            app.renderMarket();
        } else { 
            document.getElementById('quest-board').classList.add('hidden'); 
            document.getElementById('market-board').classList.add('hidden');
            document.getElementById('history-board').classList.remove('hidden'); 
            app.renderHistory(); 
        }
    },

    renderBoard() {
        if (!app.data || !app.data.activeQuests) return;
        const now = new Date(); 
        const endOfToday = new Date(now); endOfToday.setHours(23,59,59,999);
        
        const active = app.data.activeQuests.filter(q => {
            if (!q.dueDate) return true;
            const due = new Date(q.dueDate);
            if (due > endOfToday) return false;
            
            // Si c'est aujourd'hui, vérifier l'heure de début
            if (due.toDateString() === now.toDateString() && q.timeSlot && q.timeSlot.start) {
                const [h, m] = q.timeSlot.start.split(':');
                const startTime = new Date(now);
                startTime.setHours(parseInt(h), parseInt(m), 0, 0);
                return now >= startTime;
            }
            return true;
        });

        let upcoming = app.data.activeQuests.filter(q => !active.includes(q));
        
        active.forEach(q => { 
            const def = app.data.questDefinitions.find(d => d.id === q.definitionId); 
            if (def && def.frequency && def.frequency !== 'none') {
                upcoming.push({ ...q, id: 'virtual_' + q.id, dueDate: app.calculateNextDueDate(def, new Date(q.dueDate)).toISOString(), isVirtual: true }); 
            }
        });
        
        upcoming.sort((a,b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
        
        const html = (q, up) => {
            const isRoyal = q.isRoyal;
            const rarity = isRoyal ? 'rarity-legendary royal-quest' : app.getQuestRarity(q.xp);
            const def = app.data.questDefinitions.find(d => d.id === q.definitionId);
            const freq = (def && def.frequency !== 'none') ? '🔄' : '';
            const time = q.timeSlot ? ` • 🕒 ${q.timeSlot.start || ''}${q.timeSlot.end ? '-' + q.timeSlot.end : ''}` : '';
            
            let timerHtml = '';
            if (q.stealDeadline) {
                const mins = Math.ceil((q.stealDeadline - Date.now()) / 60000);
                timerHtml = mins > 0 ? ` <span style="color:#e94560; font-weight:bold; font-size:0.7rem; background:rgba(233,69,96,0.1); padding:2px 5px; border-radius:4px; margin-left:5px;">⏳ ${mins}m</span>` : '';
            }

            const assignee = app.data.users.find(u => u.id === q.assignedTo);
            const assigneeHtml = `<div class="assignee-badge ${!assignee ? 'empty' : ''}">${app.getAvatarHtml(assignee ? assignee.avatar : '?', "36px")}</div>`;
            const isMe = q.assignedTo === app.currentUser.id; const isNobody = !q.assignedTo; const isStealable = !up && app.isStealable(q);
            
            let actionButtons = '';
            if (!up) {
                const def = app.data.questDefinitions.find(d => d.id === q.definitionId);
                const isMandatory = def && def.defaultAssignee;

                if (isMe || isNobody) actionButtons += `<button class="quest-action-btn btn-complete" onclick="event.stopPropagation(); app.askConfirm('Terminer ?', () => app.completeTask('${q.id}'))" title="Valider">✅</button>`;
                
                if (isMe && !isMandatory) actionButtons += `<button class="quest-action-btn btn-abandon" onclick="event.stopPropagation(); app.askConfirm('Abandonner ?', () => app.unclaimQuest('${q.id}'))" title="Abandonner">❌</button>`;
                else if (isNobody) actionButtons += `<button class="quest-action-btn btn-claim" onclick="event.stopPropagation(); app.askConfirm('Prendre ?', () => app.claimQuest('${q.id}'))" title="☝️ Je prends">☝️</button>`;
                else if (isStealable) actionButtons += `<button class="quest-action-btn btn-steal" onclick="event.stopPropagation(); app.askConfirm('🥷 VOLER ?', () => app.claimQuest('${q.id}'))" title="🥷 Voler">🥷</button>`;
            }
            const canEdit = app.isAdmin();
            return `<div class="quest-card ${rarity} ${up ? 'upcoming' : ''}"><div class="quest-body" ${canEdit ? `onclick="app.openEditQuestModal('${q.id}')" style="cursor:pointer"` : ''}>${assigneeHtml}<div class="quest-info"><h4>${freq} ${q.title}${timerHtml}</h4><span>💰 ${q.xp} XP${q.gold ? ' • ' + app.data.currency.symbol + ' ' + q.gold : ''}${time}</span></div></div><div class="quest-actions-container">${actionButtons}</div></div>`;
        };
        document.getElementById('task-list').innerHTML = active.map(q => html(q, false)).join('') || '<p style="text-align:center; opacity:0.5;">Tout est fait !</p>';
        const groups = {}; upcoming.forEach(q => { 
            const d = q.dueDate ? new Date(q.dueDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Plus tard'; 
            if (!groups[d]) groups[d] = []; groups[d].push(q); 
        });
        document.getElementById('upcoming-task-list').innerHTML = Object.keys(groups).map(day => `<div class="upcoming-day-group"><div class="upcoming-day-title">${day}</div>${groups[day].map(q => html(q, true)).join('')}</div>`).join('') || '<p style="text-align:center; opacity:0.2;">Rien de prévu.</p>';
    },

    renderHistory() {
        const histList = document.getElementById('history-list');
        if (!histList) return;
        histList.innerHTML = app.data.questLog.map(log => {
            const user = app.data.users.find(u => u.id === log.completedBy || u.email === log.completedBy);
            const color = log.type === 'system' ? '#e94560' : '#4a90e2';
            const canUndo = app.isAdmin();
            return `<div class="history-item" style="border-left-color: ${color}"><div style="display:flex; justify-content:space-between; align-items:center;"><div style="display:flex; align-items:center; gap:10px;">${app.getAvatarHtml(user ? user.avatar : '?', "30px")}<div><strong>${log.title}</strong><br><small>${user ? user.name : '??'} • ${new Date(log.completedAt).toLocaleString()}</small></div></div>${(log.type === 'completion' && canUndo) ? `<button class="undo-btn" onclick="app.undoLog('${log.id}')">Annuler</button>` : ''}</div></div>`;
        }).join('');
    },

    watchForToasts() {
        if (!app.data || !app.data.questLog || !app.data.questLog.length) return;
        const latest = app.data.questLog[0];
        if (!app.lastLogId) { app.lastLogId = latest.id; return; }
        if (latest.id !== app.lastLogId) {
            app.lastLogId = latest.id;
            if (latest.completedBy === app.currentUser?.id || latest.completedBy === auth.user.email) return;
            app.showActivityToast(latest);
        }
    },

    showActivityToast(log) {
        const t = document.getElementById('activity-toast');
        const user = app.data.users.find(u => u.id === log.completedBy || u.email === log.completedBy);
        const elAvatar = document.getElementById('toast-avatar');
        if (elAvatar) elAvatar.innerHTML = app.getAvatarHtml(user ? user.avatar : '?', "30px");
        let verb = log.type === 'system' ? "info :" : "a validé";
        if (log.title.includes('Annulation')) verb = "a annulé";
        const msgEl = document.getElementById('toast-message');
        if (msgEl) msgEl.innerText = `${user ? user.name : 'Un membre'} ${verb} : "${log.title}"`;
        if (t) { t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 5000); }
    },

    syncSettingsUI() {
        document.getElementById('edit-guild-name').value = app.data.meta.guildName;
        document.getElementById('edit-guild-public').value = app.data.meta.isPublic.toString();
        document.getElementById('edit-guild-open').value = app.data.meta.isOpen.toString();
        
        // Economy settings
        document.getElementById('guild-currency-name').value = app.data.currency.name;
        document.getElementById('guild-currency-symbol').value = app.data.currency.symbol;
        app.renderGuildRanks();

        app.renderGuildMembers();
        const memberOptions = `<option value="">❓ Pour tous</option>` + app.data.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
        document.getElementById('quest-assignee').innerHTML = memberOptions;
        document.getElementById('edit-quest-assignee').innerHTML = memberOptions;
        document.getElementById('edit-user-name').value = app.currentUser.name;
        app.updateAvatarPreview('edit');
        const squires = app.data.users.filter(u => u.managedBy === app.mainUser.id);
        const impersonatedId = localStorage.getItem('impersonatedHeroId');
        document.getElementById('squire-list').innerHTML = squires.map(s => `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px; border-radius:5px; margin-bottom:5px;"><span>${app.getAvatarHtml(s.avatar, "20px")} <b>${s.name}</b></span>${impersonatedId === s.id ? `<button class="action-btn danger-btn" onclick="app.stopImpersonating()" style="width:auto; padding:2px 8px; font-size:0.7rem;">Quitter</button>` : `<button class="action-btn" onclick="app.impersonate('${s.id}')" style="width:auto; padding:2px 8px; font-size:0.7rem;">Incarner</button>`}</div>`).join('') || '<p style="font-size:0.7rem; opacity:0.5;">Aucun écuyer.</p>';
        
        const isAdmin = app.isAdmin();
        
        // Disable/Hide inputs for non-admins
        const adminInputs = ['edit-guild-name', 'edit-guild-public', 'edit-guild-open', 'guild-currency-name', 'guild-currency-symbol'];
        adminInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !isAdmin;
        });

        // Hide Admin Buttons
        const btnAdmin = document.querySelector('button[onclick*="renderDevMode"]');
        if (btnAdmin) btnAdmin.style.display = isAdmin ? 'block' : 'none';
        
        const btnAddMarket = document.getElementById('add-market-item-btn');
        if (btnAddMarket) btnAddMarket.style.display = isAdmin ? 'block' : 'none';
        
        // Hide Rank Add/Remove buttons for non-admins (handled in renderGuildRanks too)
        const rankBtn = document.querySelector('button[onclick*="addRankRow"]');
        if (rankBtn) rankBtn.style.display = isAdmin ? 'block' : 'none';

        // Update labels
        document.querySelectorAll('.currency-name-label').forEach(el => el.innerText = app.data.currency.name);
    },

    // --- Admin ---
    switchDebugTab(tab) {
        document.querySelectorAll('.debug-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.debug-content').forEach(c => c.classList.add('hidden'));
        const tabBtn = document.querySelector(`.debug-tab[onclick*="${tab}"]`);
        if (tabBtn) tabBtn.classList.add('active');
        const view = document.getElementById(`debug-view-${tab}`);
        if (view) { 
            view.classList.remove('hidden'); 
            if (tab === 'users') app.renderAdminUsersList(view);
            else { let c = {}; if (tab === 'guild') c = app.data.meta; if (tab === 'quests') c = { defs: app.data.questDefinitions, active: app.data.activeQuests }; if (tab === 'logs') c = app.data.questLog.slice(0, 20); view.innerText = JSON.stringify(c, null, 2); }
        }
    },
    
    renderAdminUsersList(container) {
        container.innerHTML = app.data.users.map(u => `
            <div class="admin-user-row">
                <div style="display:flex; align-items:center; gap:5px;">
                    ${app.getAvatarHtml(u.avatar, "30px")}
                    <input type="text" value="${u.name}" id="admin-name-${u.id}" style="width:100px;">
                </div>
                <div>
                    Lvl: <input type="number" value="${u.level || 1}" id="admin-lvl-${u.id}" style="width:40px;">
                    XP: <input type="number" value="${u.xp || 0}" id="admin-xp-${u.id}" style="width:50px;">
                    <button class="action-btn" onclick="app.saveAdminUser('${u.id}')" style="width:auto; padding:5px; font-size:0.7rem; background:#4a90e2;">💾</button>
                </div>
            </div>
        `).join('');
    },

    async saveAdminUser(uid) {
        const u = app.data.users.find(u => u.id === uid);
        if (!u) return;
        u.name = document.getElementById(`admin-name-${uid}`).value;
        u.level = parseInt(document.getElementById(`admin-lvl-${uid}`).value);
        u.xp = parseInt(document.getElementById(`admin-xp-${uid}`).value);
        await app.save();
        alert("Mis à jour !");
    },

    async repairDates() {
        if(!confirm("Forcer le recalcul ?")) return;
        app.data.activeQuests.forEach(q => {
            const def = app.data.questDefinitions.find(d => d.id === q.definitionId);
            if (def && def.frequency && def.frequency !== 'none') {
                const now = new Date(); now.setHours(0,0,0,0);
                if (new Date(q.dueDate) < now) q.dueDate = app.calculateFirstDueDate(def).toISOString();
            }
        });
        await app.save(); alert("Fait !");
    },

    renderDevMode() { 
        app.switchDebugTab('guild');
        const questsView = document.getElementById('debug-view-quests');
        if (questsView && !document.getElementById('repair-btn')) {
            const btn = document.createElement('button');
            btn.id = "repair-btn"; btn.className = "action-btn"; btn.innerText = "🧹 Réparer les Dates";
            btn.onclick = () => app.repairDates();
            questsView.parentNode.insertBefore(btn, questsView);
        }
        app.showModal('dev-modal');
    },

    // --- Utils ---
    toggleRecurrenceUI(prefix) { const elFreq = document.getElementById(`${prefix}-frequency`); if (!elFreq) return; const val = elFreq.value; const intervalContainer = document.getElementById(`${prefix}-interval-container`); const daysSelector = document.getElementById(`${prefix}-days-selector`); if (intervalContainer) intervalContainer.classList.toggle('hidden', val === 'none'); if (daysSelector) daysSelector.classList.toggle('hidden', val !== 'weekly'); },
    renderGuildMembers() { const elList = document.getElementById('guild-members-list'); if (elList) elList.innerHTML = app.data.users.map(u => `<div style="display:flex; gap:10px; margin-bottom:5px;"><span>${app.getAvatarHtml(u.avatar, "20px")}</span><span>${u.name} (Lvl ${u.level || 1})</span></div>`).join(''); },
    updateCurrentUserInfo() { app.currentUser.name = document.getElementById('edit-user-name').value; app.save(); },
    setView(v) { app.currentView = v; document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.id === `tab-${v}`)); app.render(); },
    showLoading(s) { const el = document.getElementById('loading'); if (el) el.classList.toggle('hidden', !s); },
    showModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); },
    hideModals() { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); },
    forceAppReset() { if(confirm('Réinitialiser ?')) { localStorage.clear(); window.location.reload(); } },
    async renameGuild() { 
        if (!app.isAdmin()) return;
        if (!app.data) return; 
        const newName = document.getElementById('edit-guild-name').value; 
        if (!newName) return; 
        app.data.meta.guildName = newName; 
        await app.save(); 
    },
    async openGuildSwitcher() { app.showLoading(true); const guilds = await db.getAvailableGuilds(auth.user.email); app.showLoading(false); const cont = document.getElementById('guild-list-container'); if (cont) cont.innerHTML = guilds.map(g => `<div style="background:${g.id === app.guildId ? '#4a90e2' : '#0f3460'}; padding:10px; margin-bottom:5px; border-radius:5px; cursor:pointer;" onclick="app.switchGuild('${g.id}')"><strong>${g.meta.guildName}</strong></div>`).join(''); app.showModal('guild-switcher-modal'); },
    async searchGuilds() { const qIn = document.getElementById('guild-search-input'); const q = qIn ? qIn.value : ''; if (!q) return; app.showLoading(true); const results = await db.searchPublicGuilds(q); app.showLoading(false); const resEl = document.getElementById('guild-search-results'); if (resEl) resEl.innerHTML = results.length ? results.map(g => `<div style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between; align-items:center;"><span>${g.meta.guildName}</span><button class="action-btn" style="width:auto; padding:5px 10px;" onclick="app.handleJoinLink('${g.id}')">Rejoindre</button></div>`).join('') : "<p>Rien trouvé.</p>"; },
    async copyInviteLink() { const url = `${window.location.origin}${window.location.pathname}?join=${app.guildId}`; await navigator.clipboard.writeText(url); alert("Lien copié !"); },
    switchGuild(id) { localStorage.setItem('currentGuildId', id); window.location.reload(); },
    async toggleGuildPublic() { app.data.meta.isPublic = !app.data.meta.isPublic; await app.save(); app.syncSettingsUI(); },
    async leaveGuild() { if (!confirm("Quitter ?")) return; app.showLoading(true); await db.leaveGuild(app.guildId, auth.user.email); localStorage.removeItem('currentGuildId'); window.location.reload(); },
    async updateGuildSettings() { 
        if (!app.isAdmin()) return;
        if (!app.data) return; 
        app.data.meta.guildName = document.getElementById('edit-guild-name').value; 
        app.data.meta.isPublic = document.getElementById('edit-guild-public').value === 'true'; 
        app.data.meta.isOpen = document.getElementById('edit-guild-open').value === 'true'; 
        await app.save(); 
    },
    getQuestRarity(xp) { const maxXP = Math.max(...app.data.questDefinitions.map(d => d.baseXp), 10); const r = xp / maxXP; if (r >= 0.9) return 'rarity-legendary'; if (r >= 0.7) return 'rarity-epic'; if (r >= 0.4) return 'rarity-rare'; if (r >= 0.2) return 'rarity-uncommon'; return 'rarity-common'; }
};
app.init();