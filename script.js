// Configuration de l'application
const CONFIG = {
    GBIF_BASE_URL: 'https://api.gbif.org/v1',
    GBIF_MAP_URL: 'https://api.gbif.org/v2/map/occurrence/density',
    MAX_RETRIES: 3,
    SPECIES_CACHE_SIZE: 10,
    MIN_OCCURRENCES: {
        popular: 10000,
        discovery: 1000,
        expert: 100
    },
    MAX_OCCURRENCES: {
        popular: 1000000,
        discovery: 10000,
        expert: 1000
    }
};

// État global de l'application
const GameState = {
    currentScreen: 'home',
    gameMode: null,
    selectedTaxon: null,
    currentSpecies: null,
    score: 0,
    streak: 0,
    hintsUsed: 0,
    maxHints: 4,
    lives: 3,
    maxLives: 3,
    wrongAnswers: [],
    map: null,
    speciesCache: [],
    stats: {
        totalPlayed: 0,
        totalFound: 0,
        bestStreak: 0,
        discoveredSpecies: []
    }
};

// Classes pour gérer les API calls
class GBIFApi {
    constructor() {
        this.baseUrl = CONFIG.GBIF_BASE_URL;
        this.mapUrl = CONFIG.GBIF_MAP_URL;
    }

    async makeRequest(endpoint, params = {}) {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
                url.searchParams.append(key, params[key]);
            }
        });

        try {
            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`API request failed for ${endpoint}:`, error);
            throw error;
        }
    }

    // Recherche d'occurrences pour sélectionner des espèces
    async searchOccurrences(filters = {}) {
        const params = {
            hasCoordinate: true,
            hasGeospatialIssue: false,
            rank: 'SPECIES',
            limit: 300,
            offset: Math.floor(Math.random() * 10000),
            ...filters
        };

        return this.makeRequest('/occurrence/search', params);
    }

    // Obtenir les détails d'une espèce
    async getSpeciesDetails(taxonKey) {
        return this.makeRequest(`/species/${taxonKey}`);
    }

    // Obtenir les noms vernaculaires d'une espèce
    async getVernacularNames(taxonKey) {
        return this.makeRequest(`/species/${taxonKey}/vernacularNames`);
    }

    // Obtenir les médias d'une espèce
    async getSpeciesMedia(taxonKey) {
        return this.makeRequest(`/species/${taxonKey}/media`);
    }

    // Autocomplétion pour les noms d'espèces - recherche élargie
    async suggestSpecies(query, limit = 10) {
        // Essayer plusieurs approches de recherche
        const searches = [
            // 1. Recherche spécifique aux espèces
            this.makeRequest('/species/suggest', { q: query, limit: Math.ceil(limit/2), rank: 'SPECIES' }).catch(() => ({ results: [] })),
            // 2. Recherche plus large incluant genres et autres rangs
            this.makeRequest('/species/suggest', { q: query, limit: Math.ceil(limit/2) }).catch(() => ({ results: [] })),
            // 3. Recherche de noms vernaculaires
            this.searchByVernacularName(query, Math.ceil(limit/3)).catch(() => [])
        ];
        
        const results = await Promise.all(searches);
        
        // Combiner et dédupliquer les résultats
        const combined = [];
        const seen = new Set();
        
        results.forEach(result => {
            const items = result.results || result || [];
            items.forEach(item => {
                const key = item.key || item.usageKey || item.taxonKey;
                if (!seen.has(key) && key) {
                    seen.add(key);
                    combined.push(item);
                }
            });
        });
        
        return combined.slice(0, limit);
    }
    
    // Recherche spécifique par nom vernaculaire
    async searchByVernacularName(query, limit = 5) {
        try {
            // Recherche dans les occurrences avec un terme de recherche libre
            const response = await this.makeRequest('/species/search', { 
                q: query, 
                limit,
                rank: 'SPECIES'
            });
            return response.results || [];
        } catch (error) {
            return [];
        }
    }

    // Compter les occurrences pour une espèce
    async countOccurrences(taxonKey) {
        const result = await this.makeRequest('/occurrence/search', {
            taxonKey,
            limit: 0
        });
        return result.count;
    }
}

// Classe pour la sélection intelligente d'espèces
class SpeciesSelector {
    constructor(api) {
        this.api = api;
    }

    // Sélectionner une espèce selon le mode de jeu
    async selectSpecies(gameMode, taxonKey = null) {
        const maxAttempts = 20;
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                updateLoadingStep(`Recherche d'espèces... (${attempts + 1}/${maxAttempts})`);
                
                const filters = this.buildFilters(gameMode, taxonKey);
                const occurrenceData = await this.api.searchOccurrences(filters);
                
                if (!occurrenceData.results || occurrenceData.results.length === 0) {
                    attempts++;
                    continue;
                }

                // Extraire les taxonKeys uniques
                const taxonKeys = [...new Set(
                    occurrenceData.results.map(r => r.taxonKey).filter(key => key)
                )];

                if (taxonKeys.length === 0) {
                    attempts++;
                    continue;
                }

                // Tester les espèces une par une
                updateLoadingStep('Évaluation des espèces candidates...');
                
                for (const candidateTaxonKey of taxonKeys.slice(0, 10)) {
                    const species = await this.evaluateSpecies(candidateTaxonKey, gameMode);
                    if (species) {
                        return species;
                    }
                }

                attempts++;
            } catch (error) {
                console.error('Erreur lors de la sélection d\'espèce:', error);
                attempts++;
            }
        }

        throw new Error('Impossible de trouver une espèce appropriée après plusieurs tentatives');
    }

    buildFilters(gameMode, taxonKey) {
        const filters = {};

        if (taxonKey) {
            // Mode thématique : rechercher dans une classe spécifique
            filters.taxonKey = taxonKey;
        }

        // Ajouter des filtres selon le mode
        switch (gameMode) {
            case 'popular':
                // Pas de filtre spécifique, on gérera côté évaluation
                break;
            case 'discovery':
                // Filtrer par années récentes pour avoir plus de données
                filters.year = '2000,2024';
                break;
            case 'expert':
                // Filtrer pour des espèces plus rares
                filters.basisOfRecord = 'HUMAN_OBSERVATION';
                break;
            case 'thematic':
                // Déjà géré par taxonKey
                break;
        }

        return filters;
    }

    async evaluateSpecies(taxonKey, gameMode) {
        try {
            updateLoadingStep(`Évaluation de l'espèce ${taxonKey}...`);

            // Obtenir les détails de base
            const [speciesDetails, occurrenceCount] = await Promise.all([
                this.api.getSpeciesDetails(taxonKey),
                this.api.countOccurrences(taxonKey)
            ]);

            // Vérifier si l'espèce respecte les critères
            if (!this.isSpeciesPlayable(speciesDetails, occurrenceCount, gameMode)) {
                return null;
            }

            // Obtenir des informations supplémentaires
            updateLoadingStep(`Récupération des détails pour ${speciesDetails.canonicalName}...`);
            
            const [vernacularNames, media] = await Promise.all([
                this.api.getVernacularNames(taxonKey).catch(() => ({ results: [] })),
                this.api.getSpeciesMedia(taxonKey).catch(() => ({ results: [] }))
            ]);

            // Construire l'objet espèce complet
            const species = {
                taxonKey,
                scientificName: speciesDetails.canonicalName || speciesDetails.scientificName,
                vernacularName: this.extractBestVernacularName(vernacularNames.results),
                taxonomicClass: this.extractTaxonomicInfo(speciesDetails),
                occurrenceCount,
                continent: this.extractContinentInfo(speciesDetails),
                image: this.extractBestImage(media.results),
                description: speciesDetails.description,
                kingdom: speciesDetails.kingdom,
                phylum: speciesDetails.phylum,
                class: speciesDetails.class,
                order: speciesDetails.order,
                family: speciesDetails.family,
                genus: speciesDetails.genus
            };

            return species;

        } catch (error) {
            console.error(`Erreur lors de l'évaluation de l'espèce ${taxonKey}:`, error);
            return null;
        }
    }

    isSpeciesPlayable(speciesDetails, occurrenceCount, gameMode) {
        // Vérifier le nom scientifique
        if (!speciesDetails.canonicalName && !speciesDetails.scientificName) {
            return false;
        }

        // Vérifier le rang taxonomique
        if (speciesDetails.rank !== 'SPECIES') {
            return false;
        }

        // Vérifier le nombre d'occurrences selon le mode
        const minOccurrences = CONFIG.MIN_OCCURRENCES[gameMode] || 100;
        const maxOccurrences = CONFIG.MAX_OCCURRENCES[gameMode] || 1000000;

        if (occurrenceCount < minOccurrences || occurrenceCount > maxOccurrences) {
            return false;
        }

        // Vérifier que l'espèce a un statut taxonomique acceptable
        const validStatuses = ['ACCEPTED', 'DOUBTFUL'];
        if (speciesDetails.taxonomicStatus && !validStatuses.includes(speciesDetails.taxonomicStatus)) {
            return false;
        }

        return true;
    }

    extractBestVernacularName(vernacularNames) {
        if (!vernacularNames || vernacularNames.length === 0) {
            return null;
        }

        // Priorité : français, puis anglais, puis le premier disponible
        const frenchName = vernacularNames.find(vn => vn.language === 'fr' || vn.language === 'fra');
        if (frenchName) return frenchName.vernacularName;

        const englishName = vernacularNames.find(vn => vn.language === 'en' || vn.language === 'eng');
        if (englishName) return englishName.vernacularName;

        return vernacularNames[0].vernacularName;
    }

    extractBestImage(media) {
        if (!media || media.length === 0) {
            return null;
        }

        // Chercher la meilleure image
        const images = media.filter(m => m.type === 'StillImage' && m.format && m.format.startsWith('image/'));
        
        if (images.length === 0) return null;

        // Priorité aux images avec des identifiants de sources fiables
        const prioritizedImage = images.find(img => 
            img.rightsHolder && (
                img.rightsHolder.toLowerCase().includes('inaturalist') ||
                img.rightsHolder.toLowerCase().includes('wikipedia') ||
                img.rightsHolder.toLowerCase().includes('eol')
            )
        );

        return prioritizedImage ? prioritizedImage.identifier : images[0].identifier;
    }

    extractTaxonomicInfo(speciesDetails) {
        return {
            kingdom: speciesDetails.kingdom,
            phylum: speciesDetails.phylum,
            class: speciesDetails.class,
            order: speciesDetails.order,
            family: speciesDetails.family,
            genus: speciesDetails.genus
        };
    }

    extractContinentInfo(speciesDetails) {
        // Pour l'instant, on ne peut pas facilement extraire les continents depuis les détails de l'espèce
        // On pourrait implémenter une logique plus complexe avec les occurrences géographiques
        return ['Informations géographiques à déterminer'];
    }
}

// Classe pour gérer l'interface utilisateur
class GameUI {
    constructor() {
        this.api = new GBIFApi();
        this.speciesSelector = new SpeciesSelector(this.api);
        this.loadStats();
        this.initEventListeners();
    }

    initEventListeners() {
        // Navigation entre les écrans
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.selectGameMode(mode);
            });
        });

        // Sélection de thème
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const taxonKey = e.currentTarget.dataset.taxon;
                this.selectTheme(taxonKey);
            });
        });

        // Boutons de navigation
        document.getElementById('back-to-modes').addEventListener('click', () => {
            this.showScreen('home');
            document.getElementById('theme-selection').classList.add('hidden');
        });

        // Contrôles de jeu
        document.getElementById('hint-btn').addEventListener('click', () => this.showHint());
        document.getElementById('skip-btn').addEventListener('click', () => this.skipSpecies());
        document.getElementById('quit-btn').addEventListener('click', () => this.quitGame());
        document.getElementById('submit-btn').addEventListener('click', () => this.checkAnswer());

        // Input pour les réponses
        const speciesInput = document.getElementById('species-input');
        speciesInput.addEventListener('input', (e) => this.handleInputChange(e));
        speciesInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.checkAnswer();
        });
        
        // Fermer les suggestions en cliquant ailleurs
        document.addEventListener('click', (e) => {
            const suggestionsContainer = document.getElementById('suggestions');
            if (!speciesInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
                suggestionsContainer.innerHTML = '';
            }
        });
        
        // Navigation au clavier dans les suggestions
        speciesInput.addEventListener('keydown', (e) => {
            const suggestions = document.querySelectorAll('.suggestion-item');
            if (suggestions.length === 0) return;
            
            let selectedIndex = Array.from(suggestions).findIndex(s => s.classList.contains('selected'));
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (selectedIndex < suggestions.length - 1) {
                    if (selectedIndex >= 0) suggestions[selectedIndex].classList.remove('selected');
                    suggestions[selectedIndex + 1].classList.add('selected');
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (selectedIndex > 0) {
                    suggestions[selectedIndex].classList.remove('selected');
                    suggestions[selectedIndex - 1].classList.add('selected');
                }
            } else if (e.key === 'Enter' && selectedIndex >= 0) {
                e.preventDefault();
                suggestions[selectedIndex].click();
            }
        });

        // Boutons de résultat
        document.getElementById('next-species-btn').addEventListener('click', () => this.nextSpecies());
        document.getElementById('back-home-btn').addEventListener('click', () => this.backToHome());

        // Statistiques
        document.getElementById('stats-btn').addEventListener('click', () => this.showStats());
        document.getElementById('close-stats-btn').addEventListener('click', () => this.hideStats());
    }

    selectGameMode(mode) {
        GameState.gameMode = mode;
        
        if (mode === 'thematic') {
            document.getElementById('theme-selection').classList.remove('hidden');
        } else {
            this.startGame();
        }
    }

    selectTheme(taxonKey) {
        GameState.selectedTaxon = taxonKey;
        this.startGame();
    }

    async startGame() {
        this.showScreen('loading');
        
        try {
            updateLoadingStep('Initialisation du jeu...');
            
            // Réinitialiser l'état si nouveau jeu
            if (GameState.currentScreen === 'home') {
                GameState.score = 0;
                GameState.streak = 0;
                GameState.lives = GameState.maxLives;
            }
            
            // Sélectionner une nouvelle espèce
            const species = await this.speciesSelector.selectSpecies(
                GameState.gameMode, 
                GameState.selectedTaxon
            );
            
            GameState.currentSpecies = species;
            GameState.hintsUsed = 0;

            updateLoadingStep('Préparation de la carte...');
            await this.setupGameScreen();
            
            this.showScreen('game');
            
        } catch (error) {
            console.error('Erreur lors du démarrage du jeu:', error);
            alert('Erreur lors du chargement d\'une espèce. Veuillez réessayer.');
            this.showScreen('home');
        }
    }

    async setupGameScreen() {
        // Mettre à jour l'interface
        document.getElementById('current-score').textContent = GameState.score;
        document.getElementById('current-streak').textContent = GameState.streak;
        document.getElementById('current-lives').textContent = GameState.lives;
        document.getElementById('hints-used').textContent = GameState.hintsUsed;
        document.getElementById('species-input').value = '';
        document.getElementById('suggestions').innerHTML = '';
        document.getElementById('hints-display').innerHTML = '';
        
        // Réinitialiser les tentatives pour cette espèce
        GameState.wrongAnswers = [];
        
        // Réactiver les contrôles
        document.getElementById('species-input').disabled = false;
        document.getElementById('submit-btn').disabled = false;
        document.getElementById('hint-btn').disabled = GameState.hintsUsed >= GameState.maxHints;

        // Initialiser la carte
        await this.initMap();
    }

    async initMap() {
        const mapContainer = document.getElementById('map');
        
        // Détruire la carte existante si elle existe
        if (GameState.map) {
            GameState.map.remove();
        }

        // Attendre un petit délai pour que le DOM soit prêt
        await new Promise(resolve => setTimeout(resolve, 100));

        // Créer une nouvelle carte
        GameState.map = L.map('map', {
            center: [20, 0],
            zoom: 2,
            zoomControl: true,
            attributionControl: true,
            preferCanvas: true,
            worldCopyJump: true,
            maxBounds: [[-90, -180], [90, 180]],
            maxBoundsViscosity: 1.0
        });

        // Définir les couches de base disponibles
        const baseMaps = {
            'Naturel': L.tileLayer('https://tile.gbif.org/3857/omt/{z}/{x}/{y}@1x.png?style=gbif-natural', {
                attribution: '© GBIF, OpenMapTiles © OpenStreetMap contributors'
            }),
            'Classique': L.tileLayer('https://tile.gbif.org/3857/omt/{z}/{x}/{y}@1x.png?style=gbif-classic', {
                attribution: '© GBIF, OpenMapTiles © OpenStreetMap contributors'
            }),
            'Satellite': L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors, Tiles courtesy of Humanitarian OpenStreetMap Team'
            }),
            'Sombre': L.tileLayer('https://tile.gbif.org/3857/omt/{z}/{x}/{y}@1x.png?style=gbif-dark', {
                attribution: '© GBIF, OpenMapTiles © OpenStreetMap contributors'
            })
        };

        // Ajouter la couche de base par défaut
        baseMaps['Naturel'].addTo(GameState.map);

        // Créer différents styles de visualisation des occurrences
        const taxonKey = GameState.currentSpecies.taxonKey;
        
        const speciesLayers = {
            'Hexagones classiques': L.tileLayer(
                `${CONFIG.GBIF_MAP_URL}/{z}/{x}/{y}@2x.png?taxonKey=${taxonKey}&bin=hex&hexPerTile=25&style=classic.poly&srs=EPSG:3857`,
                {
                    opacity: 0.9,
                    attribution: 'Données d\'occurrence © GBIF'
                }
            ),
            'Points classiques (gros)': L.tileLayer(
                `${CONFIG.GBIF_MAP_URL}/{z}/{x}/{y}@2x.png?taxonKey=${taxonKey}&style=classic.point&srs=EPSG:3857`,
                {
                    opacity: 0.9,
                    attribution: 'Données d\'occurrence © GBIF'
                }
            ),
            'Carte de chaleur orange': L.tileLayer(
                `${CONFIG.GBIF_MAP_URL}/{z}/{x}/{y}@2x.png?taxonKey=${taxonKey}&style=orangeHeat.point&srs=EPSG:3857`,
                {
                    opacity: 0.8,
                    attribution: 'Données d\'occurrence © GBIF'
                }
            ),
            'Marqueurs bleus': L.tileLayer(
                `${CONFIG.GBIF_MAP_URL}/{z}/{x}/{y}@2x.png?taxonKey=${taxonKey}&bin=hex&hexPerTile=30&style=blue.marker&srs=EPSG:3857`,
                {
                    opacity: 0.9,
                    attribution: 'Données d\'occurrence © GBIF'
                }
            ),
            'Marqueurs orange': L.tileLayer(
                `${CONFIG.GBIF_MAP_URL}/{z}/{x}/{y}@2x.png?taxonKey=${taxonKey}&bin=hex&hexPerTile=30&style=orange.marker&srs=EPSG:3857`,
                {
                    opacity: 0.9,
                    attribution: 'Données d\'occurrence © GBIF'
                }
            ),
            'Hexagones verts': L.tileLayer(
                `${CONFIG.GBIF_MAP_URL}/{z}/{x}/{y}@2x.png?taxonKey=${taxonKey}&bin=hex&hexPerTile=25&style=green.poly&srs=EPSG:3857`,
                {
                    opacity: 0.8,
                    attribution: 'Données d\'occurrence © GBIF'
                }
            ),
            'Style glacier': L.tileLayer(
                `${CONFIG.GBIF_MAP_URL}/{z}/{x}/{y}@2x.png?taxonKey=${taxonKey}&style=glacier.point&srs=EPSG:3857`,
                {
                    opacity: 0.8,
                    attribution: 'Données d\'occurrence © GBIF'
                }
            )
        };
        
        // Ajouter le style par défaut
        speciesLayers['Hexagones classiques'].addTo(GameState.map);

        // Ajouter le contrôle des couches
        const overlayMaps = {
            ...speciesLayers
        };

        L.control.layers(baseMaps, overlayMaps, {
            position: 'topright',
            collapsed: true
        }).addTo(GameState.map);

        // Forcer le redimensionnement de la carte après un délai
        setTimeout(() => {
            if (GameState.map) {
                GameState.map.invalidateSize();
            }
        }, 200);
    }

    showHint() {
        if (GameState.hintsUsed >= GameState.maxHints) {
            return;
        }

        const species = GameState.currentSpecies;
        const hintsContainer = document.getElementById('hints-display');
        
        let hintText = '';
        
        switch (GameState.hintsUsed) {
            case 0:
                hintText = `🔍 <strong>Classe:</strong> ${species.class || 'Non spécifiée'}`;
                break;
            case 1:
                hintText = `📊 <strong>Observations:</strong> ${species.occurrenceCount.toLocaleString()} dans GBIF`;
                break;
            case 2:
                hintText = `🌍 <strong>Famille:</strong> ${species.family || 'Non spécifiée'}`;
                break;
            case 3:
                hintText = `💡 <strong>Première lettre:</strong> ${(species.vernacularName || species.scientificName).charAt(0).toUpperCase()}`;
                break;
        }

        const hintElement = document.createElement('div');
        hintElement.className = 'hint-item';
        hintElement.innerHTML = hintText;
        hintsContainer.appendChild(hintElement);

        GameState.hintsUsed++;
        document.getElementById('hints-used').textContent = GameState.hintsUsed;
        
        // Désactiver le bouton si tous les indices sont utilisés
        if (GameState.hintsUsed >= GameState.maxHints) {
            document.getElementById('hint-btn').disabled = true;
        }
    }

    async handleInputChange(event) {
        const query = event.target.value.trim();
        const suggestionsContainer = document.getElementById('suggestions');

        if (query.length < 1) {
            suggestionsContainer.innerHTML = '';
            return;
        }

        // Débounce pour éviter trop de requêtes
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(async () => {
            try {
                // Afficher un indicateur de chargement
                suggestionsContainer.innerHTML = '<div class="suggestion-loading">Recherche en cours...</div>';
                
                const suggestions = await this.api.suggestSpecies(query, 10);
                console.log('Suggestions reçues:', suggestions); // Debug
                
                // Les résultats sont déjà un tableau depuis la nouvelle méthode
                this.displaySuggestions(suggestions, query);
            } catch (error) {
                console.error('Erreur lors de la recherche de suggestions:', error);
                suggestionsContainer.innerHTML = '<div class="suggestion-error">Erreur de recherche</div>';
            }
        }, 200);
    }

    displaySuggestions(suggestions, query) {
        const container = document.getElementById('suggestions');
        container.innerHTML = '';

        if (!suggestions || suggestions.length === 0) {
            container.innerHTML = '<div class="suggestion-empty">Aucune suggestion trouvée</div>';
            return;
        }

        suggestions.forEach(suggestion => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            
            // Essayer différents champs pour le nom
            const vernacularName = suggestion.vernacularName || suggestion.commonName;
            const scientificName = suggestion.canonicalName || suggestion.scientificName || suggestion.name;
            
            // Préférer le nom vernaculaire s'il contient le terme de recherche
            let displayName;
            if (vernacularName && vernacularName.toLowerCase().includes(query.toLowerCase())) {
                displayName = vernacularName;
            } else if (scientificName && scientificName.toLowerCase().includes(query.toLowerCase())) {
                displayName = scientificName;
            } else {
                displayName = vernacularName || scientificName;
            }
            
            if (!displayName) return; // Ignorer si pas de nom
            
            // Mise en surbrillance de la partie correspondante
            const highlightedName = this.highlightMatch(displayName, query);
            const highlightedScientific = scientificName && scientificName !== displayName ? 
                this.highlightMatch(scientificName, query) : null;
            
            div.innerHTML = `
                <span class="suggestion-name">${highlightedName}</span>
                ${highlightedScientific ? 
                    `<span class="suggestion-scientific"><em>${highlightedScientific}</em></span>` : ''
                }
                ${suggestion.rank ? `<span class="suggestion-rank">${suggestion.rank}</span>` : ''}
            `;
            
            div.addEventListener('click', () => {
                document.getElementById('species-input').value = displayName;
                container.innerHTML = '';
                // Focus sur le bouton submit après sélection
                document.getElementById('submit-btn').focus();
            });
            
            container.appendChild(div);
        });
    }
    
    highlightMatch(text, query) {
        if (!query || !text) return text;
        
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }

    checkAnswer() {
        const input = document.getElementById('species-input');
        const userAnswer = input.value.trim();
        
        if (!userAnswer) {
            return;
        }
        
        // Vérifier si c'est une répétition de la même réponse incorrecte
        if (GameState.wrongAnswers.includes(userAnswer.toLowerCase())) {
            this.showFeedback('Vous avez déjà essayé cette réponse !', 'warning');
            input.value = '';
            return;
        }

        const species = GameState.currentSpecies;
        const correctAnswers = [
            species.scientificName?.toLowerCase(),
            species.vernacularName?.toLowerCase(),
            // Ajouter des variantes possibles
            species.scientificName?.toLowerCase().split(' ')[0], // Genre seulement
            species.genus?.toLowerCase() // Genre depuis les données taxonomiques
        ].filter(name => name);

        // Recherche plus flexible
        const isCorrect = correctAnswers.some(correct => {
            // Correspondance exacte
            if (correct === userAnswer.toLowerCase()) return true;
            
            // Correspondance partielle (contient)
            if (correct.includes(userAnswer.toLowerCase()) || userAnswer.toLowerCase().includes(correct)) return true;
            
            // Similarité élevée
            if (this.calculateSimilarity(userAnswer.toLowerCase(), correct) > 0.7) return true;
            
            // Vérifier les mots individuels pour les noms composés
            const correctWords = correct.split(' ');
            const userWords = userAnswer.toLowerCase().split(' ');
            
            return correctWords.some(correctWord => 
                userWords.some(userWord => 
                    correctWord.includes(userWord) || 
                    userWord.includes(correctWord) ||
                    this.calculateSimilarity(userWord, correctWord) > 0.8
                )
            );
        });

        if (isCorrect) {
            this.showResult(true);
        } else {
            this.handleWrongAnswer(userAnswer);
        }
    }
    
    handleWrongAnswer(userAnswer) {
        // Enregistrer la réponse incorrecte
        GameState.wrongAnswers.push(userAnswer.toLowerCase());
        GameState.lives--;
        
        // Mettre à jour l'affichage des vies
        document.getElementById('current-lives').textContent = GameState.lives;
        
        // Vider le champ de saisie
        document.getElementById('species-input').value = '';
        document.getElementById('suggestions').innerHTML = '';
        
        if (GameState.lives <= 0) {
            // Plus de vies, afficher le résultat
            this.showResult(false);
        } else {
            // Encore des vies, donner du feedback
            const remainingText = GameState.lives === 1 ? 'dernière chance' : `${GameState.lives} chances restantes`;
            this.showFeedback(`Incorrect ! Il vous reste ${remainingText}.`, 'error');
            
            // Afficher les réponses déjà tentées
            this.displayWrongAnswers();
        }
    }
    
    showFeedback(message, type = 'info') {
        // Créer ou mettre à jour l'élément de feedback
        let feedbackElement = document.getElementById('answer-feedback');
        if (!feedbackElement) {
            feedbackElement = document.createElement('div');
            feedbackElement.id = 'answer-feedback';
            feedbackElement.className = 'answer-feedback';
            document.querySelector('.answer-container').insertBefore(
                feedbackElement, 
                document.querySelector('.input-group')
            );
        }
        
        feedbackElement.className = `answer-feedback ${type}`;
        feedbackElement.textContent = message;
        
        // Faire disparaître le feedback après 3 secondes
        setTimeout(() => {
            if (feedbackElement.parentNode) {
                feedbackElement.remove();
            }
        }, 3000);
    }
    
    displayWrongAnswers() {
        const hintsContainer = document.getElementById('hints-display');
        
        // Supprimer l'affichage précédent des réponses incorrectes
        const existingWrongAnswers = hintsContainer.querySelector('.wrong-answers');
        if (existingWrongAnswers) {
            existingWrongAnswers.remove();
        }
        
        if (GameState.wrongAnswers.length > 0) {
            const wrongAnswersElement = document.createElement('div');
            wrongAnswersElement.className = 'wrong-answers';
            wrongAnswersElement.innerHTML = `
                <h4>❌ Réponses déjà tentées :</h4>
                <ul>
                    ${GameState.wrongAnswers.map(answer => `<li>${answer}</li>`).join('')}
                </ul>
            `;
            hintsContainer.appendChild(wrongAnswersElement);
        }
    }

    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    showResult(isCorrect) {
        const species = GameState.currentSpecies;
        
        // Mettre à jour les statistiques
        GameState.stats.totalPlayed++;
        
        if (isCorrect) {
            const points = Math.max(10 - GameState.hintsUsed * 2, 2);
            GameState.score += points;
            GameState.streak++;
            GameState.stats.totalFound++;
            
            // Ajouter aux espèces découvertes
            if (!GameState.stats.discoveredSpecies.find(s => s.taxonKey === species.taxonKey)) {
                GameState.stats.discoveredSpecies.push({
                    taxonKey: species.taxonKey,
                    scientificName: species.scientificName,
                    vernacularName: species.vernacularName,
                    image: species.image,
                    foundAt: new Date().toISOString()
                });
            }
        } else {
            if (GameState.streak > GameState.stats.bestStreak) {
                GameState.stats.bestStreak = GameState.streak;
            }
            GameState.streak = 0;
        }

        this.saveStats();
        this.displayResultScreen(isCorrect);
    }

    displayResultScreen(isCorrect) {
        const species = GameState.currentSpecies;
        const resultContent = document.getElementById('result-content');
        
        const resultClass = isCorrect ? 'success' : 'failure';
        const resultIcon = isCorrect ? '🎉' : '😞';
        const resultTitle = isCorrect ? 'Bravo !' : 'Pas cette fois...';
        
        resultContent.innerHTML = `
            <div class="result-header ${resultClass}">
                <div class="result-icon">${resultIcon}</div>
                <h2>${resultTitle}</h2>
            </div>
            
            <div class="species-reveal">
                <div class="species-info">
                    <h3>${species.vernacularName || species.scientificName}</h3>
                    ${species.vernacularName && species.scientificName !== species.vernacularName ? 
                        `<p class="scientific-name"><em>${species.scientificName}</em></p>` : ''
                    }
                    
                    <div class="species-details">
                        <div class="detail-item">
                            <span class="label">Classe:</span>
                            <span class="value">${species.class || 'Non spécifiée'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Famille:</span>
                            <span class="value">${species.family || 'Non spécifiée'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="label">Observations:</span>
                            <span class="value">${species.occurrenceCount.toLocaleString()}</span>
                        </div>
                    </div>
                    
                    ${species.image ? 
                        `<div class="species-image">
                            <img src="${species.image}" alt="${species.scientificName}" />
                         </div>` : ''
                    }
                </div>
                
                ${isCorrect ? `
                    <div class="score-info">
                        <p>+${Math.max(10 - GameState.hintsUsed * 2, 2)} points</p>
                        <p>Série actuelle: ${GameState.streak}</p>
                    </div>
                ` : ''}
            </div>
        `;

        this.showScreen('result');
    }

    skipSpecies() {
        if (confirm('Êtes-vous sûr de vouloir passer cette espèce ?')) {
            this.showResult(false);
        }
    }

    quitGame() {
        if (confirm('Êtes-vous sûr de vouloir quitter la partie ?')) {
            this.backToHome();
        }
    }

    nextSpecies() {
        // Réinitialiser les vies pour la prochaine espèce si ce n'est pas un échec total
        if (GameState.lives > 0) {
            GameState.lives = GameState.maxLives;
        }
        this.startGame();
    }

    backToHome() {
        this.showScreen('home');
        document.getElementById('theme-selection').classList.add('hidden');
        
        // Réinitialiser l'état
        GameState.gameMode = null;
        GameState.selectedTaxon = null;
        GameState.currentSpecies = null;
        
        if (GameState.map) {
            GameState.map.off();
            GameState.map.remove();
            GameState.map = null;
        }
    }

    showStats() {
        const stats = GameState.stats;
        
        // Mettre à jour les statistiques affichées
        document.getElementById('total-played').textContent = stats.totalPlayed;
        document.getElementById('total-found').textContent = stats.totalFound;
        document.getElementById('best-streak').textContent = stats.bestStreak;
        
        const successRate = stats.totalPlayed > 0 ? 
            Math.round((stats.totalFound / stats.totalPlayed) * 100) : 0;
        document.getElementById('success-rate').textContent = `${successRate}%`;
        
        // Afficher la galerie des espèces découvertes
        const gallery = document.getElementById('species-gallery');
        gallery.innerHTML = '';
        
        if (stats.discoveredSpecies.length === 0) {
            gallery.innerHTML = '<p class="no-species">Aucune espèce découverte pour le moment</p>';
        } else {
            stats.discoveredSpecies.forEach(species => {
                const div = document.createElement('div');
                div.className = 'species-card';
                div.innerHTML = `
                    ${species.image ? 
                        `<img src="${species.image}" alt="${species.scientificName}">` :
                        '<div class="no-image">📷</div>'
                    }
                    <div class="species-name">
                        ${species.vernacularName || species.scientificName}
                    </div>
                `;
                gallery.appendChild(div);
            });
        }
        
        this.showScreen('stats');
    }

    hideStats() {
        // Retourner à l'écran précédent
        if (GameState.currentScreen === 'game') {
            this.showScreen('game');
        } else {
            this.showScreen('home');
        }
    }

    showScreen(screenName) {
        // Cacher tous les écrans
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Afficher l'écran demandé
        document.getElementById(`${screenName}-screen`).classList.add('active');
        GameState.currentScreen = screenName;

        // Gérer la visibilité du bouton de statistiques
        const statsBtn = document.getElementById('stats-btn');
        if (screenName === 'home' || screenName === 'game') {
            statsBtn.style.display = 'block';
        } else {
            statsBtn.style.display = 'none';
        }
    }

    loadStats() {
        const savedStats = localStorage.getItem('2vineKiViLa-stats');
        if (savedStats) {
            GameState.stats = { ...GameState.stats, ...JSON.parse(savedStats) };
        }
    }

    saveStats() {
        localStorage.setItem('2vineKiViLa-stats', JSON.stringify(GameState.stats));
    }
}

// Fonctions utilitaires
function updateLoadingStep(text) {
    const loadingStep = document.getElementById('loading-step');
    if (loadingStep) {
        loadingStep.textContent = text;
    }
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    new GameUI();
});