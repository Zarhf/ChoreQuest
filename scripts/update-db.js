const admin = require('firebase-admin');
const version = require('../version.json');

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('❌ ERROR: FIREBASE_SERVICE_ACCOUNT environment variable is missing.');
  console.log('Please add it to GitHub Secrets (Settings > Secrets > Actions).');
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  console.error('❌ ERROR: Invalid JSON or Base64 in FIREBASE_SERVICE_ACCOUNT secret.');
  console.error(e.message);
  process.exit(1);
}

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