const app = {
    dbFileId: null,
    data: null,
    currentUser: null,
    clickCount: 0,

    async init() {
        this.showLoading(true);
        try {
            this.dbFileId = await DriveAPI.findDBFile();
            if (this.dbFileId) {
                this.data = await DriveAPI.readFile(this.dbFileId);
            } else {
                this.data = this.getInitialData();
                this.dbFileId = await DriveAPI.createDBFile(this.data);
            }

            if (this.data.users.length === 0) {
                this.showModal('onboarding-modal');
            } else {
                // Load last used user or first one
                const lastUserId = localStorage.getItem('lastUserId');
                this.currentUser = this.data.users.find(u => u.id === lastUserId) || this.data.users[0];
                this.render();
            }
        } catch (err) {
            console.error("Initialization failed:", err);
            alert("Erreur de connexion. Veuillez rafraîchir la page.");
        } finally {
            this.showLoading(false);
        }
    },

    getInitialData() {
        return {
            meta: { version: 2, created_at: new Date().toISOString() },
            users: [],
            tasks: [
                { id: Date.now(), title: 'Première Quête : Configurer ChoreQuest', xp: 50 }
            ]
        };
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
        const newUser = {
            id: 'u' + Date.now(),
            name: name,
            avatar: avatar,
            xp: 0,
            level: 1
        };
        this.data.users.push(newUser);
        this.currentUser = newUser;
        localStorage.setItem('lastUserId', newUser.id);
        this.saveAndRender();
    },

    switchUser(userId) {
        const user = this.data.users.find(u => u.id === userId);
        if (user) {
            this.currentUser = user;
            localStorage.setItem('lastUserId', user.id);
            this.render();
            this.hideModals();
        }
    },

    deleteUser(userId) {
        if (!confirm("Supprimer ce héros ? Toute sa progression sera perdue.")) return;
        
        this.data.users = this.data.users.filter(u => u.id !== userId);
        
        if (this.currentUser.id === userId) {
            this.currentUser = this.data.users[0] || null;
        }

        if (!this.currentUser) {
            this.showModal('onboarding-modal');
        } else {
            localStorage.setItem('lastUserId', this.currentUser.id);
        }
        
        this.saveAndRender();
        this.renderDevMode(); // Refresh dev view
    },

    // --- Game Logic ---
    async completeTask(taskId) {
        const taskIndex = this.data.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const task = this.data.tasks[taskIndex];
        this.currentUser.xp += parseInt(task.xp);
        
        const xpNeeded = this.currentUser.level * 100;
        if (this.currentUser.xp >= xpNeeded) {
            this.currentUser.level++;
            this.currentUser.xp -= xpNeeded;
            alert(`🎊 NIVEAU SUPÉRIEUR ! ${this.currentUser.name} est maintenant Niveau ${this.currentUser.level} !`);
        }

        this.data.tasks.splice(taskIndex, 1);
        await this.saveAndRender();
    },

    addQuest() {
        const title = document.getElementById('quest-title').value;
        const xp = document.getElementById('quest-difficulty').value;
        if (!title) return alert("Une quête a besoin d'un titre !");

        this.data.tasks.push({ id: Date.now(), title, xp: parseInt(xp) });
        this.saveAndRender();
        this.hideModals();
        document.getElementById('quest-title').value = '';
    },

    async checkForUpdates() {
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                await registration.update();
                alert("Vérification terminée. La page va se recharger.");
                window.location.reload();
            }
        }
    },

    // --- Partage ---
    async inviteMember() {
        const email = document.getElementById('invite-email').value;
        if (!email || !email.includes('@')) return alert("Veuillez saisir un email valide.");

        this.showLoading(true);
        try {
            await DriveAPI.shareFile(this.dbFileId, email);
            alert(`Succès ! Le fichier a été partagé avec ${email}. Cette personne peut maintenant se connecter à ChoreQuest.`);
            document.getElementById('invite-email').value = '';
        } catch (err) {
            alert("Erreur lors du partage. Vérifiez l'adresse email.");
        } finally {
            this.showLoading(false);
        }
    },

    async saveAndRender() {
        this.render();
        if (this.dbFileId) {
            await DriveAPI.updateFile(this.dbFileId, this.data);
        }
    },

    // --- Dev Mode ---
    toggleDevMode() {
        if (this.devTimer) clearTimeout(this.devTimer);
        this.clickCount++;
        
        if (this.clickCount >= 5) {
            this.clickCount = 0;
            if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(50);
            this.renderDevMode();
            this.showModal('dev-modal');
        } else {
            this.devTimer = setTimeout(() => {
                this.clickCount = 0;
            }, 1000);
        }
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
        document.getElementById('debug-meta').textContent = JSON.stringify(this.data.meta, null, 2);
    },

    // --- UI Rendering ---
    render() {
        if (!this.currentUser) return;

        document.getElementById('content').classList.remove('hidden');
        document.getElementById('welcome-screen').classList.add('hidden');
        
        // Profile
        document.getElementById('user-name').innerText = this.currentUser.name;
        document.getElementById('user-avatar').innerText = this.currentUser.avatar;
        document.getElementById('user-level').innerText = this.currentUser.level;
        document.getElementById('user-xp').innerText = this.currentUser.xp;
        
        const xpNeeded = this.currentUser.level * 100;
        document.getElementById('next-level-xp').innerText = xpNeeded;
        document.getElementById('xp-progress').style.width = `${(this.currentUser.xp / xpNeeded) * 100}%`;

        // Quests
        const list = document.getElementById('task-list');
        list.innerHTML = this.data.tasks.length === 0 ? 
            '<p style="text-align:center; opacity:0.5;">Le tableau est vide.</p>' : 
            this.data.tasks.map(t => `
                <div class="quest-card">
                    <div class="quest-info">
                        <h4>${t.title}</h4>
                        <span>💰 ${t.xp} XP</span>
                    </div>
                    <button class="complete-btn" onclick="app.completeTask(${t.id})">Valider</button>
                </div>
            `).join('');
    },

    showLoading(show) {
        document.getElementById('loading').classList.toggle('hidden', !show);
    },

    showModal(id) {
        document.getElementById(id).classList.remove('hidden');
    },

    hideModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const authBtn = document.getElementById('authorize_button');
    const logoutBtn = document.getElementById('signout_button');
    if(authBtn) authBtn.onclick = handleAuthClick;
    if(logoutBtn) logoutBtn.onclick = handleSignoutClick;
});