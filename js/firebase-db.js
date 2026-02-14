const db = {
    firestore: null,
    messaging: null,
    functions: null,
    unsubscribe: null,

    init() {
        this.firestore = firebase.firestore();
        this.functions = firebase.functions("us-central1");
        try {
            this.messaging = firebase.messaging();
        } catch (e) {
            console.warn("FCM not supported in this browser or environment.");
        }
    },

    async saveUserToken(userEmail, token) {
        // On enregistre le token dans une collection globale ou directement dans la guilde.
        // Pour être efficace, on va le stocker dans un document utilisateur dédié pour les notifications.
        try {
            await this.firestore.collection('push_tokens').doc(userEmail).set({
                token: token,
                updatedAt: new Date().toISOString(),
                platform: navigator.platform
            }, { merge: true });
        } catch (e) {
            console.error("Error saving push token:", e);
        }
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
                version: 4,
                created_at: new Date().toISOString(),
                guildName: name || "Nouvelle Guilde",
                owner: ownerEmail,
                isPublic: isPublic, 
                isOpen: isOpen        
            },
            currency: {
                name: "Écus",
                symbol: "🪙"
            },
            ranks: [
                { minLevel: 1, title: "Roturier" },
                { minLevel: 5, title: "Écuyer" },
                { minLevel: 10, title: "Chevalier" },
                { minLevel: 20, title: "Héros" },
                { minLevel: 50, title: "Légende" }
            ],
            market: [
                {
                    id: 'royal_bounty',
                    title: 'Mission Royale',
                    cost: 0,
                    description: 'Quête spéciale créée par le chef de guilde.',
                    icon: '👑',
                    isSpecial: true
                }
            ],
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
        const emails = data.users.map(u => u.email).filter(e => !!e);
        if (data.meta.owner && !emails.includes(data.meta.owner)) emails.push(data.meta.owner);
        data.memberEmails = [...new Set(emails)];
        await this.firestore.collection('guilds').doc(guildId).set(data);
    },

    async joinGuild(guildId, userEmail) {
        const docRef = this.firestore.collection('guilds').doc(guildId);
        const doc = await docRef.get();
        if (!doc.exists) return { success: false, error: "Guilde introuvable." };
        
        const data = doc.data();
        if (data.memberEmails.includes(userEmail)) return { success: true, alreadyMember: true };

        if (data.meta.isOpen) {
            const logEntry = {
                id: 'log_' + Date.now(), type: 'system', title: 'Nouveau membre', completedBy: userEmail, completedAt: new Date().toISOString(), xpEarned: 0
            };
            await docRef.update({ 
                memberEmails: firebase.firestore.FieldValue.arrayUnion(userEmail),
                questLog: firebase.firestore.FieldValue.arrayUnion(logEntry)
            });
            return { success: true };
        }
        return { success: false, error: "Cette guilde est fermée (sur invitation uniquement)." };
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

    async deleteGuild(guildId) {
        await this.firestore.collection('guilds').doc(guildId).delete();
    },

    listenToSystemConfig(callback) {
        this.firestore.collection('system').doc('config').onSnapshot((doc) => {
            if (doc.exists) callback(doc.data());
            else callback({ minBuild: 0 }); 
        }, err => console.warn("No system config access"));
    },

    async setSystemConfig(buildNumber) {
        try {
            await this.firestore.collection('system').doc('config').set({ minBuild: buildNumber }, { merge: true });
        } catch (e) {
            console.warn("Could not set system config", e);
        }
    }
};