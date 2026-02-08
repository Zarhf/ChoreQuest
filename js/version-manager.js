const VersionManager = {
    async check() {
        try {
            const response = await fetch('version.json?t=' + Date.now(), { cache: "no-store" });
            const serverConfig = await response.json();
            
            const localBuild = localStorage.getItem('app_build');

            if (localBuild && parseInt(localBuild) < serverConfig.build) {
                console.log(`Auto-Update: New version detected (Build ${serverConfig.build}). Reloading...`);
                await this.update(serverConfig.build);
            } else {
                localStorage.setItem('app_build', serverConfig.build);
            }
        } catch (e) {
            console.warn("Version check failed", e);
        }
    },

    async update(newBuild) {
        localStorage.setItem('app_build', newBuild);

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

        // Silent reload with unique timestamp
        window.location.href = window.location.origin + window.location.pathname + '?force_v=' + Date.now();
    }
};

// Check on load
VersionManager.check();

// Check every 5 minutes
setInterval(() => VersionManager.check(), 1000 * 60 * 5);

// Check when app comes back from background
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') VersionManager.check();
});