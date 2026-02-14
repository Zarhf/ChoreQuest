const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// --- Helpers ---
async function sendPushToUser(email, title, body, data = {}) {
    const tokenDoc = await db.collection("push_tokens").doc(email).get();
    if (!tokenDoc.exists) return;
    const token = tokenDoc.data().token;

    const message = {
        notification: { title, body },
        data: data,
        token: token
    };

    try {
        await admin.messaging().send(message);
        console.log(`Notification sent to ${email}`);
    } catch (error) {
        console.error(`Error sending to ${email}:`, error);
        if (error.code === 'messaging/registration-token-not-registered') {
            // Token expiré, on le supprime
            await db.collection("push_tokens").doc(email).delete();
        }
    }
}

async function sendToGuildMembers(guildData, title, body, excludeEmail = null, onlyAssignee = null) {
    const members = guildData.users || [];
    const ownerEmail = guildData.meta.owner;
    
    // Liste unique d'emails (users + owner)
    const emails = new Set(members.map(u => u.email).filter(e => !!e));
    if (ownerEmail) emails.add(ownerEmail);

    for (const email of emails) {
        if (email === excludeEmail) continue;
        if (onlyAssignee && email !== onlyAssignee) continue;
        await sendPushToUser(email, title, body);
    }
}

// --- Triggers ---

exports.onGuildUpdate = functions.firestore
    .document("guilds/{guildId}")
    .onUpdate(async (change, context) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        // 1. Détecter une nouvelle quête en attente (Conseil)
        const newQuests = newData.questDefinitions.filter(nd => 
            nd.status === 'pending' && 
            !oldData.questDefinitions.find(od => od.id === nd.id)
        );

        for (const q of newQuests) {
            const creator = newData.users.find(u => u.id === q.createdBy)?.name || "Un membre";
            await sendToGuildMembers(newData, "📜 Nouveau Parchemin", `${creator} propose : ${q.title}. Ton vote est attendu !`, q.createdBy);
        }

        // 2. Détecter une quête validée
        const validatedQuests = newData.activeQuests.filter(na => 
            na.status === 'active' && 
            oldData.activeQuests.find(oa => od.id === na.id && oa.status === 'pending')
        );
        // Note: La logique de comparaison d'objets complexes est simplifiée ici

        // 3. Détecter un vol (Changement d'assigné avec stealDeadline)
        for (const nq of newData.activeQuests) {
            const oq = oldData.activeQuests.find(o => o.id === nq.id);
            if (oq && nq.assignedTo !== oq.assignedTo && nq.stealDeadline) {
                const victim = oldData.users.find(u => u.id === oq.assignedTo);
                const thief = newData.users.find(u => u.id === nq.assignedTo)?.name || "Un voleur";
                if (victim && victim.email) {
                    await sendPushToUser(victim.email, "🥷 Quête Volée !", `${thief} a récupéré ton contrat : ${nq.title}.`);
                }
            }
        }

        // 4. Détecter une Mission Royale
        const newRoyals = newData.questDefinitions.filter(nd => 
            nd.isRoyal && nd.status === 'pending' && 
            !oldData.questDefinitions.find(od => od.id === nd.id)
        );
        for (const q of newRoyals) {
            await sendToGuildMembers(newData, "👑 Décret Royal", `Une Mission Royale a été proclamée : ${q.title} !`);
        }

        return null;
    });

// --- Rappels et Retards (Toutes les 15 minutes) ---
exports.scheduledReminders = functions.pubsub
    .schedule("every 15 minutes")
    .onRun(async (context) => {
        const now = new Date();
        const guilds = await db.collection("guilds").get();

        for (const doc of guilds.docs) {
            const guild = doc.data();
            for (const q of guild.activeQuests) {
                if (q.status !== 'active' || !q.dueDate) continue;
                
                const due = new Date(q.dueDate);
                const diffMin = (now - due) / 60000;

                // Alerte Retard (si pas déjà notifié récemment - idéalement stocker un flag dans la quête)
                if (diffMin > 0 && diffMin < 20) {
                    const assignee = guild.users.find(u => u.id === q.assignedTo);
                    if (assignee && assignee.email) {
                        await sendPushToUser(assignee.email, "⏳ Quête en retard", `Attention ! ${q.title} est en retard. Elle pourra être volée bientôt !`);
                    } else if (!q.assignedTo) {
                        await sendToGuildMembers(guild, "☝️ Quête libre en retard", `La quête ${q.title} attend toujours un héros !`);
                    }
                }
            }
        }
        return null;
    });
