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
        // Find guilds where user is a member or owner
        const snapshot = await this.firestore.collection('guilds')
            .where('memberEmails', 'array-contains', userEmail)
            .get();
        
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async createGuild(ownerEmail, name) {
        const newGuild = {
            meta: {
                version: 3,
                created_at: new Date().toISOString(),
                guildName: name || "Ma Guilde",
                owner: ownerEmail
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