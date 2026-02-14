const app = {
    guildId: null,
    data: null,
    currentUser: null, 
    mainUser: null,    
    currentView: 'board',
    lastLogId: null,
    currentAvatarStyle: 'adventurer',
    _pendingAction: null,
    _expandedStatUserId: null,
    currentTutorialStep: 0,
    tutorialSteps: [
        {
            title: "🏰 Bienvenue, Jeune Héros !",
            body: "ChoreQuest transforme ton quotidien en aventure RPG. Chaque corvée accomplie te rapporte de l'<b>XP</b> pour monter de niveau et de l'<b>Or</b> pour acheter des récompenses.",
            highlight: "#user-profile"
        },
        {
            title: "👤 Forge ton Identité",
            body: "Clique sur ton avatar (en haut à droite ou sur ta fiche) pour personnaliser ton Héros. Choisis ton style et entre un 'mot magique' pour générer ton visage unique.",
            highlight: "#profile-btn",
            action: () => app.setView('board')
        },
        {
            title: "📜 Le Tableau des Quêtes",
            body: "C'est ici que l'aventure commence. Les quêtes avec un <b>'?'</b> sont libres : clique sur <b>'☝️ Je prends'</b> pour t'en charger. Une fois finie, coche la case pour empocher ton butin !",
            highlight: "#task-list",
            action: () => app.setView('board')
        },
        {
            title: "🥷 L'Art du Vol",
            body: "Attention ! Si un membre est en retard, sa tâche devient <b>'Volable'</b>. Clique sur l'icône <b>'🥷'</b> pour la faire à sa place et gagner sa récompense !",
            highlight: ".btn-steal",
            action: () => app.setView('board')
        },
        {
            title: "💰 Le Marché de Guilde",
            body: "Amassé assez d'or ? Va au Marché ! Tu y trouveras des récompenses réelles (ex: Pizza, temps d'écran). Tes achats vont dans ton <b>Inventaire</b>.",
            highlight: "#tab-market",
            action: () => app.setView('market')
        },
        {
            title: "📖 Journal d'Aventure",
            body: "Toutes les actions de la guilde sont inscrites ici. Tu peux voir qui a validé ses quêtes et qui a volé les autres !",
            highlight: "#tab-history",
            action: () => app.setView('history')
        },
        {
            title: "👑 Chef de Guilde",
            body: "En tant que créateur, tu peux gérer les <b>Écuyers</b> (comptes enfants) dans ton profil pour qu'ils jouent sans email !",
            highlight: "#guild-btn",
            condition: () => app.isAdmin(),
            action: () => app.setView('board')
        }
    ],

    async init() {
        console.log("🛡️ ChoreQuest Build 139 starting...");
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
        if (!app.data || !app.data.meta || !app.mainUser || !app.currentUser) return false;
        
        // Super-Admin override
        if (auth.user && auth.user.email === 'yohann.gras@gmail.com') return true;

        const isImpersonating = app.currentUser.id !== app.mainUser.id;
        if (isImpersonating) return false;

        const ownerEmail = app.data.meta.owner;
        const ownerId = app.data.meta.createdBy;
        const admins = app.data.meta.admins || []; // Array of User IDs or Emails

        // Check if user is Owner (by email or ID)
        if (auth.user.email === ownerEmail || app.mainUser.id === ownerId) return true;

        // Check if user is in Admins list
        if (admins.includes(app.mainUser.id) || admins.includes(app.mainUser.email)) return true;

        return false;
    },

    isOwner(userId) {
        if (!app.data || !app.data.meta) return false;
        const u = app.data.users.find(user => user.id === userId);
        if (!u) return false;
        return u.email === app.data.meta.owner || u.id === app.data.meta.createdBy;
    },

    handleDataUpdate() {
        app.watchForToasts();
        if (!app.data || !app.data.users) {
            console.warn("⚠️ Données de guilde incomplètes ou absentes.");
            app.showView('entry-choice-screen');
            return;
        }

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
        if (!app.data.meta) app.data.meta = { guildName: "Guilde sans nom", isPublic: false, isOpen: true };
        
        // Ensure admins array exists and includes owner
        if (!app.data.meta.admins) app.data.meta.admins = [];
        const ownerUser = app.data.users.find(u => u.email === app.data.meta.owner);
        if (ownerUser && !app.data.meta.admins.includes(ownerUser.id)) {
             app.data.meta.admins.push(ownerUser.id);
        }

        // Migration pour estimatedTime
        if (app.data.questDefinitions) {
            app.data.questDefinitions.forEach(d => {
                if (d.estimatedTime === undefined) d.estimatedTime = 15;
            });
        }

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
                db.setSystemConfig(139); 
                sessionStorage.setItem('system_version_pushed', 'true');
            }
        }
        
        app.showView('content');
        app.syncSettingsUI();
        app.render();

        // Check for tutorial
        const hasSeenTutorial = localStorage.getItem(`tutorial_seen_${app.mainUser.id}`);
        if (!hasSeenTutorial) {
            setTimeout(() => app.startTutorial(), 1000);
        }
    },

    // --- Stats & Workload ---
    renderStats() {
        const statsList = document.getElementById('stats-list');
        if (!statsList) return;

        const users = [...app.data.users, { id: null, name: "❓ Libres", avatar: "?" }];
        const defs = app.data.questDefinitions.filter(d => !d.archived);
        
        let totalGuildMinutes = 0;
        const memberCount = app.data.users.length || 1;

        const workloadData = users.map(user => {
            let weeklyMinutes = 0;
            let weeklyXP = 0;
            let weeklyGold = 0;
            let weeklyCount = 0;
            let assignedQuests = [];

            defs.forEach(d => {
                if (d.defaultAssignee === user.id) {
                    let annualMultiplier = 0;
                    const interval = parseInt(d.interval || 1);

                    if (d.frequency === 'daily') {
                        annualMultiplier = 365 / interval;
                    } else if (d.frequency === 'weekly') {
                        const daysCount = (d.days || []).length || 1;
                        annualMultiplier = (52 / interval) * daysCount;
                    } else if (d.frequency === 'monthly') {
                        annualMultiplier = 12 / interval;
                    } else {
                        annualMultiplier = 1;
                    }

                    const qWeeklyMins = (d.estimatedTime || 15) * annualMultiplier / 52;
                    const qWeeklyGold = (d.baseGold || 0) * annualMultiplier / 52;
                    const qWeeklyXP = (d.baseXp || 0) * annualMultiplier / 52;

                    weeklyMinutes += qWeeklyMins;
                    weeklyGold += qWeeklyGold;
                    weeklyXP += qWeeklyXP;
                    weeklyCount += annualMultiplier / 52;
                    
                    assignedQuests.push({
                        title: d.title,
                        weeklyMins: qWeeklyMins,
                        weeklyGold: qWeeklyGold,
                        xp: d.baseXp
                    });
                }
            });

            // On ne compte que les membres réels dans la charge totale de guilde pour la moyenne
            if (user.id !== null) totalGuildMinutes += weeklyMinutes;

            return {
                ...user,
                weeklyMinutes: Math.round(weeklyMinutes),
                weeklyGold: Math.round(weeklyGold),
                weeklyXP: Math.round(weeklyXP),
                weeklyCount: Math.round(weeklyCount),
                quests: assignedQuests.sort((a,b) => b.weeklyMins - a.weeklyMins)
            };
        });

        const guildAverage = totalGuildMinutes / memberCount;

        // Tri par durée totale décroissante
        workloadData.sort((a, b) => b.weeklyMinutes - a.weeklyMinutes);

        const maxMins = Math.max(...workloadData.map(d => d.weeklyMinutes), 60);

        statsList.innerHTML = workloadData.map(d => {
            const isExpanded = app._expandedStatUserId === d.id;
            const hours = Math.floor(d.weeklyMinutes / 60);
            const mins = d.weeklyMinutes % 60;
            const timeStr = hours > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${mins}min`;
            
            const percentage = (d.weeklyMinutes / maxMins) * 100;
            
            // Calcul de la couleur selon l'écart à la moyenne (seulement pour les membres)
            let loadClass = 'load-low';
            if (d.id !== null && guildAverage > 0) {
                const deviation = Math.abs(d.weeklyMinutes - guildAverage) / guildAverage;
                if (deviation > 0.75) loadClass = 'load-extreme';
                else if (deviation > 0.50) loadClass = 'load-high';
                else if (deviation > 0.25) loadClass = 'load-medium';
                else loadClass = 'load-low';
            } else if (d.id === null) {
                loadClass = 'load-low'; // Pour les libres
            }

            const questsHtml = d.quests.map(q => {
                const qHours = Math.floor(q.weeklyMins / 60);
                const qMins = Math.round(q.weeklyMins % 60);
                const qTimeStr = qHours > 0 ? `${qHours}h${qMins.toString().padStart(2, '0')}` : `${qMins}m`;
                return `
                    <div class="dense-quest-item">
                        <span class="dense-quest-name">${q.title}</span>
                        <span class="dense-quest-time">${Math.round(q.weeklyGold)} ${app.data.currency.symbol} • ${qTimeStr} / sem</span>
                    </div>
                `;
            }).join('');

            return `
                <div class="stat-card ${isExpanded ? 'expanded' : ''}" onclick="app.toggleStatCard('${d.id}')">
                    <div class="stat-header">
                        ${app.getAvatarHtml(d.avatar, "30px")}
                        <h4>${d.name}</h4>
                        <div style="text-align:right;">
                            <div style="font-size:0.85rem; font-weight:bold;">${timeStr} / sem</div>
                            ${d.id !== null ? `<div style="font-size:0.6rem; opacity:0.5;">Moyenne: ${Math.round(guildAverage)}m</div>` : ''}
                        </div>
                    </div>
                    <div class="workload-bar-container">
                        <div class="workload-bar ${loadClass}" style="width: ${percentage}%"></div>
                    </div>
                    <div class="workload-metrics">
                        <div class="metric-item">
                            <span class="metric-value">${d.weeklyXP}</span>
                            <span class="metric-label">XP / sem</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-value" style="color:#f1c40f">${d.weeklyGold}</span>
                            <span class="metric-label">${app.data.currency.name} / sem</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-value">${d.weeklyCount}</span>
                            <span class="metric-label">Tâches</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-value">${d.id !== null ? app.getRank(d.level || 1) : '-'}</span>
                            <span class="metric-label">Rang</span>
                        </div>
                    </div>
                    ${isExpanded ? `
                        <div class="workload-details">
                            <div style="font-size:0.7rem; text-transform:uppercase; opacity:0.6; margin-bottom:8px; font-weight:bold;">Détail des Quêtes</div>
                            <div class="dense-quest-list">${questsHtml || '<p style="font-size:0.7rem; opacity:0.5;">Aucune tâche assignée.</p>'}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    },

    toggleStatCard(userId) {
        // userId est stringifié par le template literal, attention au null
        const id = userId === "null" ? null : userId;
        app._expandedStatUserId = (app._expandedStatUserId === id) ? null : id;
        app.renderStats();
    },

    startTutorial() {
        app.hideModals();
        app.currentTutorialStep = 0;
        app.renderTutorialStep();
        const backdrop = document.getElementById('tutorial-backdrop');
        if (backdrop) backdrop.classList.remove('hidden');
        app.showModal('tutorial-modal');
    },

    nextTutorialStep() {
        app.currentTutorialStep++;
        // Skip steps that don't meet conditions
        while (app.currentTutorialStep < app.tutorialSteps.length && 
               app.tutorialSteps[app.currentTutorialStep].condition && 
               !app.tutorialSteps[app.currentTutorialStep].condition()) {
            app.currentTutorialStep++;
        }

        if (app.currentTutorialStep >= app.tutorialSteps.length) {
            app.skipTutorial();
        } else {
            app.renderTutorialStep();
        }
    },

    renderTutorialStep() {
        const step = app.tutorialSteps[app.currentTutorialStep];
        document.getElementById('tutorial-title').innerText = step.title;
        document.getElementById('tutorial-body').innerHTML = step.body;
        
        // Dots
        const dots = document.getElementById('tutorial-dots');
        dots.innerHTML = app.tutorialSteps.map((_, i) => 
            `<div style="width:6px; height:6px; border-radius:50%; background:${i === app.currentTutorialStep ? '#4a90e2' : '#444'}"></div>`
        ).join('');

        // Action (View Switch)
        if (step.action) step.action();

        // Highlight
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
        
        const modalContent = document.querySelector('#tutorial-modal .modal-content');
        if (!modalContent) return;

        setTimeout(() => {
            if (step.highlight) {
                const target = document.querySelector(step.highlight);
                if (target) {
                    target.classList.add('tutorial-highlight');
                    
                    // Positionnement dynamique
                    const rect = target.getBoundingClientRect();
                    const screenHeight = window.innerHeight;
                    
                    // Si l'élément est en haut de l'écran, on met le modal en bas, et inversement
                    if (rect.top < screenHeight / 2) {
                        modalContent.style.marginTop = "auto";
                        modalContent.style.marginBottom = "20px";
                    } else {
                        modalContent.style.marginTop = "20px";
                        modalContent.style.marginBottom = "auto";
                    }

                    // Scrolling auto vers l'élément
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else {
                modalContent.style.marginTop = "100px";
                modalContent.style.marginBottom = "auto";
            }
        }, 100);

        // Button text
        const btn = document.getElementById('tutorial-next-btn');
        btn.innerText = app.currentTutorialStep === app.tutorialSteps.length - 1 ? "C'est parti ! ⚔️" : "Suivant ⚔️";
    },

    skipTutorial() {
        localStorage.setItem(`tutorial_seen_${app.mainUser.id}`, 'true');
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
        const backdrop = document.getElementById('tutorial-backdrop');
        if (backdrop) backdrop.classList.add('hidden');
        app.hideModals();
        app.setView('board');
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

    calculateNextDueDate(def, fromDate = new Date()) {
        let next = new Date(fromDate); 
        const int = parseInt(def.interval || 1); 
        const now = new Date(); 
        now.setHours(0,0,0,0);
        
        const isWeeklyWithDays = def.frequency === 'weekly' && def.days && def.days.length > 0;

        const add = (d) => {
            if (def.frequency === 'daily') d.setDate(d.getDate() + int);
            else if (def.frequency === 'weekly') {
                if (isWeeklyWithDays) {
                    let found = false;
                    // Pour le hebdo avec jours, on cherche le prochain jour valide
                    // On commence à chercher à partir du lendemain du fromDate
                    for (let i = 1; i <= 7 * int; i++) {
                        let check = new Date(d); check.setDate(d.getDate() + i);
                        if (def.days.includes(check.getDay().toString())) { 
                            // Si on a un intervalle > 1, on ne valide que si on est dans la bonne semaine
                            if (int > 1) {
                                // Calcul simplifié des semaines d'écart
                                const weeksDiff = Math.floor((check.getTime() - new Date(fromDate).getTime()) / (7 * 24 * 3600 * 1000));
                                if (weeksDiff % int !== 0) continue;
                            }
                            d.setTime(check.getTime()); found = true; break; 
                        }
                    }
                    if (!found) d.setDate(d.getDate() + 7 * int);
                } else {
                    d.setDate(d.getDate() + 7 * int);
                }
            } else if (def.frequency === 'monthly') d.setMonth(d.getMonth() + int);
        };

        add(next); 
        
        // Sécurité : si la date calculée est encore dans le passé par rapport à AUJOURD'HUI
        // (sauf pour hebdo avec jours où on veut peut-être rattraper le retard de la semaine en cours si on vient juste de finir)
        // Mais la demande dit : "la prochaine exécution doit être calculée par rapport à la date de la dernière exécution"
        // Donc si c'est tous les 2 jours, et que je le fais avec 4 jours de retard, la suivante est dans 2 jours.
        // C'est ce que fait `add(next)` une seule fois.
        
        // Pour les hebdomadaires à jours fixes, si on a fini une tâche en retard, on veut quand même que la prochaine respecte le planning.
        if (isWeeklyWithDays) {
            let safety = 0;
            while (next < now && safety < 100) { safety++; add(next); }
        }

        next.setHours(4, 0, 0, 0); 
        return next;
    },

    calculateFirstDueDate(def) {
        const now = new Date(); now.setHours(0,0,0,0);
        if (def.frequency === 'weekly' && def.days && def.days.length > 0) { if (def.days.includes(now.getDay().toString())) { const today = new Date(now); today.setHours(4,0,0,0); return today; } }
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        return app.calculateNextDueDate(def, yesterday);
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
        
        // Position du clic pour l'animation
        const rect = event.target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top;

        const userLevel = app.currentUser.level || 1;
        const bonusMultiplier = 1 + (userLevel / 100);
        
        const earnedXp = Math.ceil(parseInt(quest.xp || 0) * bonusMultiplier);
        const earnedGold = Math.ceil(parseInt(quest.gold || 0) * bonusMultiplier);

        app.currentUser.xp += earnedXp;
        app.currentUser.gold = (app.currentUser.gold || 0) + earnedGold;

        // Déclencher les animations
        app.showLootPopup(`+${earnedXp} XP`, x - 20, y, 'xp-gain');
        setTimeout(() => app.showLootPopup(`+${earnedGold} ${app.data.currency.symbol}`, x + 20, y, 'gold-gain'), 200);

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
            // Si c'est un hebdo à jours fixes, on garde le calcul par rapport à la dueDate initiale pour ne pas décaler le planning
            const isWeeklyWithDays = def.frequency === 'weekly' && def.days && def.days.length > 0;
            const fromDate = isWeeklyWithDays ? new Date(quest.dueDate) : new Date();
            
            quest.dueDate = app.calculateNextDueDate(def, fromDate).toISOString();
            quest.assignedTo = def.defaultAssignee || null;
            delete quest.stealDeadline;
        } else app.data.activeQuests.splice(index, 1);
        await app.save();
    },

    showLootPopup(text, x, y, className) {
        const el = document.createElement('div');
        el.className = `loot-popup ${className}`;
        el.innerText = text;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1200);
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
        const durationEl = document.getElementById('quest-duration');
        const freqEl = document.getElementById('quest-frequency');
        const intervalEl = document.getElementById('quest-interval');
        const dateEl = document.getElementById('quest-date');
        const assigneeEl = document.getElementById('quest-assignee');
        
        if (!titleEl || !xpEl) return;

        const title = titleEl.value;
        const xp = parseInt(xpEl.value);
        const gold = parseInt(goldEl ? goldEl.value : 0) || 0;
        const duration = parseInt(durationEl ? durationEl.value : 15) || 15;
        const freq = freqEl ? freqEl.value : 'none';
        const interval = parseInt(intervalEl ? intervalEl.value : 1) || 1;
        const assignee = assigneeEl ? assigneeEl.value : null;
        
        const tStart = document.getElementById('quest-time-start').value;
        const tEnd = document.getElementById('quest-time-end').value;
        const days = Array.from(document.querySelectorAll('input[name="quest-day"]:checked')).map(cb => cb.value);
        
        if (!title || isNaN(xp)) return;

        const defId = 'def_'+Date.now();
        const timeSlot = (tStart || tEnd) ? { start: tStart, end: tEnd } : null;
        
        let dueDate = null;
        if (freq === 'none') {
            dueDate = dateEl.value ? new Date(dateEl.value).toISOString() : null;
        } else {
            const tempDef = { frequency: freq, days, interval: interval };
            dueDate = app.calculateFirstDueDate(tempDef).toISOString();
        }

        const def = { id: defId, title, baseXp: xp, baseGold: gold, estimatedTime: duration, frequency: freq, interval: interval, days, timeSlot, defaultAssignee: assignee, isRoyal: false, status: 'pending', votes: { [app.currentUser.id]: true }, createdBy: app.currentUser.id };
        
        const totalMembers = app.data.users.length;
        const majority = Math.floor(totalMembers / 2) + 1;
        if (Object.keys(def.votes).length >= majority && !assignee) {
            def.status = 'active';
        }

        app.data.questDefinitions.push(def);
        app.data.activeQuests.push({ id: 'inst_'+Date.now(), definitionId: defId, title, xp, gold, dueDate, timeSlot, assignedTo: assignee, isRoyal: false, status: def.status, createdBy: app.currentUser.id });
        await app.save(); app.hideModals();
    },

    async addRoyalQuest() {
        const title = document.getElementById('royal-quest-title').value;
        const xp = parseInt(document.getElementById('royal-quest-xp').value || 0);
        const gold = parseInt(document.getElementById('royal-quest-gold').value || 0);
        const assignee = document.getElementById('royal-quest-assignee').value || null;
        
        if (!title) return alert("Titre requis !");

        const isAdmin = app.isAdmin();
        if (!isAdmin) {
            if (app.currentUser.gold < gold) return alert("Pas assez de monnaie pour financer cette Mission Royale !");
            app.currentUser.gold -= gold;
        }

        const defId = 'def_royal_'+Date.now();
        const def = { id: defId, title, baseXp: xp, baseGold: gold, frequency: 'none', defaultAssignee: assignee, isRoyal: true, status: 'pending', votes: { [app.currentUser.id]: true }, createdBy: app.currentUser.id };
        
        const totalMembers = app.data.users.length;
        const majority = Math.floor(totalMembers / 2) + 1;
        if (Object.keys(def.votes).length >= majority && !assignee) {
            def.status = 'active';
        }

        app.data.questDefinitions.push(def);
        app.data.activeQuests.push({ 
            id: 'inst_royal_'+Date.now(), 
            definitionId: defId, 
            title, 
            xp, 
            gold, 
            dueDate: new Date().toISOString(), 
            assignedTo: assignee, 
            isRoyal: true,
            status: def.status,
            createdBy: app.currentUser.id
        });
        
        await app.save(); 
        app.hideModals();
        app.setView('board');
    },

    openCounterOfferModal(instanceId) {
        const quest = app.data.activeQuests.find(q => q.id === instanceId);
        if (!quest) return;
        const def = app.data.questDefinitions.find(d => d.id === quest.definitionId);
        if (!def) return;

        document.getElementById('counter-quest-id').value = instanceId;
        document.getElementById('counter-offer-text').innerText = `Négociation du contrat`;
        document.getElementById('counter-title').value = quest.title;
        document.getElementById('counter-xp').value = quest.xp;
        document.getElementById('counter-gold').value = quest.gold;
        document.getElementById('counter-duration').value = def.estimatedTime || 15;
        document.getElementById('counter-frequency').value = def.frequency || 'none';
        document.getElementById('counter-interval').value = def.interval || 1;
        document.getElementById('counter-time-start').value = (def.timeSlot && def.timeSlot.start) ? def.timeSlot.start : '';
        document.getElementById('counter-time-end').value = (def.timeSlot && def.timeSlot.end) ? def.timeSlot.end : '';
        
        // Jours pour récurrence hebdo
        const days = def.days || [];
        document.querySelectorAll('input[name="counter-day"]').forEach(cb => {
            cb.checked = days.includes(cb.value);
        });

        document.getElementById('counter-reason').value = '';
        
        const memberOptions = `<option value="">❓ Pour tous</option>` + app.data.users.map(u => `<option value="${u.id}" ${u.id === quest.assignedTo ? 'selected' : ''}>${u.name}</option>`).join('');
        const select = document.getElementById('counter-assignee');
        if (select) select.innerHTML = memberOptions;
        
        app.toggleRecurrenceUI('counter');
        app.showModal('counter-offer-modal');
    },

    async submitCounterOffer() {
        const instanceId = document.getElementById('counter-quest-id').value;
        const title = document.getElementById('counter-title').value;
        const xp = parseInt(document.getElementById('counter-xp').value);
        const gold = parseInt(document.getElementById('counter-gold').value);
        const duration = parseInt(document.getElementById('counter-duration').value);
        const frequency = document.getElementById('counter-frequency').value;
        const interval = parseInt(document.getElementById('counter-interval').value || 1) || 1;
        const tStart = document.getElementById('counter-time-start').value;
        const tEnd = document.getElementById('counter-time-end').value;
        const days = Array.from(document.querySelectorAll('input[name="counter-day"]:checked')).map(cb => cb.value);
        const assignee = document.getElementById('counter-assignee').value || null;
        const reason = document.getElementById('counter-reason').value || '';

        const quest = app.data.activeQuests.find(q => q.id === instanceId);
        if (!quest) return;
        const def = app.data.questDefinitions.find(d => d.id === quest.definitionId);
        if (!def) return;

        if (!title) return alert("Le contrat doit avoir un titre !");

        const changed = def.frequency !== frequency || JSON.stringify(def.days) !== JSON.stringify(days) || def.interval !== interval;

        def.title = title;
        def.baseXp = xp;
        def.baseGold = gold;
        def.estimatedTime = duration;
        def.frequency = frequency;
        def.interval = interval;
        def.days = days;
        def.timeSlot = (tStart || tEnd) ? { start: tStart, end: tEnd } : null;
        def.defaultAssignee = assignee;
        def.votes = { [app.currentUser.id]: true }; 
        def.lastReason = reason;
        def.revision = (def.revision || 0) + 1;

        quest.title = title;
        quest.xp = xp;
        quest.gold = gold;
        quest.assignedTo = assignee;
        quest.timeSlot = def.timeSlot;

        // Recalculer la dueDate si la fréquence ou l'intervalle a changé
        if (frequency !== 'none' && changed) {
            quest.dueDate = app.calculateFirstDueDate(def).toISOString();
        }

        let validated = false;
        if (assignee) {
            const hasCreatorVoted = def.votes[def.createdBy];
            const hasAssigneeVoted = def.votes[def.defaultAssignee];
            if (hasCreatorVoted && hasAssigneeVoted) validated = true;
        } else {
            const approvalCount = Object.keys(def.votes).length;
            const totalMembers = app.data.users.length;
            const majority = Math.floor(totalMembers / 2) + 1;
            if (approvalCount >= majority) validated = true;
        }

        if (validated) {
            def.status = 'active';
            quest.status = 'active';
        }

        app.data.questLog.unshift({ id: 'log_counter_'+Date.now(), type: 'system', title: `Contre-offre (${def.revision}) : ${quest.title}`, completedBy: app.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });

        await app.save();
        app.hideModals();
    },

    async voteQuest(instanceId, type) {
        const quest = app.data.activeQuests.find(q => q.id === instanceId);
        if (!quest) return;
        const def = app.data.questDefinitions.find(d => d.id === quest.definitionId);
        if (!def) return;

        if (type === 'approve') {
            if (!def.votes) def.votes = { [def.createdBy]: true };
            def.votes[app.currentUser.id] = true;

            let validated = false;
            if (def.defaultAssignee) {
                const hasCreatorVoted = def.votes[def.createdBy];
                const hasAssigneeVoted = def.votes[def.defaultAssignee];
                if (hasCreatorVoted && hasAssigneeVoted) validated = true;
            } else {
                const totalMembers = app.data.users.filter(u => !u.managedBy).length;
                const majority = Math.floor(totalMembers / 2) + 1;
                const approvalCount = Object.keys(def.votes).length;
                if (approvalCount >= majority) validated = true;
            }

            if (validated) {
                def.status = 'active';
                quest.status = 'active';
                app.data.questLog.unshift({ id: 'log_council_'+Date.now(), type: 'system', title: `Le Conseil a validé : ${quest.title}`, completedBy: 'Council', completedAt: new Date().toISOString(), xpEarned: 0 });
            }
        } else if (type === 'reject') {
            const idxDef = app.data.questDefinitions.findIndex(d => d.id === quest.definitionId);
            const idxInst = app.data.activeQuests.findIndex(q => q.id === instanceId);
            
            // Remboursement si c'est une mission royale payée
            if (def.isRoyal && def.baseGold > 0) {
                const creator = app.data.users.find(u => u.id === def.createdBy);
                // On ne rembourse que si le créateur n'est pas admin (les admins ne paient pas)
                // Note: On simplifie en vérifiant si le créateur est le propriétaire de la guilde
                const isOwner = app.data.meta.owner === creator?.email || creator?.email === 'yohann.gras@gmail.com';
                if (!isOwner && creator) {
                    creator.gold = (creator.gold || 0) + def.baseGold;
                    app.data.questLog.unshift({ id: 'log_refund_'+Date.now(), type: 'system', title: `Remboursement Mission Royale : ${def.baseGold} ${app.data.currency.symbol}`, completedBy: creator.id, completedAt: new Date().toISOString(), xpEarned: 0 });
                }
            }

            if (idxDef !== -1) app.data.questDefinitions.splice(idxDef, 1);
            if (idxInst !== -1) app.data.activeQuests.splice(idxInst, 1);
            app.data.questLog.unshift({ id: 'log_council_rej_'+Date.now(), type: 'system', title: `Le Conseil a rejeté : ${quest.title}`, completedBy: 'Council', completedAt: new Date().toISOString(), xpEarned: 0 });
        }

        await app.save();
    },

    openEditQuestModal(instanceId) {
        if (!app.isAdmin()) return;
        const realId = instanceId.replace('virtual_', '');
        let quest = app.data.activeQuests.find(q => q.id === realId);
        let defId = quest ? quest.definitionId : realId;
        const def = app.data.questDefinitions.find(d => d.id === defId);
        if (!def) return;
        
        document.getElementById('edit-quest-id').value = def.id; 
        document.getElementById('edit-quest-title').value = def.title;
        document.getElementById('edit-quest-difficulty').value = def.baseXp;
        document.getElementById('edit-quest-gold').value = def.baseGold || 0;
        document.getElementById('edit-quest-duration').value = def.estimatedTime || 15;
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
            const duration = parseInt(document.getElementById('edit-quest-duration').value || 15);
            const freq = document.getElementById('edit-quest-frequency').value;
            const interval = parseInt(document.getElementById('edit-quest-interval').value || 1);
            const assignee = document.getElementById('edit-quest-assignee').value || null;
            const tStart = document.getElementById('edit-quest-time-start').value;
            const tEnd = document.getElementById('edit-quest-time-end').value;
            const days = Array.from(document.querySelectorAll('input[name="edit-quest-day"]:checked')).map(cb => cb.value);
            if (!title || isNaN(xp)) return;
            const defIdx = app.data.questDefinitions.findIndex(d => d.id === defId); if (defIdx === -1) return;
            const oldDef = app.data.questDefinitions[defIdx];
            const timeSlot = (tStart && tEnd) ? { start: tStart, end: tEnd } : null;
            const changed = oldDef.frequency !== freq || JSON.stringify(oldDef.days) !== JSON.stringify(days) || oldDef.interval !== interval;
            app.data.questDefinitions[defIdx] = { ...oldDef, title, baseXp: xp, baseGold: gold, estimatedTime: duration, frequency: freq, interval, days, timeSlot, defaultAssignee: assignee };
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
    openRoyalMissionModal() {
        document.getElementById('royal-quest-title').value = '';
        document.getElementById('royal-quest-xp').value = 100;
        document.getElementById('royal-quest-gold').value = 50;
        
        const memberOptions = `<option value="">❓ Pour tous</option>` + app.data.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
        const select = document.getElementById('royal-quest-assignee');
        if (select) select.innerHTML = memberOptions;
        
        const label = document.querySelector('.currency-name-label');
        if (label) label.innerText = app.data.currency.name;
        
        app.showModal('royal-mission-modal');
    },

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
            document.getElementById('stats-board').classList.add('hidden');
            document.getElementById('market-board').classList.add('hidden');
            document.getElementById('history-board').classList.add('hidden'); 
            app.renderBoard(); 
        } else if (app.currentView === 'stats') {
            document.getElementById('quest-board').classList.add('hidden');
            document.getElementById('stats-board').classList.remove('hidden');
            document.getElementById('market-board').classList.add('hidden');
            document.getElementById('history-board').classList.add('hidden');
            app.renderStats();
        } else if (app.currentView === 'market') {
            document.getElementById('quest-board').classList.add('hidden');
            document.getElementById('stats-board').classList.add('hidden');
            document.getElementById('market-board').classList.remove('hidden');
            document.getElementById('history-board').classList.add('hidden');
            app.renderMarket();
        } else { 
            document.getElementById('quest-board').classList.add('hidden'); 
            document.getElementById('stats-board').classList.add('hidden');
            document.getElementById('market-board').classList.add('hidden');
            document.getElementById('history-board').classList.remove('hidden'); 
            app.renderHistory(); 
        }
    },

    renderBoard() {
        if (!app.data || !app.data.activeQuests) return;
        const now = new Date(); 
        const endOfToday = new Date(now); endOfToday.setHours(23,59,59,999);
        
        // Séparer les quêtes en attente (Conseil)
        const pending = app.data.activeQuests.filter(q => q.status === 'pending');
        const count = pending.length;
        const councilContainer = document.getElementById('council-container');
        if (councilContainer) {
            councilContainer.classList.toggle('hidden', count === 0);
            const councilCount = document.getElementById('council-count');
            if (councilCount) councilCount.innerText = count;
            document.getElementById('council-list').innerHTML = pending.map(q => {
                const def = app.data.questDefinitions.find(d => d.id === q.definitionId);
                const approvals = (def && def.votes) ? Object.keys(def.votes).length : 0;
                const total = app.data.users.filter(u => !u.managedBy).length;
                const majority = Math.floor(total / 2) + 1;
                const progressText = (def && def.defaultAssignee) ? `Accord requis (Créateur + Assigné)` : `Approbations : ${approvals} / ${majority}`;
                const isVoted = def && def.votes && def.votes[app.currentUser.id];
                
                const assignee = q.assignedTo ? app.data.users.find(u=>u.id===q.assignedTo) : null;
                const assigneeName = assignee ? assignee.name : 'Pour tous';
                const creator = app.data.users.find(u => u.id === (def?.createdBy || q.createdBy))?.name || 'Ancien';
                const revisionHtml = (def?.revision > 0) ? `<span class="badge" style="background:#f39c12; margin-left:5px;">Rév. ${def.revision}</span>` : '';
                const reasonHtml = def?.lastReason ? `<div style="font-size:0.7rem; color:#8b4513; margin-top:5px; font-style:italic; border-left:2px solid #f39c12; padding-left:5px;">"${def.lastReason}"</div>` : '';
                
                const votersList = (def && def.votes) ? Object.keys(def.votes).map(vId => {
                    const u = app.data.users.find(usr => usr.id === vId);
                    return `<div class="assignee-badge" style="width:20px; height:20px; border:1px solid #27ae60;">${app.getAvatarHtml(u ? u.avatar : '?', "20px")}</div>`;
                }).join('') : '';

                const freqMap = { none: 'Unique', daily: 'Quotidien', weekly: 'Hebdo', monthly: 'Mensuel' };
                const dayMap = { '1': 'L', '2': 'M', '3': 'M', '4': 'J', '5': 'V', '6': 'S', '0': 'D' };
                
                let freqText = '';
                if (def) {
                    const int = parseInt(def.interval || 1);
                    if (int > 1) {
                        const freqLabel = { daily: 'jours', weekly: 'semaines', monthly: 'mois' }[def.frequency];
                        freqText = `Tous les ${int} ${freqLabel || ''}`;
                    } else {
                        freqText = freqMap[def.frequency] || 'Unique';
                    }

                    if (def.frequency === 'weekly' && def.days && def.days.length > 0) {
                        freqText += ` (${def.days.map(d => dayMap[d]).join(',')})`;
                    } else if (def.frequency === 'none' && q.dueDate) {
                        const d = new Date(q.dueDate);
                        freqText += ` (${d.toLocaleDateString()})`;
                    }
                } else {
                    freqText = 'Unique';
                }

                const durationText = (def && def.estimatedTime) ? ` • ⏳ ${def.estimatedTime}m` : '';
                const timeText = q.timeSlot ? ` • 🕒 ${q.timeSlot.start}${q.timeSlot.end ? '-' + q.timeSlot.end : ''}` : '';

                return `<div class="scroll-card ${q.isRoyal ? 'royal-quest-card' : ''}">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <div style="flex:1; padding-right:10px;">
                            <h4 style="display:flex; align-items:center;">${q.isRoyal ? '👑' : '📜'} ${q.title} ${revisionHtml}</h4>
                            <div style="font-size:0.7rem; margin-top:2px; opacity:0.6;">Proposé par : <strong>${creator}</strong></div>
                            ${reasonHtml}
                        </div>
                        <div style="display:flex; gap:2px; flex-shrink:0;">${votersList}</div>
                    </div>
                    
                    <div style="background: rgba(0,0,0,0.1); border-radius: 4px; padding: 8px; margin: 8px 0; border: 1px dashed rgba(255,255,255,0.1);">
                        <div style="font-size:0.8rem; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <span style="color: #f1c40f;">💰 ${q.xp} XP • ${app.data.currency.symbol} ${q.gold}</span>
                            <span style="opacity: 0.8;">🔄 ${freqText}${durationText}${timeText}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:5px; margin-top:5px;">
                            <div class="assignee-badge ${!assignee ? 'empty' : ''}" style="width:20px; height:20px;">${app.getAvatarHtml(assignee ? assignee.avatar : '?', "20px")}</div>
                            <span style="font-size:0.75rem; opacity: 0.9;">Assigné : <strong>${assigneeName}</strong></span>
                        </div>
                    </div>

                    <div class="scroll-actions">
                        <span class="vote-progress" style="margin-right:auto;">${progressText}</span>
                        ${!isVoted ? `<button class="scroll-btn btn-approve" onclick="app.voteQuest('${q.id}', 'approve')">Approuver</button>` : `<span style="font-size:0.8rem; color:#27ae60; margin-right:10px;">Fait ✅</span>`}
                        <button class="scroll-btn btn-counter" onclick="app.openCounterOfferModal('${q.id}')">Négocier</button>
                    </div>
                </div>`;
            }).join('');
        }

        const nonPending = app.data.activeQuests.filter(q => q.status !== 'pending');
        
        const active = nonPending.filter(q => {
            if (!q.dueDate) return true;
            const due = new Date(q.dueDate);
            
            // Si la date d'échéance est passée (et la quête n'est pas terminée), elle est active
            if (due < now) return true;

            // Si c'est aujourd'hui, vérifier l'heure de début
            if (due.toDateString() === now.toDateString()) {
                if (q.timeSlot && q.timeSlot.start) {
                    const [h, m] = q.timeSlot.start.split(':');
                    const startTime = new Date(now);
                    startTime.setHours(parseInt(h), parseInt(m), 0, 0);
                    return now >= startTime;
                }
                return true;
            }
            return false;
        });

        let upcoming = nonPending.filter(q => !active.includes(q));
        
        active.forEach(q => { 
            const def = app.data.questDefinitions.find(d => d.id === q.definitionId); 
            if (def && def.frequency && def.frequency !== 'none') {
                // Pour la projection virtuelle, on base sur la dueDate de l'instance active
                // Si la quête est en retard, la projection virtuelle doit quand même montrer la SUIVANTE
                // On utilise calculateNextDueDate par rapport à la dueDate actuelle
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
        if (!app.data || !app.data.meta) return;

        // En-tête de Guilde
        document.getElementById('guild-name-display').innerText = app.data.meta.guildName || "Sans nom";
        const memberCount = (app.data.users || []).length;
        document.getElementById('guild-stats-display').innerText = `${memberCount} Membre${memberCount>1?'s':''} • ${app.data.meta.isPublic ? '🌍 Publique' : '🔒 Privée'}`;

        // Admin Edit Fields
        const elName = document.getElementById('edit-guild-name');
        if (elName) elName.value = app.data.meta.guildName || "";
        
        const elPublic = document.getElementById('edit-guild-public');
        if (elPublic) elPublic.value = (app.data.meta.isPublic ?? false).toString();
        
        const elOpen = document.getElementById('edit-guild-open');
        if (elOpen) elOpen.value = (app.data.meta.isOpen ?? true).toString();
        
        // Economy settings
        const elCurrName = document.getElementById('guild-currency-name');
        if (elCurrName) elCurrName.value = (app.data.currency?.name || "Écus");
        
        const elCurrSym = document.getElementById('guild-currency-symbol');
        if (elCurrSym) elCurrSym.value = (app.data.currency?.symbol || "🪙");
        
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
        
        // Toggle Admin Zone
        const adminZone = document.getElementById('guild-admin-zone');
        if (adminZone) adminZone.classList.toggle('hidden', !isAdmin);

        // Hide Admin Buttons
        const btnAdmin = document.querySelector('button[onclick*="renderDevMode"]');
        if (btnAdmin) btnAdmin.style.display = isAdmin ? 'block' : 'none';
        
        const btnAddMarket = document.getElementById('add-market-item-btn');
        if (btnAddMarket) btnAddMarket.style.display = isAdmin ? 'block' : 'none';
        
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
    renderGuildMembers() {
        const elList = document.getElementById('guild-members-list');
        if (!elList) return;
        
        const admins = app.data.meta.admins || [];
        const ownerEmail = app.data.meta.owner;

        // Tri : Admins d'abord, puis Level DESC, puis XP DESC
        const sortedUsers = [...app.data.users].sort((a, b) => {
            const isAdminA = admins.includes(a.id) || a.email === ownerEmail;
            const isAdminB = admins.includes(b.id) || b.email === ownerEmail;
            if (isAdminA && !isAdminB) return -1;
            if (!isAdminA && isAdminB) return 1;
            
            const lvlA = a.level || 1, lvlB = b.level || 1;
            if (lvlA !== lvlB) return lvlB - lvlA;
            return (b.xp || 0) - (a.xp || 0);
        });

        const currentIsAdmin = app.isAdmin();
        // Super-admin protection: cannot be kicked/demoted by regular admins
        const isSuperAdmin = (u) => u.email === 'yohann.gras@gmail.com'; 

        elList.innerHTML = sortedUsers.map(u => {
            const isOwner = u.email === ownerEmail || u.id === app.data.meta.createdBy;
            const isAdmin = admins.includes(u.id) || isOwner;
            const isMe = u.id === app.currentUser.id;
            const isTargetSuperAdmin = isSuperAdmin(u);
            
            const rankTitle = app.getRank(u.level || 1);
            
            let actionButtons = '';
            if (currentIsAdmin && !isMe) {
                // Actions available: Kick, Promote/Demote
                // Rule: Can't act on Owner. Can't act on Super Admin.
                if (!isOwner && !isTargetSuperAdmin) {
                    const kickBtn = `<button class="kick-btn" onclick="app.kickMember('${u.id}')" title="Exclure">🚫</button>`;
                    const promoteBtn = !isAdmin ? `<button class="admin-toggle-btn" onclick="app.toggleAdminRole('${u.id}')" title="Promouvoir Admin">⭐</button>` : '';
                    const demoteBtn = isAdmin ? `<button class="admin-toggle-btn demote" onclick="app.toggleAdminRole('${u.id}')" title="Rétrograder">⬇️</button>` : '';
                    
                    actionButtons = `<div style="display:flex; gap:5px;">${promoteBtn}${demoteBtn}${kickBtn}</div>`;
                }
            }

            return `
                <div class="member-card-detailed ${isAdmin ? 'is-admin' : ''}">
                    ${app.getAvatarHtml(u.avatar, "40px")}
                    <div class="member-info">
                        <div class="member-name-row">
                            ${u.name}
                            ${isOwner ? '<span class="admin-badge">Chef</span>' : (isAdmin ? '<span class="admin-badge" style="background:#f39c12; color:white;">Admin</span>' : '')}
                        </div>
                        <div class="member-title">${rankTitle}</div>
                        <div class="member-stats-row">
                            <span>Lvl ${u.level || 1}</span>
                            <span>•</span>
                            <span>${u.xp || 0} XP</span>
                            <span>•</span>
                            <span style="color:#f1c40f">${u.gold || 0} ${app.data.currency.symbol}</span>
                        </div>
                    </div>
                    ${actionButtons}
                </div>
            `;
        }).join('');
    },

    async toggleAdminRole(userId) {
        if (!app.isAdmin()) return;
        const user = app.data.users.find(u => u.id === userId);
        if (!user) return;
        
        // Ensure admins array exists
        if (!app.data.meta.admins) app.data.meta.admins = [];
        
        const index = app.data.meta.admins.indexOf(userId);
        if (index === -1) {
            // Promote
            if (confirm(`Promouvoir ${user.name} au rang d'Administrateur ?\nIl pourra gérer les quêtes, le marché et les membres.`)) {
                app.data.meta.admins.push(userId);
                app.data.questLog.unshift({ id: 'log_promote_'+Date.now(), type: 'system', title: `Promotion : ${user.name} est Admin`, completedBy: app.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });
            } else return;
        } else {
            // Demote
            if (confirm(`Rétrograder ${user.name} ?\nIl perdra ses droits d'administration.`)) {
                app.data.meta.admins.splice(index, 1);
                app.data.questLog.unshift({ id: 'log_demote_'+Date.now(), type: 'system', title: `Rétrogradation : ${user.name}`, completedBy: app.currentUser.id, completedAt: new Date().toISOString(), xpEarned: 0 });
            } else return;
        }
        
        await app.save();
        app.renderGuildMembers();
    },

    async kickMember(userId) {
        if (!app.isAdmin()) return;
        const user = app.data.users.find(u => u.id === userId);
        if (!user) return;
        
        // Protection Owner/SuperAdmin (Frontend check, DB rules should also enforce)
        if (app.isOwner(userId) || user.email === 'yohann.gras@gmail.com') return alert("Impossible de bannir ce membre.");

        if (confirm(`Êtes-vous sûr de vouloir bannir ${user.name} du royaume ? Cette action est irréversible.`)) {
            app.data.users = app.data.users.filter(u => u.id !== userId);
            // Clean up admin list
            if (app.data.meta.admins) {
                app.data.meta.admins = app.data.meta.admins.filter(id => id !== userId);
            }
            // Clean up assignments
            app.data.activeQuests.forEach(q => { if(q.assignedTo === userId) q.assignedTo = null; });
            
            app.data.questLog.unshift({ 
                id: 'log_ban_'+Date.now(), 
                type: 'system', 
                title: `Bannissement : ${user.name}`, 
                completedBy: app.currentUser.id, 
                completedAt: new Date().toISOString(), 
                xpEarned: 0 
            });

            await app.save();
            app.renderGuildMembers();
        }
    },

    updateCurrentUserInfo() { app.currentUser.name = document.getElementById('edit-user-name').value; app.save(); },
    setView(v) { 
        app.currentView = v; 
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.id === `tab-${v}`)); 
        
        // Hide all boards
        ['quest-board', 'stats-board', 'market-board', 'history-board'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        // Show target board
        const target = document.getElementById(`${v}-board`);
        if (target) target.classList.remove('hidden');

        app.render(); 
    },
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
        app.syncSettingsUI(); // Refresh title
    },
    async confirmCreateGuild() {
        const nameIn = document.getElementById('new-guild-name');
        const name = nameIn ? nameIn.value : "";
        if (!name) return alert("Le nom de la guilde est obligatoire !");
        
        const isPublic = document.getElementById('new-guild-public').value === 'true';
        const isOpen = document.getElementById('new-guild-open').value === 'true';
        
        app.showLoading(true);
        try {
            const guildId = await db.createGuild(auth.user.email, name, isPublic, isOpen);
            localStorage.setItem('currentGuildId', guildId);
            window.location.reload(); // Recharger pour initialiser la nouvelle guilde
        } catch (err) {
            console.error(err);
            alert("Erreur lors de la création.");
            app.showLoading(false);
        }
    },
    async openGuildSwitcher() { app.showLoading(true); const guilds = await db.getAvailableGuilds(auth.user.email); app.showLoading(false); const cont = document.getElementById('guild-list-container'); if (cont) cont.innerHTML = guilds.map(g => `<div style="background:${g.id === app.guildId ? '#4a90e2' : '#0f3460'}; padding:10px; margin-bottom:5px; border-radius:5px; cursor:pointer;" onclick="app.switchGuild('${g.id}')"><strong>${g.meta.guildName}</strong></div>`).join(''); app.showModal('guild-switcher-modal'); },
    async searchGuilds() { const qIn = document.getElementById('guild-search-input'); const q = qIn ? qIn.value : ''; if (!q) return; app.showLoading(true); const results = await db.searchPublicGuilds(q); app.showLoading(false); const resEl = document.getElementById('guild-search-results'); if (resEl) resEl.innerHTML = results.length ? results.map(g => `<div style="background:#222; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between; align-items:center;"><span>${g.meta.guildName}</span><button class="action-btn" style="width:auto; padding:5px 10px;" onclick="app.handleJoinLink('${g.id}')">Rejoindre</button></div>`).join('') : "<p>Rien trouvé.</p>"; },
    async copyInviteLink() { const url = `${window.location.origin}${window.location.pathname}?join=${app.guildId}`; await navigator.clipboard.writeText(url); alert("Lien copié !"); },
    switchGuild(id) { localStorage.setItem('currentGuildId', id); window.location.reload(); },
    async toggleGuildPublic() { app.data.meta.isPublic = !app.data.meta.isPublic; await app.save(); app.syncSettingsUI(); },
    async leaveGuild() { 
        if (!confirm("Voulez-vous vraiment quitter cette Guilde ?\nSi vous êtes le chef, le pouvoir sera transmis à l'aventurier le plus valeureux.")) return;
        
        app.showLoading(true);
        try {
            const userId = app.mainUser.id;
            const isOwner = app.isOwner(userId);
            
            // On retire l'utilisateur de la liste
            app.data.users = app.data.users.filter(u => u.id !== userId);
            
            // On retire l'utilisateur de la liste des admins
            if (app.data.meta.admins) {
                app.data.meta.admins = app.data.meta.admins.filter(id => id !== userId);
            }

            if (app.data.users.length === 0) {
                // Dernier membre : On supprime la guilde
                await db.deleteGuild(app.guildId);
            } else {
                if (isOwner) {
                    // Transfert de propriété
                    const admins = app.data.meta.admins || [];
                    
                    // Tri pour trouver le successeur : 
                    // 1. Admins d'abord
                    // 2. Plus haut niveau ensuite
                    const candidates = [...app.data.users].sort((a, b) => {
                        const isAAdmin = admins.includes(a.id);
                        const isBAdmin = admins.includes(b.id);
                        if (isAAdmin && !isBAdmin) return -1;
                        if (!isAAdmin && isBAdmin) return 1;
                        return (b.level || 1) - (a.level || 1);
                    });

                    const successor = candidates[0];
                    app.data.meta.owner = successor.email || ""; // Si c'est un écuyer sans email, l'admin pourra toujours gérer via son ID
                    app.data.meta.createdBy = successor.id;
                    
                    // On s'assure que le successeur est admin
                    if (!admins.includes(successor.id)) {
                        app.data.meta.admins.push(successor.id);
                    }

                    app.data.questLog.unshift({ 
                        id: 'log_succession_'+Date.now(), 
                        type: 'system', 
                        title: `Nouveau Chef : ${successor.name} prend les rênes !`, 
                        completedBy: userId, 
                        completedAt: new Date().toISOString(), 
                        xpEarned: 0 
                    });
                } else {
                    app.data.questLog.unshift({ 
                        id: 'log_leave_'+Date.now(), 
                        type: 'system', 
                        title: `Départ : ${app.mainUser.name} a quitté l'aventure`, 
                        completedBy: userId, 
                        completedAt: new Date().toISOString(), 
                        xpEarned: 0 
                    });
                }
                
                await app.save();
            }

            localStorage.removeItem('currentGuildId');
            window.location.reload();
        } catch (err) {
            console.error(err);
            alert("Erreur lors du départ.");
            app.showLoading(false);
        }
    },
    async updateGuildSettings() { 
        if (!app.isAdmin()) return;
        if (!app.data) return; 
        // Name updated via renameGuild
        app.data.meta.isPublic = document.getElementById('edit-guild-public').value === 'true'; 
        app.data.meta.isOpen = document.getElementById('edit-guild-open').value === 'true'; 
        await app.save(); 
    },
    getQuestRarity(xp) { const maxXP = Math.max(...app.data.questDefinitions.map(d => d.baseXp), 10); const r = xp / maxXP; if (r >= 0.9) return 'rarity-legendary'; if (r >= 0.7) return 'rarity-epic'; if (r >= 0.4) return 'rarity-rare'; if (r >= 0.2) return 'rarity-uncommon'; return 'rarity-common'; }
};
app.init();