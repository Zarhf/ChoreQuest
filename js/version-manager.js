const VersionManager = {
    async check() {
        try {
            // Fetch version.json with a timestamp to bypass ALL caches
            const response = await fetch('version.json?t=' + Date.now(), { cache: "no-store" });
            const serverConfig = await response.json();
            
            const localBuild = localStorage.getItem('app_build');

            if (localBuild && parseInt(localBuild) < serverConfig.build) {
                console.log(`New version found: ${serverConfig.version} (Build ${serverConfig.build})`);
                await this.update(serverConfig.build);
            } else {
                localStorage.setItem('app_build', serverConfig.build);
                console.log(`App is up to date (Build ${serverConfig.build})`);
            }
        } catch (e) {
            console.warn("Version check failed (Offline?)", e);
        }
    },

    async update(newBuild) {
        console.log("Forcing update...");
        
        // 1. Unregister Service Workers
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
        }

        // 2. Clear Caches
        if ('caches' in window) {
            const names = await caches.keys();
            for (let name of names) {
                await caches.delete(name);
            }
        }

        // 3. Update Local Version
        localStorage.setItem('app_build', newBuild);

        // 4. Hard Reload
        alert(`Mise à jour v${newBuild} installée !`);
        window.location.reload(true);
    }
};

// Check immediately
VersionManager.check();