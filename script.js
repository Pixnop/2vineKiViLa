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
    },
    // MODE DEBUG - Mettre à true pour activer les fonctionnalités de test
    DEBUG_MODE: false
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
            limit: 300,
            ...filters
        };
        
        // Si pas d'offset défini, en créer un aléatoire
        if (!params.offset) {
            params.offset = Math.floor(Math.random() * 10000);
        }

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
    
    // Obtenir les descriptions d'une espèce
    async getSpeciesDescriptions(taxonKey) {
        return this.makeRequest(`/species/${taxonKey}/descriptions`);
    }
    
    // Obtenir les distributions d'une espèce
    async getSpeciesDistributions(taxonKey) {
        return this.makeRequest(`/species/${taxonKey}/distributions`);
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

    // Recherche d'espèces par classe taxonomique spécifique (pour reptiles)
    async searchSpeciesByClass(className, limit = 100) {
        return await this.makeRequest('/species/search', {
            class: className,
            rank: 'SPECIES',
            limit: limit,
            offset: Math.floor(Math.random() * 500),
            status: 'ACCEPTED'
        });
    }
}

// Classe pour la sélection intelligente d'espèces
class SpeciesSelector {
    constructor(api) {
        this.api = api;
    }

    // Sélectionner une espèce selon le mode de jeu
    async selectSpecies(gameMode, classKey = null) {
        const maxAttempts = 10;
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                updateLoadingStep(`Recherche d'espèces... (${attempts + 1}/${maxAttempts})`);
                
                // Approche simplifiée : recherche sans filtrage complexe
                const params = {
                    hasCoordinate: true,
                    hasGeospatialIssue: false,
                    limit: 300,
                    offset: Math.floor(Math.random() * 10000)
                };
                
                // Si mode thématique, ajouter un filtre par taxon
                if (classKey && gameMode === 'thematic') {
                    // Utiliser directement le taxonKey pour filtrer les descendants
                    params.taxonKey = classKey;
                    // Réduire l'offset pour les classes avec moins d'occurrences
                    params.offset = Math.floor(Math.random() * 1000);
                    
                    if (CONFIG.DEBUG_MODE) {
                        console.log(`DEBUG: Recherche thématique avec taxonKey=${classKey}`);
                    }
                }
                
                const occurrenceData = await this.api.searchOccurrences(params);
                
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

                // Mélanger les taxonKeys pour plus d'aléatoire
                const shuffledTaxonKeys = this.shuffleArray(taxonKeys);
                
                // Tester les espèces une par une
                updateLoadingStep('Évaluation des espèces candidates...');
                
                for (const candidateTaxonKey of shuffledTaxonKeys.slice(0, 10)) {
                    const species = await this.evaluateSpecies(candidateTaxonKey, gameMode, classKey);
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

        // Si échec en mode thématique, essayer sans filtre
        if (classKey && gameMode === 'thematic') {
            console.warn('Recherche thématique échouée, essai sans filtre de classe...');
            return this.selectSpeciesWithoutClassFilter(gameMode, classKey);
        }

        throw new Error('Impossible de trouver une espèce appropriée après plusieurs tentatives');
    }
    
    // Méthode de secours : recherche sans filtre puis validation
    async selectSpeciesWithoutClassFilter(gameMode, expectedClassKey) {
        const maxAttempts = 20;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            try {
                updateLoadingStep(`Recherche élargie... (${attempts + 1}/${maxAttempts})`);
                
                // Recherche générale
                const params = {
                    hasCoordinate: true,
                    hasGeospatialIssue: false,
                    limit: 500,
                    offset: Math.floor(Math.random() * 50000)
                };
                
                const occurrenceData = await this.api.searchOccurrences(params);
                
                if (!occurrenceData.results || occurrenceData.results.length === 0) {
                    attempts++;
                    continue;
                }

                // Extraire et mélanger les taxonKeys
                const taxonKeys = [...new Set(
                    occurrenceData.results.map(r => r.taxonKey).filter(key => key)
                )];
                
                const shuffledTaxonKeys = this.shuffleArray(taxonKeys);
                
                // Tester plus d'espèces pour trouver une de la bonne classe
                for (const candidateTaxonKey of shuffledTaxonKeys.slice(0, 30)) {
                    const species = await this.evaluateSpecies(candidateTaxonKey, gameMode, expectedClassKey);
                    if (species) {
                        return species;
                    }
                }
                
                attempts++;
            } catch (error) {
                console.error('Erreur lors de la recherche élargie:', error);
                attempts++;
            }
        }
        
        throw new Error('Impossible de trouver une espèce de la classe demandée');
    }
    
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    buildFilters(gameMode, classKey) {
        const filters = {};

        // Pour le mode thématique, on ne peut pas filtrer directement par classe
        // On fera la validation après coup
        
        // Ajouter des filtres selon le mode
        switch (gameMode) {
            case 'popular':
                // Espèces populaires
                filters.year = '2020,2024'; // Récentes pour avoir plus de données
                break;
            case 'discovery':
                // Filtrer par années récentes pour avoir plus de données
                filters.year = '2015,2024';
                break;
            case 'expert':
                // Filtrer pour des espèces plus rares
                filters.basisOfRecord = 'HUMAN_OBSERVATION';
                filters.year = '2010,2024';
                break;
            case 'thematic':
                // Pas de filtre spécifique, on validera la classe après
                filters.mediaType = 'StillImage'; // Avoir des images
                break;
        }

        return filters;
    }

    async evaluateSpecies(taxonKey, gameMode, expectedClassKey = null) {
        try {
            updateLoadingStep(`Évaluation de l'espèce ${taxonKey}...`);

            // Obtenir les détails de base
            const [speciesDetails, occurrenceCount] = await Promise.all([
                this.api.getSpeciesDetails(taxonKey),
                this.api.countOccurrences(taxonKey)
            ]);
            
            // Si mode thématique, vérifier que l'espèce appartient bien à la classe sélectionnée
            if (expectedClassKey) {
                // Les classes exactes dans GBIF
                const classMapping = {
                    '212': 'Aves',        // Oiseaux
                    '359': 'Mammalia',    // Mammifères  
                    '216': 'Insecta',     // Insectes
                    '11592253': 'Squamata', // Reptiles (Squamata - lézards, serpents)
                    '131': 'Amphibia',    // Amphibiens
                    '238': 'Actinopterygii' // Poissons osseux
                };
                
                const expectedClassName = classMapping[expectedClassKey];
                if (expectedClassName && speciesDetails.class !== expectedClassName) {
                    // Debug - afficher la classe réelle vs attendue
                    if (CONFIG.DEBUG_MODE) {
                        console.log(`DEBUG: Classe trouvée "${speciesDetails.class}" != attendue "${expectedClassName}" pour ${speciesDetails.scientificName}`);
                    }
                    
                    // Vérifier des variantes possibles du nom de classe
                    const classVariants = {
                        'Squamata': ['Squamata'], // Squamata direct (lézards, serpents)
                        'Aves': ['Aves'],
                        'Mammalia': ['Mammalia'],
                        'Insecta': ['Insecta', 'Hexapoda'],
                        'Amphibia': ['Amphibia'],
                        'Actinopterygii': ['Actinopterygii', 'Osteichthyes']
                    };
                    
                    const validVariants = classVariants[expectedClassName] || [expectedClassName];
                    if (!validVariants.includes(speciesDetails.class)) {
                        console.log(`Espèce ${speciesDetails.scientificName} rejectée : classe "${speciesDetails.class}" non acceptée pour "${expectedClassName}"`);
                        return null;
                    }
                }
            }

            // Vérifier si l'espèce respecte les critères
            if (!this.isSpeciesPlayable(speciesDetails, occurrenceCount, gameMode)) {
                return null;
            }

            // Obtenir des informations supplémentaires
            updateLoadingStep(`Récupération des détails pour ${speciesDetails.canonicalName}...`);
            
            const [vernacularNames, media, descriptions, distributions] = await Promise.all([
                this.api.getVernacularNames(taxonKey).catch(() => ({ results: [] })),
                this.api.getSpeciesMedia(taxonKey).catch(() => ({ results: [] })),
                this.api.getSpeciesDescriptions(taxonKey).catch(() => ({ results: [] })),
                this.api.getSpeciesDistributions(taxonKey).catch(() => ({ results: [] }))
            ]);

            // Construire l'objet espèce complet
            const species = {
                taxonKey,
                scientificName: speciesDetails.canonicalName || speciesDetails.scientificName,
                vernacularName: this.extractBestVernacularName(vernacularNames.results),
                taxonomicClass: this.extractTaxonomicInfo(speciesDetails),
                occurrenceCount,
                continent: this.extractContinentInfo(distributions.results),
                image: this.extractBestImage(media.results),
                descriptions: this.extractDescriptions(descriptions.results),
                distributions: this.extractDistributions(distributions.results),
                kingdom: speciesDetails.kingdom,
                phylum: speciesDetails.phylum,
                class: speciesDetails.class,
                order: speciesDetails.order,
                family: speciesDetails.family,
                genus: speciesDetails.genus,
                habitat: speciesDetails.habitat,
                threatStatus: speciesDetails.threatStatus
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

    extractContinentInfo(distributions) {
        if (!distributions || distributions.length === 0) {
            return [];
        }
        
        // Extraire les pays et localités
        const locations = distributions.map(d => d.locality || d.country || '').filter(l => l);
        return [...new Set(locations)].slice(0, 5); // Limiter à 5 localisations
    }
    
    extractDescriptions(descriptions) {
        if (!descriptions || descriptions.length === 0) {
            return {};
        }
        
        const descObj = {};
        descriptions.forEach(desc => {
            if (desc.type && desc.description) {
                // Stocker par type de description
                descObj[desc.type] = desc.description;
            }
        });
        
        return descObj;
    }
    
    extractDistributions(distributions) {
        if (!distributions || distributions.length === 0) {
            return [];
        }
        
        return distributions
            .map(d => ({
                location: d.locality || d.country || d.locationId,
                status: d.status,
                establishmentMeans: d.establishmentMeans
            }))
            .filter(d => d.location && this.isValidLocation(d.location));
    }
    
    isValidLocation(location) {
        if (!location || typeof location !== 'string') return false;
        
        // Filtrer les localisations peu informatives
        const invalidLocations = [
            'global', 'world', 'worldwide', 'cosmopolitan', 'unknown',
            'not specified', 'unspecified', 'various', 'multiple',
            'widespread', 'pantropical', 'circumglobal'
        ];
        
        return !invalidLocations.includes(location.toLowerCase().trim());
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
                const classKey = e.currentTarget.dataset.taxon;
                this.selectTheme(classKey);
            });
        });

        // Boutons de navigation
        document.getElementById('back-to-modes').addEventListener('click', () => {
            this.showScreen('home');
            document.getElementById('theme-selection').classList.add('hidden');
        });
        
        // Mode debug : raccourcis clavier
        if (CONFIG.DEBUG_MODE) {
            this.initDebugControls();
        }

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
    
    initDebugControls() {
        console.log('🐛 Mode DEBUG activé ! Raccourcis disponibles :');
        console.log('- Ctrl+D : Afficher les réponses');
        console.log('- Ctrl+H : Révéler tous les indices');
        console.log('- Ctrl+S : Passer à l\'espèce suivante');
        console.log('- Ctrl+W : Forcer une réponse correcte');
        
        document.addEventListener('keydown', (e) => {
            if (!e.ctrlKey || GameState.currentScreen !== 'game') return;
            
            switch(e.key.toLowerCase()) {
                case 'd':
                    e.preventDefault();
                    this.debugShowAnswers();
                    break;
                case 'h':
                    e.preventDefault();
                    this.debugShowAllHints();
                    break;
                case 's':
                    e.preventDefault();
                    this.nextSpecies();
                    break;
                case 'w':
                    e.preventDefault();
                    this.debugAutoWin();
                    break;
            }
        });
    }
    
    debugShowAnswers() {
        const species = GameState.currentSpecies;
        const answers = [
            species.scientificName,
            species.vernacularName,
            species.genus
        ].filter(name => name);
        
        alert(`🐛 DEBUG - Réponses acceptées :\n${answers.join('\n')}`);
    }
    
    debugShowAllHints() {
        while (GameState.hintsUsed < GameState.maxHints) {
            this.showHint();
        }
    }
    
    debugAutoWin() {
        const species = GameState.currentSpecies;
        const winAnswer = species.vernacularName || species.scientificName;
        document.getElementById('species-input').value = winAnswer;
        this.checkAnswer();
    }

    selectGameMode(mode) {
        GameState.gameMode = mode;
        
        if (mode === 'thematic') {
            document.getElementById('theme-selection').classList.remove('hidden');
        } else {
            this.startGame();
        }
    }

    selectTheme(classKey) {
        GameState.selectedTaxon = classKey;
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

        // Mode debug : afficher les informations de l'espèce
        if (CONFIG.DEBUG_MODE) {
            this.showDebugInfo();
        }

        // Initialiser la carte
        await this.initMap();
    }
    
    showDebugInfo() {
        const species = GameState.currentSpecies;
        console.group('🐛 MODE DEBUG - Informations de l\'espèce');
        console.log('Nom scientifique:', species.scientificName);
        console.log('Nom vernaculaire:', species.vernacularName);
        console.log('TaxonKey:', species.taxonKey);
        console.log('Classe:', species.class);
        console.log('Famille:', species.family);
        console.log('Genre:', species.genus);
        console.log('Occurrences:', species.occurrenceCount);
        console.log('Image:', species.image);
        console.groupEnd();
        
        // Afficher un panneau debug dans l'interface (optionnel)
        const debugPanel = document.getElementById('debug-panel') || this.createDebugPanel();
        debugPanel.innerHTML = `
            <h4>🐛 DEBUG</h4>
            <p><strong>Réponses acceptées :</strong></p>
            <ul>
                ${species.scientificName ? `<li><code>${species.scientificName}</code></li>` : ''}
                ${species.vernacularName ? `<li><code>${species.vernacularName}</code></li>` : ''}
                ${species.genus ? `<li><code>${species.genus}</code> (genre)</li>` : ''}
            </ul>
            <p><strong>TaxonKey :</strong> ${species.taxonKey}</p>
            <p><strong>Occurrences :</strong> ${species.occurrenceCount?.toLocaleString()}</p>
            <button onclick="this.parentElement.style.display='none'">Masquer</button>
        `;
        debugPanel.style.display = 'block';
    }
    
    createDebugPanel() {
        const panel = document.createElement('div');
        panel.id = 'debug-panel';
        panel.className = 'debug-panel';
        document.querySelector('.game-panel').appendChild(panel);
        return panel;
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
        
        // Adapter les indices selon le mode de jeu
        if (GameState.gameMode === 'thematic') {
            // En mode thématique, informations spécialisées pour professionnels
            // JAMAIS d'ordre puisqu'on a déjà sélectionné la classe
            switch (GameState.hintsUsed) {
                case 0:
                    hintText = this.getThematicEcologyHint(species);
                    break;
                case 1:
                    hintText = this.getThematicHabitatHint(species);
                    break;
                case 2:
                    hintText = this.getThematicMorphologyHint(species);
                    break;
                case 3:
                    hintText = `💡 <strong>Première lettre:</strong> ${(species.vernacularName || species.scientificName).charAt(0).toUpperCase()}`;
                    break;
            }
        } else {
            // Mode normal avec explications pour le grand public
            switch (GameState.hintsUsed) {
                case 0:
                    // En mode normal, on donne d'abord le type d'animal seulement si pas évident
                    hintText = this.getTaxonomicHint(species);
                    break;
                case 1:
                    hintText = this.getDescriptionHint(species);
                    break;
                case 2:
                    hintText = this.getHabitatOrDistributionHint(species);
                    break;
                case 3:
                    hintText = `💡 <strong>Première lettre:</strong> ${(species.vernacularName || species.scientificName).charAt(0).toUpperCase()}`;
                    break;
            }
        }
        
        // DEBUG: Vérifier le mode de jeu
        if (CONFIG.DEBUG_MODE) {
            console.log(`DEBUG: Mode de jeu = ${GameState.gameMode}, Indice ${GameState.hintsUsed + 1}: ${hintText}`);
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
    
    getTaxonomicHint(species) {
        // Indice taxonomique intelligent
        if (species.class === 'Aves') {
            return `🦅 <strong>Type d'animal:</strong> C'est un oiseau`;
        } else if (species.class === 'Mammalia') {
            return `🦬 <strong>Type d'animal:</strong> C'est un mammifère`;
        } else if (species.class === 'Reptilia') {
            return `🦎 <strong>Type d'animal:</strong> C'est un reptile`;
        } else if (species.class === 'Amphibia') {
            return `🐸 <strong>Type d'animal:</strong> C'est un amphibien`;
        } else if (species.class === 'Insecta') {
            return `🦋 <strong>Type d'animal:</strong> C'est un insecte`;
        } else if (species.class === 'Actinopterygii') {
            return `🐟 <strong>Type d'animal:</strong> C'est un poisson osseux`;
        } else if (species.kingdom === 'Plantae') {
            return `🌿 <strong>Type d'organisme:</strong> C'est une plante`;
        } else if (species.kingdom === 'Fungi') {
            return `🍄 <strong>Type d'organisme:</strong> C'est un champignon`;
        } else {
            return `🔍 <strong>Classe:</strong> ${species.class || 'Non spécifiée'}`;
        }
    }
    
    getDescriptionHint(species) {
        // Utiliser les vraies descriptions de l'API GBIF
        if (!species.descriptions || Object.keys(species.descriptions).length === 0) {
            // Fallback intelligent basé sur la famille pour les reptiles
            if (species.class === 'Squamata') {
                return this.getSquamataGeneralInfo(species);
            }
            // Fallback sur l'ordre taxonomique pour les autres
            return `🏛️ <strong>Famille:</strong> ${species.family || species.class}`;
        }
        
        // Priorités pour les types de descriptions utiles
        const priorityTypes = [
            'morphology',
            'diagnostic_description',
            'biology',
            'behaviour',
            'habitat', 
            'description',
            'general',
            'ecology',
            'distribution'
        ];
        
        for (const type of priorityTypes) {
            if (species.descriptions[type]) {
                let desc = species.descriptions[type];
                // Nettoyer et raccourcir la description
                desc = this.cleanDescription(desc);
                if (desc.length > 0) {
                    const icon = this.getDescriptionIcon(type);
                    return `${icon} <strong>${this.getDescriptionLabel(type)}:</strong> ${desc}`;
                }
            }
        }
        
        // Si aucune description utilisable, donner des infos sur la famille
        return `🏛️ <strong>Famille:</strong> ${species.family || 'Non spécifiée'}`;
    }
    
    getHabitatOrDistributionHint(species) {
        // Prioriser uniquement les descriptions d'habitat écologique (pas de distribution géographique)
        if (species.descriptions) {
            const habitatTypes = ['habitat', 'ecology'];
            for (const type of habitatTypes) {
                if (species.descriptions[type]) {
                    const desc = this.cleanDescription(species.descriptions[type]);
                    // Filtrer les descriptions qui mentionnent uniquement la géographie
                    if (desc && desc.length > 10 && !this.isGeographicDescription(desc)) {
                        return `🌳 <strong>Habitat:</strong> ${desc}`;
                    }
                }
            }
        }
        
        // Essayer les distributions pour les infos géographiques UTILES (pas redondantes avec la carte)
        if (species.distributions && species.distributions.length > 0) {
            const habitatInfo = this.extractHabitatFromDistribution(species.distributions);
            if (habitatInfo) {
                return habitatInfo;
            }
        }
        
        // Pour les reptiles, donner des informations basées sur le genre/famille
        if (species.class === 'Squamata') {
            return this.getSquamataEcologyInfo(species);
        }
        
        // En mode thématique, donner la famille (pas l'ordre qui est redondant)
        if (GameState.gameMode === 'thematic' && species.family) {
            return `🏛️ <strong>Famille:</strong> ${species.family}`;
        }
        
        // En mode normal, donner des informations explicatives sur l'ordre
        if (GameState.gameMode !== 'thematic' && species.order && species.order !== 'Non spécifié') {
            const orderHint = this.getOrderBasedHint(species);
            if (orderHint) {
                return orderHint;
            }
        }
        
        // Fallback sur la famille
        return `🏛️ <strong>Famille:</strong> ${species.family || 'Non spécifiée'}`;
    }
    
    extractHabitatFromDistribution(distributions) {
        // Chercher des informations d'habitat plutôt que juste géographiques
        for (const dist of distributions) {
            if (dist.locality) {
                const locality = dist.locality.toLowerCase();
                // Infos utiles non visibles sur la carte
                if (locality.includes('wetland') || locality.includes('marsh') || locality.includes('swamp')) {
                    return `🌊 <strong>Habitat:</strong> Zones humides et marécages`;
                } else if (locality.includes('desert')) {
                    return `🏜️ <strong>Habitat:</strong> Environnements désertiques`;
                } else if (locality.includes('forest') || locality.includes('woodland')) {
                    return `🌲 <strong>Habitat:</strong> Forêts et zones boisées`;
                } else if (locality.includes('coastal') || locality.includes('marine')) {
                    return `🏖️ <strong>Habitat:</strong> Zones côtières`;
                } else if (locality.includes('mountain') || locality.includes('alpine')) {
                    return `⛰️ <strong>Habitat:</strong> Régions montagneuses`;
                }
            }
        }
        return null;
    }
    
    getSquamataEcologyInfo(species) {
        const genus = species.genus?.toLowerCase() || '';
        const family = species.family?.toLowerCase() || '';
        
        // Informations écologiques spécifiques
        if (genus.includes('agkistrodon')) {
            return `🌊 <strong>Écologie:</strong> Serpent semi-aquatique, active près de l'eau`;
        } else if (family.includes('viper')) {
            return `🌡️ <strong>Activité:</strong> Serpent principalement crépusculaire et nocturne`;
        } else if (family.includes('python')) {
            return `🌙 <strong>Activité:</strong> Serpent principalement nocturne, ambush predator`;
        } else if (family.includes('gecko')) {
            return `🌙 <strong>Activité:</strong> Lézard nocturne, grimpe sur les surfaces lisses`;
        } else if (family.includes('iguan')) {
            return `☀️ <strong>Thermorégulation:</strong> Lézard héliophile, se réchauffe au soleil`;
        } else if (family.includes('scinc')) {
            return `🏃 <strong>Comportement:</strong> Lézard agile, souvent fouisseur`;
        } else {
            return `🏛️ <strong>Famille:</strong> ${species.family}`;
        }
    }
    
    isGeographicDescription(description) {
        // Filtrer les descriptions qui ne contiennent que de la géographie (déjà visible sur carte)
        const geographicKeywords = [
            'britain', 'scandinavia', 'france', 'europe', 'siberia', 'russia', 'asia',
            'america', 'africa', 'australia', 'continent', 'country', 'region',
            'north', 'south', 'east', 'west', 'central', 'distribution',
            'distributed', 'found in', 'occurs in', 'native to', 'endemic to',
            'range', 'widespread', 'common in', 'abundant in', 'river', 'sea'
        ];
        
        const desc = description.toLowerCase();
        
        // Si la description contient principalement des mots géographiques
        const geographicWordsCount = geographicKeywords.filter(keyword => 
            desc.includes(keyword)
        ).length;
        
        const totalWords = desc.split(' ').length;
        
        // Si plus de 40% des informations sont géographiques, on considère que c'est redondant
        return geographicWordsCount > 3 || (geographicWordsCount / totalWords > 0.4);
    }
    
    isSpecificLocation(location) {
        if (!this.isValidLocation(location)) return false;
        
        // Vérifier que c'est assez spécifique
        const tooGeneral = [
            'africa', 'asia', 'europe', 'america', 'oceania',
            'north america', 'south america', 'central america',
            'mediterranean', 'tropical', 'temperate', 'arctic',
            'atlantic', 'pacific', 'indian ocean'
        ];
        
        return !tooGeneral.includes(location.toLowerCase().trim());
    }
    
    formatLocations(locations) {
        if (locations.length <= 2) {
            return `Présent en ${locations.join(' et ')}`;
        } else if (locations.length === 3) {
            return `Présent en ${locations[0]}, ${locations[1]} et ${locations[2]}`;
        } else {
            return `Présent en ${locations.slice(0, 3).join(', ')} et autres régions`;
        }
    }
    
    getOrderBasedHint(species) {
        // Pour le grand public uniquement - donner des informations explicatives sur l'ordre
        const order = species.order;
        const classType = species.class;
        
        // Indices explicatifs pour le grand public (mode non-thématique)
        if (classType === 'Aves') {
            const birdHints = {
                'Passeriformes': '🎵 <strong>Type:</strong> Oiseau chanteur (passereaux)',
                'Falconiformes': '🦅 <strong>Type:</strong> Rapace diurne', 
                'Strigiformes': '🦉 <strong>Type:</strong> Rapace nocturne',
                'Anseriformes': '🦆 <strong>Type:</strong> Oiseau aquatique (canards, oies)',
                'Galliformes': '🐓 <strong>Type:</strong> Gallinacé (poules, faisans)'
            };
            return birdHints[order] || `🏛️ <strong>Ordre:</strong> ${order}`;
        }
        
        if (classType === 'Mammalia') {
            const mammalHints = {
                'Carnivora': '🦁 <strong>Régime:</strong> Carnivore',
                'Chiroptera': '🦇 <strong>Type:</strong> Chauve-souris',
                'Cetacea': '🐋 <strong>Milieu:</strong> Mammifère marin',
                'Proboscidea': '🐘 <strong>Type:</strong> Éléphant'
            };
            return mammalHints[order] || `🏛️ <strong>Ordre:</strong> ${order}`;
        }
        
        // Pour les autres classes, afficher l'ordre directement
        return `🏛️ <strong>Ordre:</strong> ${order}`;
    }
    
    getSquamataTypeHint(species) {
        // Déterminer le type de Squamata basé sur la famille
        const family = species.family?.toLowerCase() || '';
        
        if (family.includes('python') || family.includes('boa')) {
            return `🐍 <strong>Type:</strong> Serpent constricteur (famille des ${species.family})`;
        } else if (family.includes('viper') || family.includes('crotal') || family.includes('elap')) {
            return `🐍 <strong>Type:</strong> Serpent venimeux (famille des ${species.family})`;
        } else if (family.includes('colubr') || family.includes('natric') || family.includes('serpent')) {
            return `🐍 <strong>Type:</strong> Serpent (famille des ${species.family})`;
        } else if (family.includes('gecko') || family.includes('gekkon')) {
            return `🦎 <strong>Type:</strong> Gecko (famille des ${species.family})`;
        } else if (family.includes('lacert') || family.includes('scinc') || family.includes('agam') || family.includes('iguan')) {
            return `🦎 <strong>Type:</strong> Lézard (famille des ${species.family})`;
        } else if (family.includes('chamae')) {
            return `🦎 <strong>Type:</strong> Caméléon (famille des ${species.family})`;
        } else if (family.includes('monitor') || family.includes('varan')) {
            return `🦎 <strong>Type:</strong> Varan (famille des ${species.family})`;
        } else if (species.family) {
            return `🏛️ <strong>Famille:</strong> ${species.family}`;
        } else {
            return `🏛️ <strong>Ordre:</strong> Squamata (lézards et serpents)`;
        }
    }
    
    getSquamataGeneralInfo(species) {
        const family = species.family?.toLowerCase() || '';
        const genus = species.genus?.toLowerCase() || '';
        
        // Informations spécifiques par famille de reptiles
        if (family.includes('viper') || family.includes('crotalidae')) {
            return `⚠️ <strong>Dangerosité:</strong> Serpent venimeux à crochets rétractables`;
        } else if (family.includes('elapidae')) {
            return `⚠️ <strong>Dangerosité:</strong> Serpent très venimeux (corail, cobra, mamba)`;
        } else if (family.includes('python')) {
            return `🔄 <strong>Chasse:</strong> Serpent constricteur, tue par étouffement`;
        } else if (family.includes('boa')) {
            return `🔄 <strong>Chasse:</strong> Serpent constricteur de taille moyenne à grande`;
        } else if (family.includes('colubr')) {
            return `🐍 <strong>Caractéristique:</strong> Serpent généralement non venimeux`;
        } else if (family.includes('gecko')) {
            return `🦎 <strong>Adaptation:</strong> Lézard nocturne aux doigts adhésifs`;
        } else if (family.includes('iguan')) {
            return `🦎 <strong>Régime:</strong> Lézard herbivore ou omnivore`;
        } else if (family.includes('agam') || family.includes('dragon')) {
            return `🦎 <strong>Comportement:</strong> Lézard diurne souvent territorial`;
        } else if (family.includes('varan') || family.includes('monitor')) {
            return `🦎 <strong>Taille:</strong> Grand lézard carnivore intelligent`;
        } else if (family.includes('scinc')) {
            return `🦎 <strong>Habitat:</strong> Lézard fouisseur aux écailles lisses`;
        } else if (genus.includes('agkistrodon')) {
            return `🌊 <strong>Habitat:</strong> Serpent semi-aquatique des zones humides`;
        } else {
            return `🏛️ <strong>Famille:</strong> ${species.family}`;
        }
    }
    
    // === NOUVEAUX INDICES THÉMATIQUES BASÉS SUR LES VRAIES DONNÉES GBIF ===
    
    getThematicEcologyHint(species) {
        // Indice 1 : Écologie et comportement basé sur les vraies données GBIF
        
        // 1. Essayer les descriptions d'écologie/biologie
        if (species.descriptions) {
            const ecologyTypes = ['biology', 'behaviour', 'ecology', 'life_history'];
            for (const type of ecologyTypes) {
                if (species.descriptions[type]) {
                    const cleanDesc = this.cleanDescription(species.descriptions[type]);
                    if (cleanDesc && cleanDesc.length > 10) {
                        return `🧬 <strong>Biologie:</strong> ${cleanDesc}`;
                    }
                }
            }
        }
        
        // 2. Informations basées sur le nom vernaculaire
        const vernacularName = species.vernacularName?.toLowerCase() || '';
        if (vernacularName.includes('cat-eyed')) {
            return `👁️ <strong>Adaptation:</strong> Serpent aux pupilles verticales (vision nocturne)`;
        } else if (vernacularName.includes('rat snake') || vernacularName.includes('rat-snake')) {
            return `🐀 <strong>Régime:</strong> Spécialisé dans la chasse aux rongeurs`;
        } else if (vernacularName.includes('water') || vernacularName.includes('aquatic')) {
            return `🌊 <strong>Écologie:</strong> Serpent semi-aquatique`;
        } else if (vernacularName.includes('tree') || vernacularName.includes('arboreal')) {
            return `🌳 <strong>Habitat:</strong> Serpent arboricole`;
        }
        
        // 3. Informations basées sur la famille selon la classe
        const family = species.family?.toLowerCase() || '';
        const order = species.order?.toLowerCase() || '';
        
        if (species.class === 'Squamata') {
            if (family.includes('colubr')) {
                return `🐍 <strong>Comportement:</strong> Serpent généralement diurne, actif chasseur`;
            } else if (family.includes('viper')) {
                return `⚡ <strong>Chasse:</strong> Serpent à détection thermique, embuscade`;
            } else if (family.includes('python')) {
                return `🔄 <strong>Stratégie:</strong> Prédateur ambusheur, constriction puissante`;
            } else if (family.includes('elap')) {
                return `💀 <strong>Venin:</strong> Neurotoxique, très dangereux`;
            }
        } else if (species.class === 'Aves') {
            if (order.includes('passeri')) {
                return `🎵 <strong>Comportement:</strong> Oiseau chanteur, vocalises complexes`;
            } else if (order.includes('falcon') || order.includes('accipitri')) {
                return `🦅 <strong>Chasse:</strong> Rapace diurne, vision perçante`;
            } else if (order.includes('strigiformes')) {
                return `🦉 <strong>Chasse:</strong> Rapace nocturne, audition exceptionnelle`;
            } else if (family.includes('corvid')) {
                return `🧠 <strong>Intelligence:</strong> Oiseaux très intelligents, utilisation d'outils`;
            }
        } else if (species.class === 'Mammalia') {
            if (order.includes('carniv')) {
                return `🦷 <strong>Régime:</strong> Carnivore, dentition adaptée à la prédation`;
            } else if (order.includes('rodent') || order.includes('rodentia')) {
                return `🦷 <strong>Adaptation:</strong> Incisives à croissance continue`;
            } else if (order.includes('chiropter')) {
                return `🦇 <strong>Adaptation:</strong> Seul mammifère volant, écholocation`;
            } else if (family.includes('felid')) {
                return `🐾 <strong>Chasse:</strong> Prédateur solitaire, griffes rétractiles`;
            }
        } else if (species.class === 'Insecta') {
            if (order.includes('dipter')) {
                return `✈️ <strong>Vol:</strong> Insecte à deux ailes, vol très agile`;
            } else if (order.includes('lepidopter')) {
                return `🦋 <strong>Métamorphose:</strong> Transformation complète chenille→papillon`;
            } else if (order.includes('coleopter')) {
                return `🛡️ <strong>Protection:</strong> Élytres rigides protégeant les ailes`;
            } else if (family.includes('asilid')) {
                return `🏹 <strong>Chasse:</strong> Mouche prédatrice, capture proies en vol`;
            }
        }
        
        // 4. Fallback sur le genre
        return `🏛️ <strong>Genre:</strong> ${species.genus}`;
    }
    
    getThematicHabitatHint(species) {
        // Indice 2 : Habitat et répartition écologique
        
        // 1. Descriptions d'habitat des données GBIF
        if (species.descriptions) {
            const habitatTypes = ['habitat', 'ecology', 'distribution'];
            for (const type of habitatTypes) {
                if (species.descriptions[type]) {
                    const cleanDesc = this.cleanDescription(species.descriptions[type]);
                    if (cleanDesc && cleanDesc.length > 10 && this.containsHabitatInfo(cleanDesc)) {
                        return `🌍 <strong>Habitat:</strong> ${cleanDesc}`;
                    }
                }
            }
        }
        
        // 2. Analyser les distributions pour extraire l'écosystème
        if (species.distributions && species.distributions.length > 0) {
            const ecosystemInfo = this.extractEcosystemFromDistributions(species.distributions);
            if (ecosystemInfo) {
                return ecosystemInfo;
            }
        }
        
        // 3. Informations générales basées sur la famille selon la classe
        const family = species.family?.toLowerCase() || '';
        const order = species.order?.toLowerCase() || '';
        
        if (species.class === 'Squamata') {
            if (family.includes('colubr')) {
                return `🌲 <strong>Écosystème:</strong> Forêts tropicales et zones boisées`;
            } else if (family.includes('viper')) {
                return `🍂 <strong>Écosystème:</strong> Zones de broussailles et lisières forestières`;
            } else if (family.includes('python')) {
                return `🌴 <strong>Écosystème:</strong> Forêts tropicales denses et humides`;
            }
        } else if (species.class === 'Aves') {
            if (order.includes('passeri')) {
                return `🌳 <strong>Habitat:</strong> Forêts, jardins et zones arborées`;
            } else if (family.includes('corvid')) {
                return `🏘️ <strong>Habitat:</strong> Adaptable, zones urbaines et rurales`;
            } else if (order.includes('falcon') || order.includes('accipitri')) {
                return `🏔️ <strong>Habitat:</strong> Territoires ouverts, chasse en altitude`;
            }
        } else if (species.class === 'Mammalia') {
            if (order.includes('carniv')) {
                return `🌲 <strong>Territoire:</strong> Prédateur territorial, grande aire de chasse`;
            } else if (family.includes('felid')) {
                return `🌿 <strong>Habitat:</strong> Forêts et zones boisées, territoires étendus`;
            }
        } else if (species.class === 'Insecta') {
            if (order.includes('dipter')) {
                return `🌺 <strong>Habitat:</strong> Zones florales, reproduction près de l'eau`;
            } else if (family.includes('asilid')) {
                return `☀️ <strong>Habitat:</strong> Zones ensoleillées, perchoirs pour chasser`;
            }
        }
        
        // 4. Fallback sur la répartition générale
        return `🏛️ <strong>Famille:</strong> ${species.family}`;
    }
    
    getThematicMorphologyHint(species) {
        // Indice 3 : Morphologie et caractères diagnostiques
        
        // 1. Descriptions morphologiques des données GBIF
        if (species.descriptions) {
            const morphTypes = ['morphology', 'diagnostic_description', 'description'];
            for (const type of morphTypes) {
                if (species.descriptions[type]) {
                    const cleanDesc = this.cleanDescription(species.descriptions[type]);
                    if (cleanDesc && cleanDesc.length > 10) {
                        return `📏 <strong>Morphologie:</strong> ${cleanDesc}`;
                    }
                }
            }
        }
        
        // 2. Caractéristiques basées sur le nom vernaculaire
        const vernacularName = species.vernacularName?.toLowerCase() || '';
        if (vernacularName.includes('cat-eyed')) {
            return `👁️ <strong>Caractéristique:</strong> Pupilles verticales distinctives`;
        } else if (vernacularName.includes('northern')) {
            return `🧭 <strong>Répartition:</strong> Populations plus septentrionales de l'espèce`;
        } else if (vernacularName.includes('ornata') || vernacularName.includes('ornate')) {
            return `🎨 <strong>Coloration:</strong> Motifs ornementaux distinctifs`;
        }
        
        // 3. Informations morphologiques basées sur la famille selon la classe
        const family = species.family?.toLowerCase() || '';
        const order = species.order?.toLowerCase() || '';
        
        if (species.class === 'Squamata') {
            if (family.includes('colubr')) {
                return `🦷 <strong>Dentition:</strong> Serpent aglyphe (dents non venimeuses)`;
            } else if (family.includes('viper')) {
                return `🦷 <strong>Dentition:</strong> Crochets venimeux rétractables`;
            } else if (family.includes('python')) {
                return `📐 <strong>Taille:</strong> Serpent de grande taille, corps massif`;
            }
        } else if (species.class === 'Aves') {
            if (order.includes('passeri')) {
                return `🎵 <strong>Anatomie:</strong> Syrinx développé pour le chant`;
            } else if (family.includes('corvid')) {
                return `🧠 <strong>Cerveau:</strong> Ratio cerveau/corps élevé`;
            } else if (order.includes('falcon') || order.includes('accipitri')) {
                return `👁️ <strong>Vision:</strong> Acuité visuelle 8x supérieure à l'humain`;
            }
        } else if (species.class === 'Mammalia') {
            if (order.includes('carniv')) {
                return `🦷 <strong>Dentition:</strong> Carnassières pour découper la viande`;
            } else if (family.includes('felid')) {
                return `🐾 <strong>Locomotion:</strong> Pattes digitigrades, marche silencieuse`;
            }
        } else if (species.class === 'Insecta') {
            if (order.includes('dipter')) {
                return `⚖️ <strong>Équilibre:</strong> Haltères remplacent la 2e paire d'ailes`;
            } else if (family.includes('asilid')) {
                return `👁️ <strong>Vision:</strong> Yeux composés très développés pour la chasse`;
            }
        }
        
        // 4. Fallback sur le nom scientifique
        const speciesEpithet = species.scientificName.split(' ')[1] || '';
        return `🏷️ <strong>Épithète spécifique:</strong> "${speciesEpithet}"`;
    }
    
    // Méthodes utilitaires pour les indices thématiques
    containsHabitatInfo(text) {
        const habitatKeywords = ['forest', 'grassland', 'savanna', 'rocky', 'elevation', 'habitat', 'occur'];
        return habitatKeywords.some(keyword => text.toLowerCase().includes(keyword));
    }
    
    extractEcosystemFromDistributions(distributions) {
        for (const dist of distributions) {
            if (dist.locality) {
                const loc = dist.locality.toLowerCase();
                if (loc.includes('forest') || loc.includes('forêt')) {
                    return `🌲 <strong>Écosystème:</strong> Forêts tropicales`;
                } else if (loc.includes('savanna') || loc.includes('cerrado')) {
                    return `🌾 <strong>Écosystème:</strong> Savanes et prairies`;
                } else if (loc.includes('atlantic') && loc.includes('forest')) {
                    return `🌿 <strong>Écosystème:</strong> Forêt atlantique (biodiversité élevée)`;
                } else if (loc.includes('caatinga')) {
                    return `🌵 <strong>Écosystème:</strong> Caatinga (forêt sèche tropicale)`;
                } else if (loc.includes('montane') || loc.includes('elevation')) {
                    return `⛰️ <strong>Écosystème:</strong> Zones montagneuses d'altitude`;
                }
            }
        }
        return null;
    }
    
    cleanDescription(description) {
        if (!description || typeof description !== 'string') return '';
        
        // Nettoyer la description
        let cleaned = description
            .replace(/<[^>]*>/g, '') // Supprimer les balises HTML
            .replace(/\s+/g, ' ')     // Normaliser les espaces
            .trim();
        
        // Prendre seulement la première phrase ou les premiers 100 caractères
        const firstSentence = cleaned.split(/[.!?]/)[0];
        if (firstSentence && firstSentence.length > 10 && firstSentence.length < 150) {
            return firstSentence;
        }
        
        // Sinon, tronquer à 100 caractères
        if (cleaned.length > 100) {
            cleaned = cleaned.substring(0, 97) + '...';
        }
        
        return cleaned;
    }
    
    getDescriptionIcon(type) {
        const icons = {
            'morphology': '🔍',
            'habitat': '🌳',
            'biology': '🧬',
            'behaviour': '🐾',
            'description': '📝',
            'diagnostic_description': '🤔',
            'general': 'ℹ️'
        };
        return icons[type] || '📝';
    }
    
    getDescriptionLabel(type) {
        const labels = {
            'morphology': 'Morphologie',
            'habitat': 'Habitat',
            'biology': 'Biologie',
            'behaviour': 'Comportement',
            'description': 'Description',
            'diagnostic_description': 'Caractéristiques',
            'general': 'Général'
        };
        return labels[type] || 'Info';
    }
    
    getHabitatHint(species) {
        // Analyser la répartition pour donner des indices d'habitat
        const occurrenceCount = species.occurrenceCount;
        
        // Indices basés sur le nombre d'observations et la classe
        if (species.class === 'Aves') {
            if (occurrenceCount > 100000) {
                return `🌍 <strong>Répartition:</strong> Espèce très commune et largement répandue`;
            } else if (occurrenceCount > 10000) {
                return `🌳 <strong>Répartition:</strong> Espèce assez commune dans son aire`;
            } else {
                return `🏝️ <strong>Répartition:</strong> Espèce peu commune ou localisée`;
            }
        } else if (species.class === 'Mammalia') {
            if (species.order === 'Carnivora') {
                return `🦁 <strong>Régime:</strong> C'est un carnivore`;
            } else if (species.order === 'Primates') {
                return `🐵 <strong>Groupe:</strong> C'est un primate`;
            } else if (species.order === 'Rodentia') {
                return `🐭 <strong>Groupe:</strong> C'est un rongeur`;
            } else if (species.order === 'Artiodactyla') {
                return `🦌 <strong>Groupe:</strong> C'est un ongulé`;
            } else {
                return `🌳 <strong>Habitat:</strong> Vit dans des environnements variés`;
            }
        } else if (species.class === 'Reptilia') {
            if (species.order === 'Squamata') {
                return `🐍 <strong>Groupe:</strong> C'est un lézard ou un serpent`;
            } else if (species.order === 'Testudines') {
                return `🐢 <strong>Groupe:</strong> C'est une tortue`;
            } else if (species.order === 'Crocodylia') {
                return `🐊 <strong>Groupe:</strong> C'est un crocodilien`;
            } else {
                return `☀️ <strong>Habitat:</strong> Aime les environnements chauds`;
            }
        } else if (species.class === 'Amphibia') {
            if (species.order === 'Anura') {
                return `🐸 <strong>Groupe:</strong> C'est une grenouille ou un crapaud`;
            } else if (species.order === 'Caudata') {
                return `🦎 <strong>Groupe:</strong> C'est une salamandre ou un triton`;
            } else {
                return `💧 <strong>Habitat:</strong> Vit près de l'eau`;
            }
        } else if (species.class === 'Insecta') {
            if (species.order === 'Lepidoptera') {
                return `🦋 <strong>Groupe:</strong> C'est un papillon`;
            } else if (species.order === 'Coleoptera') {
                return `🪫 <strong>Groupe:</strong> C'est un coléoptère`;
            } else if (species.order === 'Hymenoptera') {
                return `🐝 <strong>Groupe:</strong> C'est une abeille, guêpe ou fourmi`;
            } else {
                return `🍃 <strong>Taille:</strong> Petit invertébré`;
            }
        } else {
            // Indice générique basé sur le nombre d'observations
            if (occurrenceCount > 50000) {
                return `🌍 <strong>Répartition:</strong> Espèce très répandue`;
            } else if (occurrenceCount > 5000) {
                return `🏕️ <strong>Répartition:</strong> Espèce moyennement répandue`;
            } else {
                return `🌴 <strong>Répartition:</strong> Espèce localisée ou rare`;
            }
        }
    }
    
    getSizeOrCharacteristicHint(species) {
        // Indices sur la taille ou les caractéristiques
        const genus = species.genus;
        
        // Quelques exemples selon le genre
        if (genus === 'Panthera') {
            return `🦁 <strong>Caractéristique:</strong> Grand félin prédateur`;
        } else if (genus === 'Canis') {
            return `🐕 <strong>Caractéristique:</strong> Canidé social`;
        } else if (genus === 'Ursus') {
            return `🐻 <strong>Caractéristique:</strong> Grand omnivore puissant`;
        } else if (genus === 'Elephas' || genus === 'Loxodonta') {
            return `🐘 <strong>Caractéristique:</strong> Le plus grand mammifère terrestre`;
        } else if (genus === 'Cervus') {
            return `🦌 <strong>Caractéristique:</strong> Les mâles portent des bois`;
        } else if (genus === 'Aquila') {
            return `🦅 <strong>Caractéristique:</strong> Grand rapace majestueux`;
        } else if (genus === 'Python' || genus === 'Boa') {
            return `🐍 <strong>Caractéristique:</strong> Grand serpent constricteur`;
        } else if (genus === 'Crocodylus') {
            return `🐊 <strong>Caractéristique:</strong> Grand prédateur aquatique`;
        } else if (species.order === 'Primates') {
            return `🤔 <strong>Caractéristique:</strong> Intelligent et social`;
        } else if (species.order === 'Cetacea') {
            return `🐋 <strong>Caractéristique:</strong> Mammifère marin`;
        } else if (species.order === 'Chiroptera') {
            return `🦇 <strong>Caractéristique:</strong> Seul mammifère volant`;
        } else {
            // Indice générique basé sur la famille
            return `🏛️ <strong>Famille:</strong> ${species.family || 'Non spécifiée'}`;
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