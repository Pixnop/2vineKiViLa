// Gestionnaire des écrans de l'application
class ScreenManager {
    constructor() {
        this.currentScreen = 'home';
        this.screens = ['home', 'loading', 'game', 'result', 'stats'];
    }

    showScreen(screenName) {
        // Masquer tous les écrans
        this.hideAllScreens();
        
        // Afficher l'écran demandé
        const screen = document.getElementById(`${screenName}-screen`);
        if (screen) {
            screen.classList.add('active');
            this.currentScreen = screenName;
        } else {
            console.error(`Écran ${screenName} non trouvé`);
        }
    }

    hideAllScreens() {
        this.screens.forEach(screenName => {
            const screen = document.getElementById(`${screenName}-screen`);
            if (screen) {
                screen.classList.remove('active');
            }
        });
    }

    getCurrentScreen() {
        return this.currentScreen;
    }

    isScreenVisible(screenName) {
        const screen = document.getElementById(`${screenName}-screen`);
        return screen && screen.classList.contains('active');
    }
}

export default ScreenManager;