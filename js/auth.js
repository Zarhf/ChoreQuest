let tokenClient;
let gapiInited = false;
let gisInited = false;

// 1. Load GAPI (Google API Client)
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        // apiKey: CONFIG.API_KEY, // Optional for this flow
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
    });
    gapiInited = true;
    checkAuthStatus();
}

// 2. Load GIS (Google Identity Services)
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
    checkAuthStatus();
}

// 3. Check if both are ready
function checkAuthStatus() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.display = 'block';
        document.getElementById('welcome-screen').style.display = 'block';
    }
}

// 4. Handle Login
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        document.getElementById('authorize_button').style.display = 'none';
        document.getElementById('signout_button').style.display = 'block';
        document.getElementById('welcome-screen').style.display = 'none';
        
        // Start App Logic
        await app.init();
    };

    if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when establishing a new session.
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        // Skip display of account chooser and consent dialog for an existing session.
        tokenClient.requestAccessToken({prompt: ''});
    }
}

// 5. Handle Logout
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('content').style.display = 'none';
        document.getElementById('authorize_button').style.display = 'block';
        document.getElementById('signout_button').style.display = 'none';
        document.getElementById('welcome-screen').style.display = 'block';
    }
}

// Expose functions to global scope for button clicks
window.handleAuthClick = handleAuthClick;
window.handleSignoutClick = handleSignoutClick;

// Initialize when scripts load
gapiLoaded();
gisLoaded();