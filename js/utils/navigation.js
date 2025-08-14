// Système de navigation entre les pages
class NavigationManager {
    constructor() {
        this.currentPage = this.getCurrentPageFromURL();
        this.setupNavigation();
    }

    getCurrentPageFromURL() {
        const path = window.location.pathname;
        const page = path.split('/').pop().replace('.html', '');
        return page || 'home';
    }

    navigateTo(pageName, gameData = null) {
        // Sauvegarder les données de jeu si nécessaires
        if (gameData) {
            sessionStorage.setItem('gameData', JSON.stringify(gameData));
        }

        // Rediriger vers la nouvelle page
        if (pageName === 'home' || pageName === 'index') {
            window.location.href = '../pages/home.html';
        } else {
            window.location.href = `../pages/${pageName}.html`;
        }
    }

    getGameData() {
        const data = sessionStorage.getItem('gameData');
        return data ? JSON.parse(data) : null;
    }

    clearGameData() {
        sessionStorage.removeItem('gameData');
    }

    setupNavigation() {
        // Gérer le bouton de retour du navigateur
        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.page) {
                this.handlePageChange(event.state.page);
            }
        });

        // Ajouter l'état initial à l'historique
        if (window.history.state === null) {
            window.history.replaceState({ page: this.currentPage }, '', window.location.href);
        }
    }

    handlePageChange(newPage) {
        // Logique à implémenter si nécessaire pour les changements de page
        console.log(`Navigation vers: ${newPage}`);
    }

    // Méthodes de navigation spécifiques
    goToHome() {
        this.navigateTo('home');
    }

    goToGame(gameMode, selectedTaxon = null) {
        const gameData = { gameMode, selectedTaxon, timestamp: Date.now() };
        this.navigateTo('loading', gameData);
    }

    goToResult(resultData) {
        this.navigateTo('result', resultData);
    }

    goToStats() {
        this.navigateTo('stats');
    }

    goToLoading() {
        this.navigateTo('loading');
    }

    // Utilitaires
    isCurrentPage(pageName) {
        return this.currentPage === pageName;
    }

    addBackButton(containerId, targetPage = 'home') {
        const container = document.getElementById(containerId);
        if (container) {
            const backButton = document.createElement('button');
            backButton.className = 'back-btn';
            backButton.innerHTML = '← Retour';
            backButton.onclick = () => this.navigateTo(targetPage);
            container.appendChild(backButton);
        }
    }
}

// Instance globale
const navigation = new NavigationManager();

export default navigation;