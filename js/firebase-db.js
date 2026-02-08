const db = {
    firestore: null,
    unsubscribe: null,

    init() {
        this.firestore = firebase.firestore();
    },

    listenToGuild(guildId, callback) {
        if (this.unsubscribe) this.unsubscribe();
        this.unsubscribe = this.firestore.collection('guilds').doc(guildId)
            .onSnapshot((doc) => {
                if (doc.exists) callback(doc.data());
            }, (err) => console.error("Firestore Listen Error:", err));
    },

    async getAvailableGuilds(userEmail) {
        const snapshot = await this.firestore.collection('guilds')
            .where('memberEmails', 'array-contains', userEmail)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async searchPublicGuilds(queryText) {
        const snapshot = await this.firestore.collection('guilds')
            .where('meta.isPublic', '==', true)
            .limit(20)
            .get();
        
        return snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(g => g.meta.guildName.toLowerCase().includes(queryText.toLowerCase()));
    },

    async createGuild(ownerEmail, name, isPublic = false, isOpen = true) {
        const newGuild = {
            meta: {
                version: 3,
                created_at: new Date().toISOString(),
                guildName: name || "Nouvelle Guilde",
                owner: ownerEmail,
                isPublic: isPublic, 
                isOpen: isOpen        
            },
            memberEmails: [ownerEmail],
            users: [],
            questDefinitions: [],
            activeQuests: [],
            questLog: []
        };
        const docRef = await this.firestore.collection('guilds').add(newGuild);
        return docRef.id;
    },

    async updateGuild(guildId, data) {
        // Sync memberEmails with users
        const emails = data.users.map(u => u.email).filter(e => !!e);
        if (data.meta.owner && !emails.includes(data.meta.owner)) emails.push(data.meta.owner);
        data.memberEmails = [...new Set(emails)];
        await this.firestore.collection('guilds').doc(guildId).set(data);
    },

    async joinGuild(guildId, userEmail) {
        const docRef = this.firestore.collection('guilds').doc(guildId);
        const doc = await docRef.get();
        if (doc.exists) {
            const data = doc.data();
            if (data.memberEmails.includes(userEmail)) return true;
            if (data.meta.isOpen) {
                const logEntry = {
                    id: 'log_' + Date.now(), type: 'system', title: 'Nouveau membre', completedBy: userEmail, completedAt: new Date().toISOString(), xpEarned: 0
                };
                await docRef.update({ 
                    memberEmails: firebase.firestore.FieldValue.arrayUnion(userEmail),
                    questLog: firebase.firestore.FieldValue.arrayUnion(logEntry)
                });
                return true;
            }
        }
        return false;
    },

    async leaveGuild(guildId, userEmail) {
        const docRef = this.firestore.collection('guilds').doc(guildId);
        const logEntry = {
            id: 'log_' + Date.now(), type: 'system', title: 'Départ', completedBy: userEmail, completedAt: new Date().toISOString(), xpEarned: 0
        };
        await docRef.update({ 
            memberEmails: firebase.firestore.FieldValue.arrayRemove(userEmail),
            questLog: firebase.firestore.FieldValue.arrayUnion(logEntry)
        });
    },

    // --- System Versioning (The Kill Switch) ---
    listenToSystemConfig(callback) {
        // We use a specific doc in 'system' collection for global config
        this.firestore.collection('system').doc('config').onSnapshot((doc) => {
            if (doc.exists) callback(doc.data());
            else callback({ minBuild: 0 }); 
        }, err => console.warn("No system config access"));
    },

    async setSystemConfig(buildNumber) {
        // Only works if rules allow it, but we try
        try {
            await this.firestore.collection('system').doc('config').set({ minBuild: buildNumber }, { merge: true });
        } catch (e) {
            console.warn("Could not set system config", e);
        }
    }
};