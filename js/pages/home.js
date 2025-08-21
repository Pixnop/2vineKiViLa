import navigation from '../utils/navigation.js';
import debugManager from '../utils/debug.js';

// Gestionnaire de la page d'accueil
class HomePage {
    constructor() {
        this.selectedMode = null;
        this.selectedTaxon = null;
        this.franceModeEnabled = true; // Mode France activé par défaut
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadFromUrl();
        this.loadSettings();
        this.loadStats();
        this.updateFranceModeDisplay();
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

        // Toggle mode France
        document.getElementById('france-mode-toggle')?.addEventListener('change', (e) => {
            this.franceModeEnabled = e.target.checked;
            this.updateFranceModeDisplay();
            
            // Sauvegarder la préférence
            localStorage.setItem('franceModeEnabled', this.franceModeEnabled);
        });
    }

    selectGameMode(mode) {
        this.selectedMode = mode;
        
        if (mode === 'thematic') {
            this.showThemeSelection();
        } else {
            // Réinitialiser le taxon pour les modes non-thématiques
            this.selectedTaxon = null;
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
        // Préparer les données de jeu avec le mode France
        const gameData = {
            gameMode: mode,
            selectedTaxon: this.selectedTaxon,
            franceModeEnabled: this.franceModeEnabled,
            timestamp: Date.now()
        };

        // Naviguer vers le loading avec les paramètres
        navigation.navigateTo('loading', gameData);
    }

    updateFranceModeDisplay() {
        const toggle = document.getElementById('france-mode-toggle');
        if (toggle) {
            toggle.checked = this.franceModeEnabled;
        }
        
        const label = document.querySelector('.france-mode-label');
        if (label) {
            label.textContent = this.franceModeEnabled ? 
                '🇫🇷 Espèces de France uniquement' : 
                '🌍 Espèces du monde entier';
        }
    }

    loadSettings() {
        // Charger la préférence du mode France (seulement si pas déjà définie par URL)
        if (this.franceModeEnabled === undefined) {
            const savedFranceMode = localStorage.getItem('franceModeEnabled');
            if (savedFranceMode !== null) {
                this.franceModeEnabled = savedFranceMode === 'true';
            } else {
                this.franceModeEnabled = true; // Par défaut : activé
            }
        }
    }

    loadFromUrl() {
        // Récupérer les paramètres URL pour restaurer la sélection
        const urlParams = new URLSearchParams(window.location.search);
        const urlMode = urlParams.get('mode');
        const urlTaxon = urlParams.get('taxon');
        const urlFranceMode = urlParams.get('france');
        
        // Restaurer la sélection du mode
        if (urlMode) {
            this.selectedMode = urlMode;
            const modeButton = document.querySelector(`[data-mode="${urlMode}"]`);
            if (modeButton) {
                modeButton.classList.add('selected');
            }
        }
        
        // Restaurer la sélection du thème et afficher la sélection thématique si nécessaire
        if (urlTaxon && urlMode === 'thematic') {
            this.selectedTaxon = urlTaxon;
            this.showThemeSelection();
            const taxonButton = document.querySelector(`[data-taxon="${urlTaxon}"]`);
            if (taxonButton) {
                taxonButton.classList.add('selected');
            }
        }
        
        // Restaurer le mode France depuis l'URL
        if (urlFranceMode !== null) {
            this.franceModeEnabled = urlFranceMode === 'true';
        }
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