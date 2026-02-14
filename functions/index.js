const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

admin.initializeApp();
const db = admin.firestore();

// Options globales (Région par défaut)
setGlobalOptions({ region: "us-central1" });

// --- Helpers ---
async function sendPushToUser(email, title, body, data = {}) {
    logger.info(`Attempting to send push to ${email}`);
    const tokenDoc = await db.collection("push_tokens").doc(email).get();
    
    if (!tokenDoc.exists) {
        logger.warn(`No push token found for user ${email}`);
        return null;
    }
    
    const token = tokenDoc.data().token;
    logger.info(`Token found for ${email}: ${token.substring(0, 10)}...${token.substring(token.length - 5)}`);

    const message = {
        notification: { title, body },
        data: {
            ...data,
            title: title,
            body: body,
            click_action: "https://zarhf.github.io/ChoreQuest/"
        },
        token: token,
        webpush: {
            notification: {
                icon: "icons/icon.svg",
                badge: "icons/icon.svg"
            }
        }
    };

    try {
        await admin.messaging().send(message);
        logger.info(`Notification sent successfully to ${email}`);
        return true;
    } catch (error) {
        logger.error(`Error sending to ${email}:`, error);
        if (error.code === 'messaging/registration-token-not-registered') {
            await db.collection("push_tokens").doc(email).delete();
        }
        return false;
    }
}

async function sendToGuildMembers(guildData, title, body, excludeEmail = null) {
    const members = guildData.users || [];
    const ownerEmail = guildData.meta.owner;
    const emails = new Set(members.map(u => u.email).filter(e => !!e));
    if (ownerEmail) emails.add(ownerEmail);

    for (const email of emails) {
        if (email === excludeEmail) continue;
        await sendPushToUser(email, title, body);
    }
}

// --- Triggers v2 ---

exports.testnotification = onCall(async (request) => {
    const email = request.auth.token.email;
    logger.info(`Test notification requested for email: ${email}`);
    
    if (!email) {
        logger.error("No email found in auth token");
        return { success: false, error: "No email in auth token" };
    }
    
    const result = await sendPushToUser(email, "🛡️ Test ChoreQuest", "Si tu vois ce message, les notifications fonctionnent !");
    return { success: !!result, info: result ? "Sent" : "No token found" };
});

exports.remindvoters = onCall(async (request) => {
    const { guildId, questTitle, voterIds } = request.data;
    const callerEmail = request.auth.token.email;
    
    if (!guildId || !voterIds || voterIds.length === 0) return { success: false };

    const guildDoc = await db.collection("guilds").doc(guildId).get();
    if (!guildDoc.exists) return { success: false };
    const guildData = guildDoc.data();

    const callerName = (guildData.users || []).find(u => u.email === callerEmail)?.name || "Un membre";

    for (const uid of voterIds) {
        const user = guildData.users.find(u => u.id === uid);
        if (user && user.email) {
            await sendPushToUser(user.email, "🔔 Rappel du Conseil", `${callerName} attend ton vote pour : ${questTitle}`);
        }
    }

    return { success: true };
});

exports.onguildupdate = onDocumentUpdated("guilds/{guildId}", async (event) => {
    const newData = event.data.after.data();
    const oldData = event.data.before.data();

    if (!newData || !oldData) return null;

    // 1. Détecter une nouvelle quête en attente
    const newQuests = (newData.questDefinitions || []).filter(nd => 
        nd.status === 'pending' && 
        !(oldData.questDefinitions || []).find(od => od.id === nd.id)
    );

    for (const q of newQuests) {
        const creator = (newData.users || []).find(u => u.id === q.createdBy)?.name || "Un membre";
        await sendToGuildMembers(newData, "📜 Nouveau Parchemin", `${creator} propose : ${q.title}. Ton vote est attendu !`, q.createdBy);
    }

    // 2. Détecter un vol
    for (const nq of (newData.activeQuests || [])) {
        const oq = (oldData.activeQuests || []).find(o => o.id === nq.id);
        if (oq && nq.assignedTo !== oq.assignedTo && nq.stealDeadline) {
            const victim = (oldData.users || []).find(u => u.id === oq.assignedTo);
            const thief = (newData.users || []).find(u => u.id === nq.assignedTo)?.name || "Un voleur";
            if (victim && victim.email) {
                await sendPushToUser(victim.email, "🥷 Quête Volée !", `${thief} a récupéré ton contrat : ${nq.title}.`);
            }
        }
    }

    // 3. Mission Royale
    const newRoyals = (newData.questDefinitions || []).filter(nd => 
        nd.isRoyal && nd.status === 'pending' && 
        !(oldData.questDefinitions || []).find(od => od.id === nd.id)
    );
    for (const q of newRoyals) {
        await sendToGuildMembers(newData, "👑 Décret Royal", `Une Mission Royale a été proclamée : ${q.title} !`);
    }

    return null;
});

// --- Rappels v2 ---
exports.scheduledreminders = onSchedule("every 15 minutes", async (event) => {
    const now = new Date();
    const guildsSnapshot = await db.collection("guilds").get();

    for (const doc of guildsSnapshot.docs) {
        const guild = doc.data();
        for (const q of (guild.activeQuests || [])) {
            if (q.status !== 'active' || !q.dueDate) continue;
            
            const due = new Date(q.dueDate);
            const diffMin = (now - due) / 60000;

            if (diffMin > 0 && diffMin < 20) {
                const assignee = (guild.users || []).find(u => u.id === q.assignedTo);
                if (assignee && assignee.email) {
                    await sendPushToUser(assignee.email, "⏳ Quête en retard", `Attention ! ${q.title} est en retard. Elle pourra être volée bientôt !`);
                } else if (!q.assignedTo) {
                    await sendToGuildMembers(guild, "☝️ Quête libre en retard", `La quête ${q.title} attend toujours un héros !`);
                }
            }
        }
    }
});
