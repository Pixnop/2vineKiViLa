import navigation from '../utils/navigation.js';

// Gestionnaire de la page de statistiques
class StatsPage {
    constructor() {
        this.stats = this.loadStats();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.displayStats();
        this.displaySpeciesGallery();
    }

    setupEventListeners() {
        document.getElementById('back-home-btn')?.addEventListener('click', () => {
            navigation.goToHome();
        });

        document.getElementById('reset-stats-btn')?.addEventListener('click', () => {
            this.resetStats();
        });
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
            console.error('Erreur lors du chargement des statistiques:', error);
            return {
                totalPlayed: 0,
                totalFound: 0,
                bestStreak: 0,
                discoveredSpecies: []
            };
        }
    }

    displayStats() {
        // Calculer le taux de réussite
        const successRate = this.stats.totalPlayed > 0 ? 
            Math.round((this.stats.totalFound / this.stats.totalPlayed) * 100) : 0;

        // Mettre à jour les valeurs affichées
        document.getElementById('total-played').textContent = this.stats.totalPlayed;
        document.getElementById('total-found').textContent = this.stats.totalFound;
        document.getElementById('best-streak').textContent = this.stats.bestStreak;
        document.getElementById('success-rate').textContent = `${successRate}%`;
    }

    displaySpeciesGallery() {
        const gallery = document.getElementById('species-gallery');
        if (!gallery) return;

        if (this.stats.discoveredSpecies.length === 0) {
            gallery.innerHTML = '<div class="no-species">Aucune espèce découverte pour le moment</div>';
            return;
        }

        gallery.innerHTML = '';
        this.stats.discoveredSpecies.forEach(species => {
            const card = this.createSpeciesCard(species);
            gallery.appendChild(card);
        });
    }

    createSpeciesCard(species) {
        const card = document.createElement('div');
        card.className = 'species-card';

        const name = species.vernacularName || species.scientificName;
        const imageSrc = species.image;

        card.innerHTML = `
            ${imageSrc ? 
                `<img src="${imageSrc}" alt="${name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                 <div class="no-image" style="display: none;">🦄</div>` :
                '<div class="no-image">🦄</div>'
            }
            <div class="species-name">${name}</div>
        `;

        // Ajouter une infobulle avec plus d'informations
        card.title = `${species.scientificName}\nClasse: ${species.class || 'Inconnue'}\nTrouvé le: ${species.discoveredDate || 'Date inconnue'}`;

        return card;
    }

    resetStats() {
        if (confirm('Êtes-vous sûr de vouloir réinitialiser toutes vos statistiques ? Cette action est irréversible.')) {
            localStorage.removeItem('gameStats');
            this.stats = {
                totalPlayed: 0,
                totalFound: 0,
                bestStreak: 0,
                discoveredSpecies: []
            };
            this.displayStats();
            this.displaySpeciesGallery();
            
            // Afficher un message de confirmation
            this.showResetConfirmation();
        }
    }

    showResetConfirmation() {
        const container = document.querySelector('.stats-container');
        const message = document.createElement('div');
        message.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--success-color);
            color: var(--text-light);
            padding: 1rem 2rem;
            border-radius: var(--border-radius);
            z-index: 1000;
            animation: slideInDown 0.3s ease;
        `;
        message.textContent = 'Statistiques réinitialisées avec succès !';
        
        document.body.appendChild(message);
        
        // Retirer le message après 3 secondes
        setTimeout(() => {
            message.remove();
        }, 3000);
    }
}

// Initialiser la page quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    new StatsPage();
});