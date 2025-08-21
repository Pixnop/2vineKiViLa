import navigation from '../utils/navigation.js';

// Gestionnaire de la page de résultats
class ResultPage {
    constructor() {
        this.resultData = null;
        this.init();
    }

    init() {
        // Récupérer les données de résultat depuis la navigation
        this.resultData = navigation.getGameData();
        
        if (!this.resultData || !this.resultData.species) {
            // Pas de données de résultat valides, retourner à l'accueil
            navigation.goToHome();
            return;
        }

        this.setupEventListeners();
        this.displayResult();
        this.updateStats();
    }

    setupEventListeners() {
        document.getElementById('next-species-btn')?.addEventListener('click', () => {
            // Si la partie est terminée (plus de vies), relancer une nouvelle partie
            // Sinon, continuer avec une nouvelle espèce
            const session = this.resultData.session;
            
            if (!session || session.lives <= 0) {
                // Nouvelle partie (plus de vies)
                const gameData = {
                    gameMode: this.resultData.gameMode,
                    selectedTaxon: this.resultData.selectedTaxon,
                    franceModeEnabled: this.resultData.franceModeEnabled,
                    timestamp: Date.now()
                };
                navigation.navigateTo('loading', gameData);
            } else {
                // Continuer avec une nouvelle espèce (conserver les vies et le score)
                const gameData = {
                    gameMode: this.resultData.gameMode,
                    selectedTaxon: this.resultData.selectedTaxon,
                    franceModeEnabled: this.resultData.franceModeEnabled,
                    currentSession: session,
                    continueGame: true,
                    timestamp: Date.now()
                };
                navigation.navigateTo('loading', gameData);
            }
        });

        document.getElementById('back-home-btn')?.addEventListener('click', () => {
            navigation.goToHome();
        });
    }

    displayResult() {
        const container = document.getElementById('result-content');
        if (!container) return;

        const { isCorrect, userAnswer, species, hintsUsed, skipped, session } = this.resultData;

        // Déterminer l'état de la partie
        const gameOver = !session || session.lives <= 0;
        const gameWon = isCorrect && !skipped;

        // En-tête avec succès/échec
        const headerClass = gameWon ? 'success' : 'failure';
        const headerIcon = gameWon ? '<span class="emoji">🎉</span>' : gameOver ? '<span class="emoji">💀</span>' : '<span class="emoji">😔</span>';
        let headerText = skipped ? 'Question passée' : 
                        gameWon ? 'Bravo !' : 
                        gameOver ? 'Game Over !' : 'Essaie encore !';

        // Bouton text selon l'état
        const nextButtonText = gameOver ? 'Nouvelle partie' : 'Espèce suivante';

        // Construire le contenu
        container.innerHTML = `
            <div class="result-header ${headerClass}">
                <div class="result-icon">${headerIcon}</div>
                <h2>${headerText}</h2>
                ${!skipped ? `<p>Votre réponse : "${userAnswer}"</p>` : ''}
                ${session ? `
                    <div class="game-stats">
                        <span>Vies restantes: ${session.lives}/3</span> • 
                        <span>Tentatives: ${session.totalAttempts}</span> • 
                        <span>Score: ${session.score || 0}</span>
                    </div>
                ` : ''}
            </div>
            
            <div class="species-reveal">
                <div class="species-info">
                    <h3>${species.vernacularName || species.scientificName}</h3>
                    <div class="scientific-name">${species.scientificName}</div>
                </div>

                ${species.image ? `
                    <div class="species-image">
                        <img src="${species.image}" alt="${species.scientificName}" 
                             onerror="this.style.display='none'">
                    </div>
                ` : ''}

                <div class="species-details">
                    <div class="detail-item">
                        <span class="label">Classe :</span>
                        <span class="value">${species.class || 'Non spécifiée'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Famille :</span>
                        <span class="value">${species.family || 'Non spécifiée'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Ordre :</span>
                        <span class="value">${species.order || 'Non spécifié'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Observations :</span>
                        <span class="value">${species.occurrenceCount?.toLocaleString() || 'Non disponible'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Indices utilisés :</span>
                        <span class="value">${hintsUsed || 0}/4</span>
                    </div>
                    ${session && session.wrongAnswers && session.wrongAnswers.length > 0 ? `
                        <div class="detail-item">
                            <span class="label">Mauvaises réponses :</span>
                            <span class="value">${session.wrongAnswers.join(', ')}</span>
                        </div>
                    ` : ''}
                </div>

                ${gameWon ? `
                    <div class="score-info">
                        Points gagnés : ${session ? session.score - (session.prevScore || 0) : this.calculateScore(hintsUsed)}
                    </div>
                ` : ''}
            </div>
        `;

        // Mettre à jour le texte du bouton
        const nextButton = document.getElementById('next-species-btn');
        if (nextButton) {
            nextButton.textContent = nextButtonText;
        }
    }

    calculateScore(hintsUsed) {
        // Système de score simple : plus on utilise d'indices, moins on gagne de points
        const baseScore = 100;
        const penaltyPerHint = 20;
        return Math.max(10, baseScore - (hintsUsed * penaltyPerHint));
    }

    updateStats() {
        try {
            const stats = this.loadStats();
            const { isCorrect, species, skipped } = this.resultData;

            // Mettre à jour les statistiques
            stats.totalPlayed++;
            
            if (isCorrect && !skipped) {
                stats.totalFound++;
                
                // Ajouter l'espèce aux découvertes si pas déjà présente
                const existingSpecies = stats.discoveredSpecies.find(s => 
                    s.taxonKey === species.taxonKey
                );
                
                if (!existingSpecies) {
                    stats.discoveredSpecies.push({
                        ...species,
                        discoveredDate: new Date().toLocaleDateString('fr-FR')
                    });
                }
            }

            // Sauvegarder les statistiques
            localStorage.setItem('gameStats', JSON.stringify(stats));

        } catch (error) {
            console.error('Erreur lors de la mise à jour des statistiques:', error);
        }
    }

    loadStats() {
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
}

// Initialiser la page quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    new ResultPage();
});