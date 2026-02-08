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
        // Recherche simple par nom (insensible à la casse simulee)
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
            
            // If already a member, return true
            if (data.memberEmails.includes(userEmail)) {
                return true;
            }

            // If guild is open, add member
            if (data.meta.isOpen) {
                data.memberEmails.push(userEmail);
                await docRef.update({ memberEmails: data.memberEmails });
                return true;
            }
        }
        return false;
    }
};