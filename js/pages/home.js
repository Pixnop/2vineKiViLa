import navigation from '../utils/navigation.js';
import debugManager from '../utils/debug.js';

// Gestionnaire de la page d'accueil
class HomePage {
    constructor() {
        this.selectedMode = null;
        this.selectedTaxon = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadStats();
    }

    setupEventListeners() {
        // Boutons de mode de jeu
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.selectGameMode(mode);
            });
        });

        // Boutons de thème
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taxon = e.currentTarget.dataset.taxon;
                this.selectTheme(taxon);
            });
        });

        // Bouton retour aux modes
        document.getElementById('back-to-modes')?.addEventListener('click', () => {
            this.hideThemeSelection();
        });
    }

    selectGameMode(mode) {
        this.selectedMode = mode;
        
        if (mode === 'thematic') {
            this.showThemeSelection();
        } else {
            this.startGame(mode);
        }
    }

    selectTheme(taxon) {
        this.selectedTaxon = taxon;
        this.startGame('thematic');
    }

    showThemeSelection() {
        const themeSelection = document.getElementById('theme-selection');
        if (themeSelection) {
            themeSelection.classList.remove('hidden');
            themeSelection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    hideThemeSelection() {
        const themeSelection = document.getElementById('theme-selection');
        if (themeSelection) {
            themeSelection.classList.add('hidden');
        }
    }

    startGame(mode) {
        // Naviguer vers le jeu avec les paramètres sélectionnés
        navigation.goToGame(mode, this.selectedTaxon);
    }

    loadStats() {
        // Charger et afficher un résumé des statistiques si nécessaire
        const stats = this.getStoredStats();
        if (stats && stats.totalPlayed > 0) {
            this.displayQuickStats(stats);
        }
    }

    getStoredStats() {
        try {
            return JSON.parse(localStorage.getItem('gameStats')) || {
                totalPlayed: 0,
                totalFound: 0,
                bestStreak: 0,
                discoveredSpecies: []
            };
        } catch (error) {
            return {
                totalPlayed: 0,
                totalFound: 0,
                bestStreak: 0,
                discoveredSpecies: []
            };
        }
    }

    displayQuickStats(stats) {
        // Afficher un petit résumé des stats dans le lien stats
        const statsLink = document.querySelector('.stats-link a');
        if (statsLink) {
            const successRate = stats.totalPlayed > 0 ? 
                Math.round((stats.totalFound / stats.totalPlayed) * 100) : 0;
            statsLink.title = `${stats.totalFound}/${stats.totalPlayed} trouvées (${successRate}%) - Meilleure série: ${stats.bestStreak}`;
        }
    }
}

// Initialiser la page quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    new HomePage();
});