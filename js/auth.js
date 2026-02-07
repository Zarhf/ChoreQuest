let tokenClient;
let gapiInited = false;
let gisInited = false;

/**
 * Wait for an object to be defined on the window
 */
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
    gapi.load('client', initializeGapiClient);
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
        callback: '', // defined in handleAuthClick
    });
    gisInited = true;
    checkAuthStatus();
}

// 3. Check if both are ready
function checkAuthStatus() {
    if (gapiInited && gisInited) {
        const authBtn = document.getElementById('authorize_button');
        if (authBtn) authBtn.style.display = 'block';
    }
}

// 4. Handle Login
function handleAuthClick() {
    if (!tokenClient) {
        console.error("Token client not initialized");
        return;
    }

    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        document.getElementById('authorize_button').style.display = 'none';
        document.getElementById('signout_button').style.display = 'block';
        document.getElementById('welcome-screen').style.display = 'none';
        
        await app.init();
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
        document.getElementById('content').style.display = 'none';
        document.getElementById('authorize_button').style.display = 'block';
        document.getElementById('signout_button').style.display = 'none';
        document.getElementById('welcome-screen').style.display = 'block';
    }
}

// Start checking for libraries immediately
window.addEventListener('load', () => {
    gapiLoaded();
    gisLoaded();
});

// Expose functions
window.handleAuthClick = handleAuthClick;
window.handleSignoutClick = handleSignoutClick;