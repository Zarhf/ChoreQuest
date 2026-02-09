const VersionManager = {
    async checkVersion() {
        try {
            const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
            const remote = await res.json();
            const localBuild = parseInt(localStorage.getItem('app_build') || '0');
            
            console.log(`🔍 Version Check: Local ${localBuild} vs Remote ${remote.build}`);

            if (remote.build > localBuild) {
                console.log('🚀 New version detected! Nuke sequence initiated.');
                await this.nukeCache();
                localStorage.setItem('app_build', remote.build);
                window.location.reload(true);
            }
        } catch (e) {
            console.error('Version check failed', e);
        }
    },

    async nukeCache() {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
        }
        
        if (window.caches) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }
        
        console.log('💥 Cache cleared.');
    }
};

window.VersionManager = VersionManager;