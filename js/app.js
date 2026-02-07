const app = {
    dbFileId: null,
    data: null,
    currentUser: null,
    clickCount: 0, // For dev mode activation

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

            // Check if we have a user
            if (this.data.users.length === 0) {
                this.showModal('onboarding-modal');
            } else {
                // TODO: Handle multiple users later, for now pick the first one
                this.currentUser = this.data.users[0]; 
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

    // --- Onboarding ---
    finishOnboarding() {
        const name = document.getElementById('new-user-name').value;
        const avatar = document.getElementById('new-user-avatar').value;

        if (!name) return alert("Votre héros doit avoir un nom !");

        this.currentUser = {
            id: 'u' + Date.now(),
            name: name,
            avatar: avatar,
            xp: 0,
            level: 1
        };

        this.data.users.push(this.currentUser);
        this.saveAndRender();
        this.hideModals();
    },

    // --- Game Logic ---
    async completeTask(taskId) {
        const taskIndex = this.data.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) return;

        const task = this.data.tasks[taskIndex];
        
        // Update XP
        this.currentUser.xp += parseInt(task.xp);
        
        // Level up logic: Level * 100
        const xpNeeded = this.currentUser.level * 100;
        if (this.currentUser.xp >= xpNeeded) {
            this.currentUser.level++;
            this.currentUser.xp -= xpNeeded;
            alert(`🎊 NIVEAU SUPÉRIEUR ! Vous êtes maintenant Niveau ${this.currentUser.level} !`);
        }

        // Remove task
        this.data.tasks.splice(taskIndex, 1);

        await this.saveAndRender();
    },

    addQuest() {
        const title = document.getElementById('quest-title').value;
        const xp = document.getElementById('quest-difficulty').value;

        if (!title) return alert("Une quête a besoin d'un titre !");

        const newTask = {
            id: Date.now(),
            title: title,
            xp: parseInt(xp)
        };

        this.data.tasks.push(newTask);
        this.saveAndRender();
        this.hideModals();
        
        // Clear form
        document.getElementById('quest-title').value = '';
    },

    async saveAndRender() {
        this.render();
        await DriveAPI.updateFile(this.dbFileId, this.data);
    },

    // --- Dev Mode ---
    toggleDevMode() {
        this.clickCount++;
        if (this.clickCount >= 3) { // Triple click on title
            this.clickCount = 0;
            this.renderDevMode();
            this.showModal('dev-modal');
        }
        // Reset count after 1s
        setTimeout(() => this.clickCount = 0, 1000);
    },

    renderDevMode() {
        if (!this.data) return;

        // Render Users Table
        const userHTML = this.data.users.map(u => 
            `<div>${u.avatar} <b>${u.name}</b> (Lvl ${u.level} - ${u.xp} XP) [ID: ${u.id}]</div>`
        ).join('');
        document.getElementById('debug-users').innerHTML = userHTML || 'Aucun utilisateur';

        // Render Tasks Table
        const taskHTML = this.data.tasks.map(t => 
            `<div>- <b>${t.title}</b> (${t.xp} XP) [ID: ${t.id}]</div>`
        ).join('');
        document.getElementById('debug-tasks').innerHTML = taskHTML || 'Aucune tâche';

        // Render Meta
        document.getElementById('debug-meta').textContent = JSON.stringify(this.data.meta, null, 2);
    },

    // --- UI Rendering ---
    render() {
        document.getElementById('content').classList.remove('hidden');
        
        // Render Profile
        document.getElementById('user-name').innerText = this.currentUser.name;
        document.getElementById('user-avatar').innerText = this.currentUser.avatar;
        document.getElementById('user-level').innerText = this.currentUser.level;
        document.getElementById('user-xp').innerText = this.currentUser.xp;
        
        const xpNeeded = this.currentUser.level * 100;
        document.getElementById('next-level-xp').innerText = xpNeeded;
        
        const progressPercent = (this.currentUser.xp / xpNeeded) * 100;
        document.getElementById('xp-progress').style.width = `${progressPercent}%`;

        // Render Quests
        const list = document.getElementById('task-list');
        list.innerHTML = '';
        
        if (this.data.tasks.length === 0) {
            list.innerHTML = '<p style="text-align:center; opacity:0.5;">Le tableau de quêtes est vide. Ajoutez une nouvelle quête !</p>';
            return;
        }

        this.data.tasks.forEach(task => {
            const card = document.createElement('div');
            card.className = 'quest-card';
            card.innerHTML = `
                <div class="quest-info">
                    <h4>${task.title}</h4>
                    <span>💰 ${task.xp} XP</span>
                </div>
                <button class="complete-btn" onclick="app.completeTask(${task.id})">Valider</button>
            `;
            list.appendChild(card);
        });
    },

    // --- UI Helpers ---
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

// Event Listeners for Auth
document.addEventListener('DOMContentLoaded', () => {
    const authBtn = document.getElementById('authorize_button');
    const logoutBtn = document.getElementById('signout_button');
    
    if(authBtn) authBtn.onclick = handleAuthClick;
    if(logoutBtn) logoutBtn.onclick = handleSignoutClick;
});