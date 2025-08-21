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

        // Construction de l'URL selon le contexte
        let url;
        if (pageName === 'home' || pageName === 'index') {
            url = '../pages/home.html';
        } else {
            url = `../pages/${pageName}.html`;
        }
        
        // Ajouter des paramètres URL si des données de jeu sont présentes
        if (gameData && (gameData.gameMode || gameData.selectedTaxon || gameData.franceModeEnabled !== undefined)) {
            const params = new URLSearchParams();
            if (gameData.gameMode) params.set('mode', gameData.gameMode);
            if (gameData.selectedTaxon) params.set('taxon', gameData.selectedTaxon);
            if (gameData.franceModeEnabled !== undefined) params.set('france', gameData.franceModeEnabled);
            url += '?' + params.toString();
        }

        // Rediriger vers la nouvelle page
        window.location.href = url;
    }

    getGameData() {
        const data = sessionStorage.getItem('gameData');
        let gameData = data ? JSON.parse(data) : null;
        
        // Récupérer aussi les paramètres URL pour compléter les données
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('mode') || urlParams.has('taxon')) {
            gameData = gameData || {};
            if (urlParams.has('mode')) gameData.gameMode = urlParams.get('mode');
            if (urlParams.has('taxon')) gameData.selectedTaxon = urlParams.get('taxon');
        }
        
        return gameData;
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
        // Préserver les paramètres de jeu actuels si ils existent
        const currentGameData = this.getGameData();
        if (currentGameData && (currentGameData.gameMode || currentGameData.selectedTaxon)) {
            const homeData = {
                gameMode: currentGameData.gameMode,
                selectedTaxon: currentGameData.selectedTaxon
            };
            this.navigateTo('home', homeData);
        } else {
            this.navigateTo('home');
        }
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