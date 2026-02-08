const db = {
    firestore: null,
    unsubscribe: null,

    init() {
        this.firestore = firebase.firestore();
    },

    // Listen to guild changes in real-time
    listenToGuild(guildId, callback) {
        if (this.unsubscribe) this.unsubscribe();
        
        this.unsubscribe = this.firestore.collection('guilds').doc(guildId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    callback(doc.data());
                } else {
                    console.error("Guild not found");
                }
            }, (err) => {
                console.error("Firestore Listen Error:", err);
            });
    },

    async getAvailableGuilds(userEmail) {
        // Find guilds where user is a member
        const snapshot = await this.firestore.collection('guilds')
            .where('memberEmails', 'array-contains', userEmail)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async searchPublicGuilds(queryText) {
        // Simple search: find guilds that are public OR match exactly by ID
        // Note: Firestore doesn't support full-text search natively without Algolia/Typesense.
        // We'll search by exact ID first, then scan public guilds (limit 20)
        
        const results = [];

        // 1. Try exact ID match
        const docRef = await this.firestore.collection('guilds').doc(queryText).get();
        if (docRef.exists) {
            const data = docRef.data();
            if (data.meta.isPublic || data.meta.isOpen) {
                results.push({ id: docRef.id, ...data });
            }
        }

        // 2. If text search (simulation for small scale app)
        if (queryText.length > 2) {
            const snapshot = await this.firestore.collection('guilds')
                .where('meta.isPublic', '==', true)
                .limit(20)
                .get();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.meta.guildName.toLowerCase().includes(queryText.toLowerCase()) && doc.id !== queryText) {
                    results.push({ id: doc.id, ...data });
                }
            });
        }

        return results;
    },

    async createGuild(ownerEmail, name, isPublic = false) {
        const newGuild = {
            meta: {
                version: 3,
                created_at: new Date().toISOString(),
                guildName: name || "Nouvelle Guilde",
                owner: ownerEmail,
                isPublic: isPublic, // Visible in search
                isOpen: true        // Can be joined
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
        // Ensure memberEmails is synchronized with users if needed
        const emails = data.users.map(u => u.email).filter(e => !!e);
        if (data.meta.owner && !emails.includes(data.meta.owner)) {
            emails.push(data.meta.owner);
        }
        data.memberEmails = [...new Set(emails)]; // Unique emails

        await this.firestore.collection('guilds').doc(guildId).set(data);
    },

    async joinGuild(guildId, userEmail) {
        const docRef = this.firestore.collection('guilds').doc(guildId);
        const doc = await docRef.get();
        if (doc.exists) {
            const data = doc.data();
            if (!data.memberEmails.includes(userEmail)) {
                data.memberEmails.push(userEmail);
                await docRef.update({ memberEmails: data.memberEmails });
            }
            return true;
        }
        return false;
    }
};