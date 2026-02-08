const auth = {
    user: null,

    init(onAuthStateChanged) {
        firebase.initializeApp(CONFIG.firebase);
        db.init();

        firebase.auth().onAuthStateChanged((user) => {
            this.user = user;
            if (user) {
                document.getElementById('user-email-display').innerText = user.email;
                document.getElementById('account-btn').classList.remove('hidden');
                document.getElementById('welcome-screen').classList.add('hidden');
            } else {
                document.getElementById('account-btn').classList.add('hidden');
                document.getElementById('welcome-screen').classList.remove('hidden');
                document.getElementById('content').classList.add('hidden');
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