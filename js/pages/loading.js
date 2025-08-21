import navigation from '../utils/navigation.js';
import GBIFApi from '../api/gbif.js';
import SpeciesSelector from '../game/species-selector.js';
import { updateLoadingStep } from '../ui/loading.js';
import debugManager from '../utils/debug.js';

// Gestionnaire de la page de chargement
class LoadingPage {
    constructor() {
        this.api = new GBIFApi();
        this.speciesSelector = new SpeciesSelector(this.api);
        this.gameData = null;
        this.init();
    }

    init() {
        // Récupérer les données de jeu depuis la navigation
        this.gameData = navigation.getGameData();
        
        if (!this.gameData) {
            // Pas de données de jeu, retourner à l'accueil
            navigation.goToHome();
            return;
        }

        // Commencer le chargement
        this.startLoading();
    }

    async startLoading() {
        try {
            updateLoadingStep('Initialisation...');
            
            const { gameMode, selectedTaxon, franceModeEnabled, currentSession, continueGame } = this.gameData;
            
            updateLoadingStep('Recherche d\'une espèce mystère...');
            
            debugManager.log('Début sélection espèce', { gameMode, selectedTaxon });
            
            // Sélectionner une espèce
            const startTime = performance.now();
            const species = await this.speciesSelector.selectSpecies(gameMode, selectedTaxon, franceModeEnabled);
            const endTime = performance.now();
            
            debugManager.log('Espèce sélectionnée', {
                species: species.scientificName,
                selectionTime: `${Math.round(endTime - startTime)}ms`,
                taxonKey: species.taxonKey,
                occurrences: species.occurrenceCount
            });
            
            if (!species) {
                throw new Error('Impossible de trouver une espèce appropriée');
            }

            updateLoadingStep('Préparation du jeu...');
            
            // Préparer les données pour le jeu
            const gameState = {
                species,
                gameMode,
                selectedTaxon,
                franceModeEnabled,
                hintsUsed: 0,
                maxHints: 4,
                wrongAnswers: [],
                startTime: Date.now()
            };
            
            // Si on continue une partie, ajouter les données de session
            if (continueGame && currentSession) {
                gameState.currentSession = currentSession;
            }

            // Délai pour que l'utilisateur puisse voir le message de fin
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Naviguer vers le jeu avec l'espèce sélectionnée
            navigation.navigateTo('game', gameState);

        } catch (error) {
            console.error('Erreur lors du chargement:', error);
            this.showError(error.message);
        }
    }

    showError(message) {
        updateLoadingStep(`Erreur: ${message}`);
        
        // Ajouter un bouton pour retourner à l'accueil
        setTimeout(() => {
            const container = document.querySelector('.loading-container');
            if (container) {
                const errorDiv = document.createElement('div');
                errorDiv.style.marginTop = '2rem';
                errorDiv.innerHTML = `
                    <p style="color: var(--danger-color); margin-bottom: 1rem;">
                        Une erreur est survenue lors de la recherche d'espèce.
                    </p>
                    <button onclick="location.href='home.html'" class="secondary-btn">
                        Retourner à l'accueil
                    </button>
                `;
                container.appendChild(errorDiv);
            }
        }, 2000);
    }
}

// Initialiser la page quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    new LoadingPage();
});