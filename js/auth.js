const auth = {
    user: null,

    init(onAuthStateChanged) {
        firebase.initializeApp(CONFIG.firebase);
        db.init();

        firebase.auth().onAuthStateChanged((user) => {
            this.user = user;
            const elEmail = document.getElementById('user-email-display');
            const btnGuild = document.getElementById('guild-btn');
            const btnProfile = document.getElementById('profile-btn');
            const elWelcome = document.getElementById('welcome-screen');
            const elContent = document.getElementById('content');

            if (user) {
                if (elEmail) elEmail.innerText = user.email;
                if (btnGuild) btnGuild.classList.remove('hidden');
                if (btnProfile) btnProfile.classList.remove('hidden');
                if (elWelcome) elWelcome.classList.add('hidden');
            } else {
                if (btnGuild) btnGuild.classList.add('hidden');
                if (btnProfile) btnProfile.classList.add('hidden');
                if (elWelcome) elWelcome.classList.remove('hidden');
                if (elContent) elContent.classList.add('hidden');
            }
            onAuthStateChanged(user);
        });
    },

    login() {
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(provider).catch(err => {
            console.error("Login failed", err);
            alert("Erreur de connexion Google.");
        });
    },

    logout() {
        firebase.auth().signOut().then(() => {
            window.location.reload();
        });
    }
};