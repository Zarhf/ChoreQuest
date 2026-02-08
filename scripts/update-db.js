const admin = require('firebase-admin');
const version = require('../version.json');

// Get service account from environment variable (Base64 encoded)
const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function updateSystemConfig() {
  const build = version.build;
  console.log(`🚀 Deploying Build ${build} to Firestore...`);
  
  try {
    await db.collection('system').doc('config').set({
      minBuild: build,
      lastUpdate: new Date().toISOString(),
      deployedBy: 'GitHub Actions'
    }, { merge: true });
    console.log(`✅ SUCCESS: System minBuild set to ${build}`);
  } catch (error) {
    console.error('❌ ERROR updating Firestore:', error);
    process.exit(1);
  }
}

updateSystemConfig();