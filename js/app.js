const app = {
    dbFileId: null,
    data: null,

    async init() {
        document.getElementById('loading').style.display = 'block';
        
        // 1. Check if DB exists
        this.dbFileId = await DriveAPI.findDBFile();

        if (this.dbFileId) {
            console.log('DB found, loading...');
            this.data = await DriveAPI.readFile(this.dbFileId);
        } else {
            console.log('No DB found, creating new one...');
            this.data = this.getInitialData();
            this.dbFileId = await DriveAPI.createDBFile(this.data);
        }

        this.render();
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
    },

    getInitialData() {
        return {
            meta: {
                version: 1,
                created_at: new Date().toISOString()
            },
            users: [],
            tasks: [
                { id: 1, title: 'Example Quest: Do the dishes', xp: 10 }
            ]
        };
    },

    render() {
        const list = document.getElementById('task-list');
        list.innerHTML = '';
        
        if (this.data.tasks.length === 0) {
            list.innerHTML = '<li>No active quests.</li>';
            return;
        }

        this.data.tasks.forEach(task => {
            const li = document.createElement('li');
            li.className = 'task-item';
            li.innerHTML = `
                <span>${task.title} <small>(${task.xp} XP)</small></span>
                <button onclick="console.log('Complete ${task.id}')">Complete</button>
            `;
            list.appendChild(li);
        });
    }
};

// Event Listeners for UI
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('authorize_button').onclick = handleAuthClick;
    document.getElementById('signout_button').onclick = handleSignoutClick;
});