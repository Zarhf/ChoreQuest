let tokenClient;
let gapiInited = false;
let gisInited = false;

/**
 * Persistance du Token
 */
function saveToken(tokenResponse) {
    if (tokenResponse && tokenResponse.access_token) {
        const expiry = Date.now() + (tokenResponse.expires_in * 1000);
        localStorage.setItem('google_access_token', tokenResponse.access_token);
        localStorage.setItem('google_token_expiry', expiry);
    }
}

function loadSavedToken() {
    const token = localStorage.getItem('google_access_token');
    const expiry = localStorage.getItem('google_token_expiry');
    
    if (token && expiry && Date.now() < parseInt(expiry)) {
        return { access_token: token };
    }
    return null;
}

function waitForObject(objectName, callback, timeout = 5000) {
    const start = Date.now();
    const interval = setInterval(() => {
        if (window[objectName] || (objectName.includes('.') && getDescendantProp(window, objectName))) {
            clearInterval(interval);
            callback();
        } else if (Date.now() - start > timeout) {
            clearInterval(interval);
            console.error(`Timeout waiting for ${objectName}`);
        }
    }, 100);
}

function getDescendantProp(obj, desc) {
    const arr = desc.split(".");
    while(arr.length && (obj = obj[arr.shift()]));
    return obj;
}

// 1. Initialize GAPI
function gapiLoaded() {
    if (typeof gapi === 'undefined') {
        waitForObject('gapi', gapiLoaded);
        return;
    }
    gapi.load('client:picker', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
    });
    gapiInited = true;
    checkAuthStatus();
}

// 2. Initialize GIS
function gisLoaded() {
    if (typeof google === 'undefined' || !google.accounts) {
        waitForObject('google.accounts.oauth2', gisLoaded);
        return;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: '', 
    });
    gisInited = true;
    checkAuthStatus();
}

// 3. Check if both are ready
async function checkAuthStatus() {
    if (gapiInited && gisInited) {
        const savedToken = loadSavedToken();
        if (savedToken) {
            console.log("Token valide trouvé, reconnexion auto...");
            gapi.client.setToken(savedToken);
            onLoginSuccess();
        } else {
            document.getElementById('welcome-screen').classList.remove('hidden');
            updateUIForAuth(false);
        }
    }
}

function updateUIForAuth(loggedIn) {
    const statusDot = document.getElementById('account-status');
    const statusText = document.getElementById('auth-status-text');
    const loginBtn = document.getElementById('login-modal-btn');
    const logoutBtn = document.getElementById('logout-modal-btn');
    const userSettings = document.getElementById('user-settings');

    if (loggedIn) {
        if (statusDot) statusDot.classList.add('online');
        if (statusText) statusText.innerText = "Connecté à Google Drive";
        if (loginBtn) loginBtn.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        if (userSettings) userSettings.classList.remove('hidden');
    } else {
        if (statusDot) statusDot.classList.remove('online');
        if (statusText) statusText.innerText = "Déconnecté";
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        if (userSettings) userSettings.classList.add('hidden');
    }
}

async function getUserProfile() {
    try {
        const response = await gapi.client.request({
            'path': 'https://www.googleapis.com/oauth2/v3/userinfo',
        });
        return response.result;
    } catch (err) {
        console.error("Error getting user profile", err);
        if (err.status === 401) {
            handleSignoutClick(); // Token expired or invalid scope, clear it
        }
        return null;
    }
}

async function onLoginSuccess() {
    updateUIForAuth(true);
    document.getElementById('welcome-screen').classList.add('hidden');
    
    // Fetch and store user email for logic mapping
    const profile = await getUserProfile();
    if (profile && profile.email) {
        localStorage.setItem('google_email', profile.email);
    }
    
    await app.init();
}

// 4. Handle Login
function handleAuthClick() {
    if (!tokenClient) return;

    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) throw (resp);
        saveToken(resp);
        onLoginSuccess();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

// 5. Handle Logout
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_token_expiry');
        
        document.getElementById('content').classList.add('hidden');
        document.getElementById('welcome-screen').classList.remove('hidden');
        updateUIForAuth(false);
        app.hideModals();
    }
}

window.addEventListener('load', () => {
    gapiLoaded();
    gisLoaded();
});

window.handleAuthClick = handleAuthClick;
window.handleSignoutClick = handleSignoutClick;