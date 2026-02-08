const VersionManager = {
    async check() {
        try {
            // Fetch v.json with cache busting
            const response = await fetch('v.json?t=' + Date.now(), { cache: "no-store" });
            const serverConfig = await response.json();
            
            const localBuild = parseInt(localStorage.getItem('app_build') || '0');

            if (serverConfig.build > localBuild) {
                console.log(`Auto-Update: Detected Build ${serverConfig.build}. Updating from ${localBuild}...`);
                await this.update(serverConfig.build);
            }
        } catch (e) {
            console.warn("Version check failed", e);
        }
    },

    async update(newBuild) {
        localStorage.setItem('app_build', newBuild.toString());

        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
        }

        if ('caches' in window) {
            const names = await caches.keys();
            for (let name of names) {
                await caches.delete(name);
            }
        }

        // Nuclear reload
        window.location.href = window.location.origin + window.location.pathname + '?v80_sync=' + Date.now();
    }
};

VersionManager.check();
setInterval(() => VersionManager.check(), 1000 * 60 * 5);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') VersionManager.check();
});