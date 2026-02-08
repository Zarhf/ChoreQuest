const VersionManager = {
    async check() {
        try {
            const response = await fetch('version.json?t=' + Date.now(), { cache: "no-store" });
            const serverConfig = await response.json();
            
            const localBuild = localStorage.getItem('app_build');

            if (!localBuild || parseInt(localBuild) < serverConfig.build) {
                console.log(`New version detected: Build ${serverConfig.build}. Updating...`);
                await this.update(serverConfig.build);
            } else {
                console.log(`App is up to date (Build ${serverConfig.build})`);
            }
        } catch (e) {
            console.warn("Version check failed", e);
        }
    },

    async update(newBuild) {
        // 1. Mark as updating to avoid loops
        localStorage.setItem('app_build', newBuild);

        // 2. Unregister SW
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
        }

        // 3. Clear Caches
        if ('caches' in window) {
            const names = await caches.keys();
            for (let name of names) {
                await caches.delete(name);
            }
        }

        // 4. Force Reload with cache-busting query param
        console.log("Reloading for new version...");
        window.location.href = window.location.origin + window.location.pathname + '?v=' + newBuild;
    }
};

VersionManager.check();