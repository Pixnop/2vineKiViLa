import navigation from '../utils/navigation.js';
import GBIFApi from '../api/gbif.js';
import SuggestionsManager from '../ui/suggestions.js';
import debugManager from '../utils/debug.js';

// Gestionnaire de la page de jeu
class GamePage {
    constructor() {
        this.gameState = null;
        this.map = null;
        this.api = new GBIFApi();
        this.suggestions = new SuggestionsManager(this.api);
        this.currentSpeciesLayer = null;
        this.currentMapStyle = localStorage.getItem('mapStyle') || 'classic.poly';
        this.currentPeriodFilter = null;
        this.timelineData = {
            minYear: 1950,  // Valeurs par défaut, seront ajustées
            maxYear: 2024,
            startYear: 1950,
            endYear: 2024,
            speciesMinYear: null,  // Première observation de l'espèce
            speciesMaxYear: null   // Dernière observation de l'espèce
        };
        this.init();
    }

    init() {
        // Récupérer les données de jeu depuis la navigation
        this.gameState = navigation.getGameData();
        
        if (!this.gameState || !this.gameState.species) {
            // Pas de données de jeu valides, retourner à l'accueil
            navigation.goToHome();
            return;
        }

        // Si c'est une continuation de partie, restaurer la session
        if (this.gameState.continueGame && this.gameState.currentSession) {
            this.gameState.currentSession = this.gameState.currentSession;
            debugManager.log('Continuation de partie', {
                lives: this.gameState.currentSession.lives,
                wrongAnswers: this.gameState.currentSession.wrongAnswers
            });
        }

        this.setupEventListeners();
        this.initializeGame();
        this.initializeMap();
        // Récupérer les données temporelles de l'espèce après l'initialisation
        this.loadSpeciesTemporalData();
        
        // Debug: Mettre à jour les infos debug
        if (debugManager.isEnabled) {
            debugManager.updateDebugInfo();
            debugManager.log('Page de jeu initialisée', {
                gameMode: this.gameState.gameMode,
                speciesName: this.gameState.species.scientificName,
                taxonKey: this.gameState.species.taxonKey
            });
        }
    }

    setupEventListeners() {
        // Boutons de contrôle
        document.getElementById('hint-btn')?.addEventListener('click', () => {
            this.showHint();
        });

        document.getElementById('skip-btn')?.addEventListener('click', () => {
            this.skipQuestion();
        });

        document.getElementById('quit-btn')?.addEventListener('click', () => {
            if (confirm('Êtes-vous sûr de vouloir quitter le jeu ?')) {
                navigation.goToHome();
            }
        });

        // Timeline interactive pour la période
        this.initializeTimeline();
        
        // Bouton de réinitialisation
        const resetBtn = document.getElementById('reset-period');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                // Réinitialiser avec la plage complète de l'espèce
                const minYear = this.timelineData.minYear;
                const maxYear = this.timelineData.maxYear;
                this.setTimelinePeriod(minYear, maxYear);
            });
        }

        // Input et soumission
        const input = document.getElementById('species-input');
        const submitBtn = document.getElementById('submit-btn');
        
        if (input) {
            input.addEventListener('input', (e) => {
                this.suggestions.handleInput(input, e.target.value);
            });

            input.addEventListener('keydown', (e) => {
                if (this.suggestions.handleKeyNavigation(e, input)) {
                    return;
                }
                
                if (e.key === 'Enter') {
                    this.submitAnswer();
                }
            });
        }

        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                this.submitAnswer();
            });
        }

        // Sélection de suggestion
        document.addEventListener('suggestionSelected', () => {
            this.submitAnswer();
        });

        // Clic ailleurs pour fermer les suggestions
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.answer-container')) {
                this.suggestions.hideSuggestions();
            }
        });
    }

    initializeGame() {
        // Initialiser la session de jeu si elle n'existe pas ou est vide
        if (!this.gameState.currentSession || !this.gameState.currentSession.startTime) {
            this.gameState.currentSession = {
                startTime: Date.now(),
                totalAttempts: 0,
                correctAnswers: 0,
                species: this.gameState.species,
                lives: 3,
                score: 0,
                streak: 0,
                wrongAnswers: []
            };
            
            debugManager.log('Nouvelle session créée', {
                species: this.gameState.species.scientificName,
                lives: 3
            });
        } else {
            // Réinitialiser les vies pour chaque nouvelle espèce
            this.gameState.currentSession.lives = 3;
            this.gameState.currentSession.wrongAnswers = [];
            this.gameState.currentSession.species = this.gameState.species;
            
            debugManager.log('Nouvelle espèce, vies réinitialisées', {
                species: this.gameState.species.scientificName,
                lives: 3
            });
        }
        
        // Mettre à jour l'affichage initial
        this.updateGameDisplay();
        
        // Focus sur l'input
        setTimeout(() => {
            const input = document.getElementById('species-input');
            if (input) input.focus();
        }, 500);
    }

    updateGameDisplay() {
        const { hintsUsed, maxHints } = this.gameState;
        const session = this.gameState.currentSession;
        
        // Vérification de sécurité
        if (!session) {
            console.warn('Session non initialisée lors de updateGameDisplay');
            return;
        }
        
        // Mettre à jour les compteurs réels
        document.getElementById('current-score').textContent = session.score || 0;
        document.getElementById('current-streak').textContent = session.streak || 0;
        document.getElementById('current-lives').textContent = session.lives || 3;
        document.getElementById('hints-used').textContent = hintsUsed;
        
        // Colorer les vies selon le nombre restant
        const livesElement = document.getElementById('current-lives');
        if (livesElement) {
            const lives = session.lives || 3;
            livesElement.style.color = lives > 1 ? 'var(--success-color)' : 
                                     lives === 1 ? 'var(--warning-color)' : 
                                     'var(--danger-color)';
        }
        
        // Désactiver le bouton d'indice si maximum atteint
        const hintBtn = document.getElementById('hint-btn');
        if (hintBtn && hintsUsed >= maxHints) {
            hintBtn.disabled = true;
        }
        
        // Afficher les réponses incorrectes
        this.displayWrongAnswers();
    }

    async initializeMap() {
        try {
            // Initialiser la carte Leaflet
            this.map = L.map('map').setView([46.603354, 1.888334], 4);

            // Ajouter les couches de base
            const baseLayers = {
                'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }),
                'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    attribution: '© Esri, Maxar, Earthstar Geographics'
                }),
                'GBIF Base (Sombre)': L.tileLayer('https://tile.gbif.org/3857/omt/{z}/{x}/{y}@1x.png?style=gbif-dark', {
                    attribution: '© GBIF contributors'
                }),
                'GBIF Base (Clair)': L.tileLayer('https://tile.gbif.org/3857/omt/{z}/{x}/{y}@1x.png?style=gbif-classic', {
                    attribution: '© GBIF contributors'
                })
            };

            // Couche par défaut - OpenStreetMap
            baseLayers['OpenStreetMap'].addTo(this.map);

            // Ajouter la vraie couche de répartition de l'espèce depuis GBIF
            const speciesLayer = this.createSpeciesLayer();
            if (speciesLayer) {
                speciesLayer.addTo(this.map);
                this.currentSpeciesLayer = speciesLayer;
            }

            // Ajouter un contrôleur de couches
            const overlayLayers = {};
            if (speciesLayer) {
                overlayLayers['Répartition de l\'espèce'] = speciesLayer;
            }

            L.control.layers(baseLayers, overlayLayers, {
                position: 'topright',
                collapsed: false
            }).addTo(this.map);

            // Ajouter le sélecteur de style de carte
            this.addMapStyleSelector();

        } catch (error) {
            console.error('Erreur lors de l\'initialisation de la carte:', error);
        }
    }

    createSpeciesLayer(styleOverride = null, periodFilter = null) {
        const species = this.gameState.species;
        if (!species || !species.taxonKey) {
            return null;
        }


        // Utiliser le style fourni ou celui sauvegardé
        const style = styleOverride || this.currentMapStyle;
        const binType = style.includes('.poly') ? 'hex' : 'point';

        // Utiliser l'API de cartographie GBIF v2 pour afficher les occurrences
        let gbifMapUrl = `https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@1x.png?` +
                        `taxonKey=${species.taxonKey}&` +
                        `style=${style}`;

        // Ajouter les paramètres de binning si c'est un style polygonal
        if (binType === 'hex') {
            gbifMapUrl += `&bin=hex&hexPerTile=30`;
        }

        // Ajouter le filtre de période si spécifié
        if (periodFilter && periodFilter.startYear && periodFilter.endYear) {
            gbifMapUrl += `&year=${periodFilter.startYear},${periodFilter.endYear}`;
        }

        const layer = L.tileLayer(gbifMapUrl, {
            attribution: `© GBIF - ${species.scientificName}` + 
                        (periodFilter ? ` (${periodFilter.startYear}-${periodFilter.endYear})` : ''),
            opacity: 0.8,
            maxZoom: 14
        });


        return layer;
    }



    async showHint() {
        if (this.gameState.hintsUsed >= this.gameState.maxHints) {
            return;
        }

        const hints = await this.generateHints();
        const hintIndex = this.gameState.hintsUsed;
        
        if (hints[hintIndex]) {
            this.displayHint(hints[hintIndex]);
            this.gameState.hintsUsed++;
            this.updateGameDisplay();
        }
    }

    async generateHints() {
        const species = this.gameState.species;
        
        // Descriptions et exemples pour rendre les indices plus compréhensibles
        const classDescriptions = {
            'Aves': 'Oiseaux (animaux à plumes et bec)',
            'Mammalia': 'Mammifères (animaux à poils qui allaitent)',
            'Insecta': 'Insectes (petits animaux à 6 pattes)',
            'Amphibia': 'Amphibiens (grenouilles, salamandres...)',
            'Reptilia': 'Reptiles (lézards, serpents, tortues...)',
            'Squamata': 'Lézards et serpents',
            'Actinopterygii': 'Poissons à nageoires rayonnées',
            'Chondrichthyes': 'Requins et raies',
            'Arachnida': 'Araignées et scorpions',
            'Plantae': 'Plantes',
            'Fungi': 'Champignons',
            'Mollusca': 'Mollusques (escargots, moules...)',
            'Crustacea': 'Crustacés (crabes, crevettes...)'
        };

        const familyExamples = {
            'Pinaceae': 'famille des pins, sapins et épicéas',
            'Rosaceae': 'famille des roses, pommiers et cerisiers',
            'Felidae': 'famille des félins (chats, lions, tigres...)',
            'Canidae': 'famille des canidés (chiens, loups, renards...)',
            'Corvidae': 'famille des corvidés (corbeaux, pies, geais...)',
            'Paridae': 'famille des mésanges',
            'Turdidae': 'famille des grives et merles',
            'Accipitridae': 'famille des aigles, buses et éperviers',
            'Strigidae': 'famille des chouettes et hiboux',
            'Picidae': 'famille des pics (oiseaux)',
            'Anatidae': 'famille des canards, oies et cygnes',
            'Laridae': 'famille des mouettes et goélands',
            'Columbidae': 'famille des pigeons et tourterelles',
            'Fringillidae': 'famille des pinsons et chardonnerets',
            'Muscicapidae': 'famille des gobemouches et rossignols',
            'Cervidae': 'famille des cerfs, chevreuils et biches',
            'Ursidae': 'famille des ours',
            'Mustelidae': 'famille des mustélidés (belettes, fouines...)',
            'Sciuridae': 'famille des écureuils',
            'Muridae': 'famille des rats et souris',
            'Ranidae': 'famille des grenouilles vraies',
            'Salamandridae': 'famille des salamandres et tritons',
            'Lacertidae': 'famille des lézards vrais',
            'Viperidae': 'famille des vipères',
            'Colubridae': 'famille des couleuvres',
            'Salmonidae': 'famille des saumons et truites',
            'Cyprinidae': 'famille des carpes et gardons',
            'Fagaceae': 'famille des chênes, hêtres et châtaigniers',
            'Betulaceae': 'famille des bouleaux et aulnes',
            'Salicaceae': 'famille des saules et peupliers',
            'Fabaceae': 'famille des légumineuses (haricots, pois...)',
            'Asteraceae': 'famille des marguerites et tournesols',
            'Apiaceae': 'famille des carottes et persil',
            'Brassicaceae': 'famille des choux et moutardes',
            'Solanaceae': 'famille des tomates et pommes de terre',
            'Orchidaceae': 'famille des orchidées',
            'Poaceae': 'famille des graminées (herbes, céréales...)',
            'Liliaceae': 'famille des lys et tulipes'
        };

        const orderExamples = {
            'Passeriformes': 'oiseaux chanteurs (moineaux, merles...)',
            'Carnivora': 'carnivores (chats, chiens, ours...)',
            'Rodentia': 'rongeurs (souris, écureuils, castors...)',
            'Primates': 'primates (singes, lémuriens, humains...)',
            'Chiroptera': 'chauves-souris',
            'Cetacea': 'baleines et dauphins',
            'Anura': 'grenouilles et crapauds',
            'Caudata': 'salamandres et tritons',
            'Coleoptera': 'coléoptères (scarabées, coccinelles...)',
            'Lepidoptera': 'papillons et mites',
            'Hymenoptera': 'abeilles, guêpes et fourmis',
            'Diptera': 'mouches et moustiques',
            'Hemiptera': 'punaises et pucerons',
            'Orthoptera': 'sauterelles et criquets',
            'Odonata': 'libellules',
            'Artiodactyla': 'ongulés à doigts pairs (cerfs, vaches...)',
            'Perissodactyla': 'ongulés à doigts impairs (chevaux...)',
            'Lagomorpha': 'lapins et lièvres',
            'Eulipotyphla': 'musaraignes et hérissons',
            'Squamata': 'lézards et serpents',
            'Testudines': 'tortues',
            'Crocodilia': 'crocodiles et alligators'
        };

        // Construire les indices avec descriptions
        const availableHints = [];
        
        // En mode populaire, le premier indice doit indiquer le type d'organisme
        const isPopularMode = this.gameState.gameMode === 'popular';
        const isThematicMode = this.gameState.gameMode === 'thematic';
        
        if (isPopularMode) {
            // Premier indice en mode populaire : type d'organisme général
            let organismType = '';
            let emoji = '';
            
            // Déterminer le type d'organisme basé sur la classe ou le royaume
            if (species.class === 'Aves') {
                organismType = 'C\'est un oiseau';
                emoji = '🦅';
            } else if (species.class === 'Mammalia') {
                organismType = 'C\'est un mammifère';
                emoji = '🦌';
            } else if (species.class === 'Insecta') {
                organismType = 'C\'est un insecte';
                emoji = '🦗';
            } else if (species.class === 'Amphibia') {
                organismType = 'C\'est un amphibien';
                emoji = '🐸';
            } else if (species.class === 'Reptilia' || species.order === 'Squamata' || species.order === 'Testudines') {
                organismType = 'C\'est un reptile';
                emoji = '🦎';
            } else if (species.class === 'Actinopterygii' || species.class === 'Chondrichthyes') {
                organismType = 'C\'est un poisson';
                emoji = '🐟';
            } else if (species.class === 'Arachnida') {
                organismType = 'C\'est un arachnide';
                emoji = '🕷️';
            } else if (species.class === 'Crustacea') {
                organismType = 'C\'est un crustacé';
                emoji = '🦀';
            } else if (species.class === 'Mollusca' || species.phylum === 'Mollusca') {
                organismType = 'C\'est un mollusque';
                emoji = '🐌';
            } else if (species.kingdom === 'Plantae' || species.class === 'Magnoliopsida' || species.class === 'Liliopsida') {
                organismType = 'C\'est une plante';
                emoji = '🌿';
            } else if (species.kingdom === 'Fungi') {
                organismType = 'C\'est un champignon';
                emoji = '🍄';
            } else if (species.class) {
                // Fallback sur la classe avec description
                const classDesc = classDescriptions[species.class] || species.class;
                organismType = `Classe: ${classDesc}`;
                emoji = '🔬';
            }
            
            if (organismType) {
                availableHints.push({
                    priority: 10, // Priorité maximale pour être en premier
                    text: `<span class="emoji">${emoji}</span> ${organismType}`
                });
            }
        } else if (species.class && !isThematicMode) {
            // Mode normal : afficher la classe avec description
            const classDesc = classDescriptions[species.class] || species.class;
            availableHints.push({
                priority: 10, // Priorité maximale pour être en premier
                text: `<span class="emoji">🎯</span> Classe: ${classDesc}`
            });
        }

        // Vérifier la similarité entre le genre et la famille
        const areFamilyAndGenusSimilar = (family, genus) => {
            if (!family || !genus) return false;
            
            // Convertir en minuscules pour la comparaison
            const familyLower = family.toLowerCase();
            const genusLower = genus.toLowerCase();
            
            // Retirer les suffixes de famille communs (-idae, -aceae, etc.)
            const familyRoot = familyLower.replace(/(idae|aceae|ales|ineae)$/, '');
            
            // Vérifier si le genre commence par la racine de la famille ou vice versa
            return genusLower.startsWith(familyRoot) || 
                   familyRoot.startsWith(genusLower.substring(0, 4)) ||
                   // Cas spécifiques connus de similarité
                   (family === 'Laridae' && genus === 'Larus') ||
                   (family === 'Corvidae' && genus === 'Corvus') ||
                   (family === 'Pinaceae' && genus === 'Pinus') ||
                   (family === 'Rosaceae' && genus === 'Rosa') ||
                   (family === 'Fagaceae' && genus === 'Fagus') ||
                   (family === 'Salicaceae' && genus === 'Salix') ||
                   (family === 'Betulaceae' && genus === 'Betula');
        };

        const isSimilar = areFamilyAndGenusSimilar(species.family, species.genus);

        // Indice 2: Famille avec exemples (seulement si pas trop similaire au genre)
        const familyDesc = familyExamples[species.family];
        if (species.family && !isSimilar) {
            if (familyDesc) {
                availableHints.push({
                    priority: 5,
                    text: `<span class="emoji">🏠</span> Famille: ${species.family} (${familyDesc})`
                });
            } else {
                availableHints.push({
                    priority: 5,
                    text: `<span class="emoji">🏠</span> Famille: ${species.family}`
                });
            }
        }

        // Indice 3: Ordre avec exemples (toujours affiché si disponible)
        const orderDesc = orderExamples[species.order];
        if (species.order) {
            if (orderDesc) {
                availableHints.push({
                    priority: 4,
                    text: `<span class="emoji">📊</span> Ordre: ${species.order} (${orderDesc})`
                });
            } else {
                availableHints.push({
                    priority: 4,
                    text: `<span class="emoji">📊</span> Ordre: ${species.order}`
                });
            }
        }

        // Genre avec aide (toujours affiché car très utile)
        if (species.genus) {
            // Si la famille est similaire, donner plus de contexte sur le genre
            const genusText = isSimilar && familyDesc ? 
                `<span class="emoji">🔬</span> Genre: ${species.genus} (${familyDesc})` :
                `<span class="emoji">🔬</span> Genre: ${species.genus} (partie du nom scientifique)`;
            
            availableHints.push({
                priority: 6,
                text: genusText
            });
        }
        
        // Indices supplémentaires pour les modes thématiques basés sur les données GBIF
        if (isThematicMode) {
            // Récupérer les données additionnelles depuis GBIF si disponibles
            await this.addGbifBasedHints(species, availableHints);
        }
        
        // 7. Première lettre du nom avec précision sur le type
        if (species.vernacularName || species.scientificName) {
            let nameInfo = '';
            let firstLetter = '';
            
            // Vérifier si on a un VRAI nom vernaculaire français
            const hasFrenchName = species.vernacularName && 
                                 !species.vernacularName.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/) && // Pas format "Genus species"
                                 species.vernacularName.length < 30; // Pas trop long
            
            if (hasFrenchName) {
                firstLetter = species.vernacularName.charAt(0).toUpperCase();
                nameInfo = ' (nom commun français)';
            } else if (species.scientificName) {
                firstLetter = species.scientificName.charAt(0).toUpperCase();
                nameInfo = ' (nom scientifique latin)';
            }
            
            if (firstLetter) {
                availableHints.push({
                    priority: 7,
                    text: `<span class="emoji">🔤</span> Commence par: "${firstLetter}..."${nameInfo}`
                });
            }
        }
        
        // 8. (Statut supprimé car pas assez utile pour le jeu)
        
        // 9. Indice sur l'origine du nom scientifique (étymologie basique)
        if (species.scientificName && species.scientificName.length > 5) {
            let etymologyHint = '';
            const name = species.scientificName.toLowerCase();
            
            // Quelques suffixes/préfixes communs avec leur signification
            if (name.includes('albus') || name.includes('alba')) etymologyHint = 'nom évoque la couleur blanche';
            else if (name.includes('niger') || name.includes('nigra')) etymologyHint = 'nom évoque la couleur noire';
            else if (name.includes('rufus') || name.includes('rufa')) etymologyHint = 'nom évoque la couleur rousse';
            else if (name.includes('major')) etymologyHint = 'nom évoque une grande taille';
            else if (name.includes('minor')) etymologyHint = 'nom évoque une petite taille';
            else if (name.includes('aqua') || name.includes('marine')) etymologyHint = 'nom évoque l\'eau ou le milieu marin';
            else if (name.includes('mont') || name.includes('alpin')) etymologyHint = 'nom évoque les montagnes';
            else if (name.includes('sylv') || name.includes('forest')) etymologyHint = 'nom évoque la forêt';
            else if (name.includes('camp') || name.includes('agr')) etymologyHint = 'nom évoque les champs ou prairies';
            
            if (etymologyHint) {
                availableHints.push({
                    priority: 7,
                    text: `<span class="emoji">📚</span> Étymologie: ${etymologyHint}`
                });
            }
        }
        
        // Trier les indices par priorité DÉCROISSANTE (priorité haute en premier)
        availableHints.sort((a, b) => b.priority - a.priority);
        
        // Sélectionner jusqu'à 4 indices variés
        const selectedHints = [];
        const maxHints = 4;
        
        // Prendre les meilleurs indices disponibles
        for (let i = 0; i < Math.min(maxHints, availableHints.length); i++) {
            selectedHints.push(availableHints[i].text);
        }
        
        // Si pas assez d'indices, ajouter des indices par défaut
        while (selectedHints.length < maxHints) {
            selectedHints.push('<span class="emoji">❔</span> Indice non disponible pour cette espèce');
        }
        
        return selectedHints;
    }

    // Ajouter des indices basés sur les données GBIF réelles
    async addGbifBasedHints(species, availableHints) {
        try {
            // Récupérer les profils d'espèce et descriptions depuis GBIF
            const [speciesProfiles, descriptions] = await Promise.all([
                this.api.makeRequest(`/species/${species.taxonKey}/speciesProfiles`).catch(() => ({ results: [] })),
                this.api.makeRequest(`/species/${species.taxonKey}/descriptions`).catch(() => ({ results: [] }))
            ]);

            // Indices basés sur les profils d'espèce GBIF
            if (speciesProfiles.results && speciesProfiles.results.length > 0) {
                const profile = speciesProfiles.results[0];
                
                // Habitat préféré
                if (profile.habitat) {
                    const habitats = Array.isArray(profile.habitat) ? profile.habitat : [profile.habitat];
                    const habitatText = habitats.join(', ').toLowerCase();
                    availableHints.push({
                        priority: 3,
                        text: `<span class="emoji">🏞️</span> Habitat: ${habitatText}`
                    });
                }

                // Taille/Masse si disponible
                if (profile.massInGram || profile.sizeInMillimeter) {
                    let sizeText = '';
                    if (profile.sizeInMillimeter) {
                        const sizeInCm = Math.round(profile.sizeInMillimeter / 10);
                        sizeText = `taille: ${sizeInCm} cm`;
                    }
                    if (profile.massInGram) {
                        const mass = profile.massInGram < 1000 ? `${profile.massInGram} g` : `${(profile.massInGram/1000).toFixed(1)} kg`;
                        sizeText += sizeText ? `, masse: ${mass}` : `masse: ${mass}`;
                    }
                    if (sizeText) {
                        availableHints.push({
                            priority: 3,
                            text: `<span class="emoji">📏</span> Dimensions: ${sizeText}`
                        });
                    }
                }

                // Mode de vie (aquatique, terrestre, etc.)
                if (profile.marine !== undefined || profile.freshwater !== undefined || profile.terrestrial !== undefined) {
                    const environments = [];
                    if (profile.marine) environments.push('marin');
                    if (profile.freshwater) environments.push('eau douce');
                    if (profile.terrestrial) environments.push('terrestre');
                    
                    if (environments.length > 0) {
                        availableHints.push({
                            priority: 3,
                            text: `<span class="emoji">🌍</span> Environnement: ${environments.join(', ')}`
                        });
                    }
                }
            }

            // Descriptions supprimées car souvent trop techniques ou géographiques

            // Pas d'indice de répartition car on a déjà la carte

        } catch (error) {
            debugManager.log('Erreur lors de la récupération des données GBIF pour les indices:', error);
            // Continuer sans ces indices si l'API échoue
        }
    }

    displayHint(hint) {
        const hintsDisplay = document.getElementById('hints-display');
        if (!hintsDisplay) return;

        const hintElement = document.createElement('div');
        hintElement.className = 'hint-item';
        hintElement.innerHTML = hint;
        
        hintsDisplay.appendChild(hintElement);
    }

    submitAnswer() {
        const input = document.getElementById('species-input');
        if (!input) return;

        const answer = input.value.trim().toLowerCase();
        if (!answer) return;

        this.checkAnswer(answer);
    }

    checkAnswer(answer) {
        const species = this.gameState.species;
        const session = this.gameState.currentSession;
        
        const correctAnswers = [
            species.scientificName?.toLowerCase(),
            species.vernacularName?.toLowerCase()
        ].filter(name => name);

        const isCorrect = correctAnswers.some(correct => 
            correct.includes(answer) || answer.includes(correct)
        );

        session.totalAttempts++;

        if (isCorrect) {
            // Réponse correcte
            session.correctAnswers++;
            session.streak++;
            session.score += this.calculateScore();
            
            debugManager.log('Réponse correcte !', {
                answer,
                species: species.scientificName,
                score: session.score
            });

            // Aller à la page de résultat (succès)
            this.goToResult(true, answer, false);
            
        } else {
            // Réponse incorrecte
            session.lives--;
            session.streak = 0;
            session.wrongAnswers.push(answer);
            
            debugManager.log('Réponse incorrecte', {
                answer,
                livesLeft: session.lives,
                wrongAnswers: session.wrongAnswers
            });

            if (session.lives <= 0) {
                // Plus de vies, aller à la page de résultat (échec)
                this.goToResult(false, answer, false);
            } else {
                // Il reste des vies, afficher le feedback et continuer
                this.showAnswerFeedback(false, answer);
                this.updateGameDisplay();
                
                // Effacer l'input et remettre le focus
                const input = document.getElementById('species-input');
                if (input) {
                    input.value = '';
                    input.focus();
                }
            }
        }
    }

    calculateScore() {
        const hintsUsed = this.gameState.hintsUsed;
        const baseScore = 100;
        const penaltyPerHint = 15;
        const livesBonus = this.gameState.currentSession.lives * 10;
        
        return Math.max(20, baseScore - (hintsUsed * penaltyPerHint) + livesBonus);
    }

    showAnswerFeedback(isCorrect, answer) {
        const container = document.querySelector('.answer-container');
        if (!container) return;

        // Supprimer le feedback précédent
        const existingFeedback = container.querySelector('.answer-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        // Créer le nouveau feedback
        const feedback = document.createElement('div');
        feedback.className = `answer-feedback ${isCorrect ? 'success' : 'error'}`;
        
        const session = this.gameState.currentSession;
        
        if (isCorrect) {
            feedback.innerHTML = `<span class="emoji">✅</span> Correct ! "${answer}"`;
        } else {
            feedback.innerHTML = `<span class="emoji">❌</span> Incorrect ! "${answer}" - ${session.lives} vie(s) restante(s)`;
        }

        container.insertBefore(feedback, container.firstChild);

        // Supprimer le feedback après 3 secondes
        setTimeout(() => {
            feedback.remove();
        }, 3000);
    }

    displayWrongAnswers() {
        const session = this.gameState.currentSession;
        const hintsContainer = document.getElementById('hints-display');
        
        if (!hintsContainer || !session || !session.wrongAnswers || !session.wrongAnswers.length) {
            return;
        }

        // Supprimer l'affichage précédent des mauvaises réponses
        const existingWrong = hintsContainer.querySelector('.wrong-answers');
        if (existingWrong) {
            existingWrong.remove();
        }

        // Créer l'affichage des mauvaises réponses
        const wrongDiv = document.createElement('div');
        wrongDiv.className = 'wrong-answers';
        wrongDiv.innerHTML = `
            <h4><span class="emoji">❌</span> Réponses incorrectes (${session.wrongAnswers.length})</h4>
            <ul>
                ${session.wrongAnswers.map(answer => `<li>"${answer}"</li>`).join('')}
            </ul>
        `;

        hintsContainer.appendChild(wrongDiv);
    }

    goToResult(isCorrect, userAnswer, skipped = false) {
        const resultData = {
            isCorrect,
            userAnswer,
            species: this.gameState.species,
            hintsUsed: this.gameState.hintsUsed,
            gameMode: this.gameState.gameMode,
            selectedTaxon: this.gameState.selectedTaxon,
            franceModeEnabled: this.gameState.franceModeEnabled,
            session: this.gameState.currentSession,
            skipped
        };

        // Naviguer vers la page de résultat
        navigation.navigateTo('result', resultData);
    }

    skipQuestion() {
        if (confirm('Êtes-vous sûr de vouloir passer cette question ?')) {
            // Passer compte comme une vie perdue
            const session = this.gameState.currentSession;
            session.lives--;
            session.totalAttempts++;
            
            debugManager.log('Question passée', {
                livesLeft: session.lives
            });

            this.goToResult(false, 'Question passée', true);
        }
    }

    addMapStyleSelector() {
        // Créer le contrôle personnalisé pour le style de carte
        const MapStyleControl = L.Control.extend({
            options: {
                position: 'bottomright'
            },

            onAdd: (map) => {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                container.style.background = 'white';
                container.style.padding = '10px';
                container.style.borderRadius = '8px';
                container.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
                container.style.maxWidth = '200px';

                const styles = [
                    { value: 'classic.poly', label: '<span class="emoji">🔷</span> Hexagones classiques (défaut)', description: 'Polygones hexagonaux' },
                    { value: 'orangeHeat.point', label: '<span class="emoji">🟠</span> Points oranges', description: 'Points de chaleur orange' },
                    { value: 'green.poly', label: '<span class="emoji">🟢</span> Hexagones verts', description: 'Polygones verts' },
                    { value: 'blueHeat.point', label: '<span class="emoji">🔵</span> Points bleus', description: 'Points de chaleur bleus' },
                    { value: 'purpleYellow.poly', label: '<span class="emoji">🟣</span> Hexagones violets', description: 'Polygones violet-jaune' },
                    { value: 'glacier.point', label: '<span class="emoji">❄️</span> Points glacier', description: 'Points style glacier' },
                    { value: 'fire.point', label: '<span class="emoji">🔥</span> Points feu', description: 'Points de chaleur rouge' },
                    { value: 'outline.poly', label: '<span class="emoji">⬡</span> Contours seuls', description: 'Hexagones avec contours' }
                ];

                container.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 8px; font-size: 12px; color: #333;">
                        Style de répartition:
                    </div>
                    <select id="map-style-select" style="width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px;">
                        ${styles.map(s => `
                            <option value="${s.value}" ${this.currentMapStyle === s.value ? 'selected' : ''}>
                                ${s.label}
                            </option>
                        `).join('')}
                    </select>
                `;

                // Empêcher la propagation des événements pour éviter les interactions avec la carte
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.disableScrollPropagation(container);

                // Ajouter l'événement de changement
                const select = container.querySelector('#map-style-select');
                select.addEventListener('change', (e) => {
                    this.changeMapStyle(e.target.value);
                });

                return container;
            }
        });

        new MapStyleControl().addTo(this.map);
    }

    changeMapStyle(newStyle) {
        this.currentMapStyle = newStyle;
        localStorage.setItem('mapStyle', newStyle);

        // Supprimer l'ancienne couche
        if (this.currentSpeciesLayer && this.map.hasLayer(this.currentSpeciesLayer)) {
            this.map.removeLayer(this.currentSpeciesLayer);
        }

        // Créer et ajouter la nouvelle couche avec le nouveau style et la période actuelle
        const newLayer = this.createSpeciesLayer(newStyle, this.currentPeriodFilter);
        if (newLayer) {
            newLayer.addTo(this.map);
            this.currentSpeciesLayer = newLayer;
        }

        debugManager.log('Style de carte changé', { newStyle });
    }

    applyPeriodFilter(preset) {
        let periodFilter = null;
        const currentYear = new Date().getFullYear();

        switch(preset) {
            case 'all':
                periodFilter = null;
                break;
            case 'recent':
                periodFilter = { startYear: 2020, endYear: currentYear };
                break;
            case '2010s':
                periodFilter = { startYear: 2010, endYear: 2019 };
                break;
            case '2000s':
                periodFilter = { startYear: 2000, endYear: 2009 };
                break;
            case '1990s':
                periodFilter = { startYear: 1990, endYear: 1999 };
                break;
            case '1980s':
                periodFilter = { startYear: 1980, endYear: 1989 };
                break;
        }

        this.updateMapWithPeriod(periodFilter);
    }

    applyCustomPeriod(startYear, endYear) {
        if (startYear > endYear) {
            alert('L\'année de début doit être antérieure à l\'année de fin');
            return;
        }

        const periodFilter = { startYear, endYear };
        this.updateMapWithPeriod(periodFilter);
    }

    updateMapWithPeriod(periodFilter) {
        this.currentPeriodFilter = periodFilter;

        // Supprimer l'ancienne couche
        if (this.currentSpeciesLayer && this.map.hasLayer(this.currentSpeciesLayer)) {
            this.map.removeLayer(this.currentSpeciesLayer);
        }

        // Créer et ajouter la nouvelle couche avec le filtre de période
        const newLayer = this.createSpeciesLayer(this.currentMapStyle, periodFilter);
        if (newLayer) {
            newLayer.addTo(this.map);
            this.currentSpeciesLayer = newLayer;
        }

        debugManager.log('Filtre de période appliqué', { periodFilter });
    }

    async loadSpeciesTemporalData() {
        const species = this.gameState.species;
        if (!species || !species.taxonKey) return;

        try {
            // Rechercher un échantillon d'observations pour déterminer la plage temporelle
            const observations = await this.api.searchOccurrences({
                taxonKey: species.taxonKey,
                hasCoordinate: true,
                limit: 100  // Plus d'observations pour une meilleure estimation
            });

            let minYear = 1800;  // Année minimum par défaut
            let maxYear = new Date().getFullYear();

            // Analyser toutes les observations pour trouver la plage temporelle
            if (observations?.results?.length > 0) {
                const years = observations.results
                    .map(obs => obs.year)
                    .filter(year => year && year > 1700 && year <= maxYear)
                    .sort((a, b) => a - b);

                if (years.length > 0) {
                    minYear = Math.max(1800, years[0]);
                    maxYear = years[years.length - 1];
                }
            }

            // S'assurer qu'on a une plage d'au moins 20 ans
            const yearRange = maxYear - minYear;
            if (yearRange < 20) {
                const center = Math.floor((minYear + maxYear) / 2);
                minYear = Math.max(1800, center - 10);
                maxYear = Math.min(new Date().getFullYear(), center + 10);
            }

            // Mettre à jour les données de la timeline
            this.timelineData.speciesMinYear = minYear;
            this.timelineData.speciesMaxYear = maxYear;
            this.timelineData.minYear = minYear;
            this.timelineData.maxYear = maxYear;
            this.timelineData.startYear = minYear;
            this.timelineData.endYear = maxYear;

            // Réinitialiser la timeline avec les nouvelles données
            this.updateTimelineRange();
            
            debugManager.log('Données temporelles de l\'espèce chargées', {
                species: species.scientificName,
                minYear,
                maxYear,
                yearRange: maxYear - minYear
            });

        } catch (error) {
            console.warn('Impossible de charger les données temporelles de l\'espèce:', error);
            // Garder les valeurs par défaut en cas d'erreur
        }
    }

    updateTimelineRange() {
        const handleLeft = document.getElementById('handle-left');
        const handleRight = document.getElementById('handle-right');
        const timelineLabels = document.querySelector('.timeline-labels');
        
        if (!handleLeft || !handleRight || !timelineLabels) return;

        // Mettre à jour les labels de la timeline
        const minYear = this.timelineData.minYear;
        const maxYear = this.timelineData.maxYear;
        const yearRange = maxYear - minYear;
        
        // Calculer les points d'étiquetage
        const labelPoints = [];
        if (yearRange <= 30) {
            // Moins de 30 ans : étiquettes tous les 5-10 ans
            const step = Math.ceil(yearRange / 4);
            for (let i = 0; i < 5; i++) {
                labelPoints.push(minYear + (i * step));
            }
        } else {
            // Plus de 30 ans : étiquettes espacées
            const step = Math.ceil(yearRange / 4);
            for (let i = 0; i < 5; i++) {
                labelPoints.push(minYear + (i * step));
            }
        }
        labelPoints[4] = maxYear; // S'assurer que la dernière étiquette est l'année max

        timelineLabels.innerHTML = labelPoints.map(year => `<span>${year}</span>`).join('');

        // Réinitialiser les positions des handles
        handleLeft.style.left = '0%';
        handleRight.style.left = '100%';
        handleLeft.dataset.year = minYear;
        handleRight.dataset.year = maxYear;
        handleLeft.querySelector('.timeline-year').textContent = minYear;
        handleRight.querySelector('.timeline-year').textContent = maxYear;

        // Mettre à jour l'affichage de la période
        const periodText = document.getElementById('period-text');
        if (periodText) {
            periodText.textContent = `${minYear} - ${maxYear}`;
        }

        // Réinitialiser le filtre de période avec toute la plage
        this.currentPeriodFilter = null;
        this.updateMapWithPeriod(null);
    }

    initializeTimeline() {
        const handleLeft = document.getElementById('handle-left');
        const handleRight = document.getElementById('handle-right');
        const timelineRange = document.getElementById('timeline-range');
        const periodText = document.getElementById('period-text');
        const track = document.querySelector('.timeline-track');
        
        if (!handleLeft || !handleRight || !track) return;
        
        let isDragging = null;
        
        const updateRange = (updateMap = true) => {
            const leftPos = parseFloat(handleLeft.style.left || '0');
            const rightPos = parseFloat(handleRight.style.left || '100');
            
            timelineRange.style.left = leftPos + '%';
            timelineRange.style.width = (rightPos - leftPos) + '%';
            
            const startYear = this.timelineData.startYear;
            const endYear = this.timelineData.endYear;
            
            periodText.textContent = `${startYear} - ${endYear}`;
            
            // Mettre à jour la carte seulement si elle est initialisée et si demandé
            if (updateMap && this.map) {
                const periodFilter = { startYear, endYear };
                this.updateMapWithPeriod(periodFilter);
            }
        };
        
        const positionToYear = (percentage) => {
            const yearRange = this.timelineData.maxYear - this.timelineData.minYear;
            return Math.round(this.timelineData.minYear + (yearRange * percentage / 100));
        };
        
        const yearToPosition = (year) => {
            const yearRange = this.timelineData.maxYear - this.timelineData.minYear;
            return ((year - this.timelineData.minYear) / yearRange) * 100;
        };
        
        const startDrag = (e, handle) => {
            e.preventDefault();
            isDragging = handle;
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchmove', onDrag);
            document.addEventListener('touchend', stopDrag);
        };
        
        const onDrag = (e) => {
            if (!isDragging) return;
            
            const rect = track.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const percentage = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
            
            if (isDragging === handleLeft) {
                const rightPos = parseFloat(handleRight.style.left || '100');
                if (percentage < rightPos - 5) {
                    handleLeft.style.left = percentage + '%';
                    const year = positionToYear(percentage);
                    this.timelineData.startYear = year;
                    handleLeft.dataset.year = year;
                    handleLeft.querySelector('.timeline-year').textContent = year;
                }
            } else if (isDragging === handleRight) {
                const leftPos = parseFloat(handleLeft.style.left || '0');
                if (percentage > leftPos + 5) {
                    handleRight.style.left = percentage + '%';
                    const year = positionToYear(percentage);
                    this.timelineData.endYear = year;
                    handleRight.dataset.year = year;
                    handleRight.querySelector('.timeline-year').textContent = year;
                }
            }
            
            updateRange();
        };
        
        const stopDrag = () => {
            isDragging = null;
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchmove', onDrag);
            document.removeEventListener('touchend', stopDrag);
        };
        
        // Initialiser les positions
        handleLeft.style.left = '0%';
        handleRight.style.left = '100%';
        
        // Event listeners
        handleLeft.addEventListener('mousedown', (e) => startDrag(e, handleLeft));
        handleRight.addEventListener('mousedown', (e) => startDrag(e, handleRight));
        handleLeft.addEventListener('touchstart', (e) => startDrag(e, handleLeft));
        handleRight.addEventListener('touchstart', (e) => startDrag(e, handleRight));
        
        // Initialiser l'affichage sans mettre à jour la carte
        updateRange(false);
    }
    
    setTimelinePeriod(startYear, endYear) {
        const handleLeft = document.getElementById('handle-left');
        const handleRight = document.getElementById('handle-right');
        
        if (!handleLeft || !handleRight) return;
        
        this.timelineData.startYear = startYear;
        this.timelineData.endYear = endYear;
        
        const leftPos = ((startYear - this.timelineData.minYear) / (this.timelineData.maxYear - this.timelineData.minYear)) * 100;
        const rightPos = ((endYear - this.timelineData.minYear) / (this.timelineData.maxYear - this.timelineData.minYear)) * 100;
        
        handleLeft.style.left = leftPos + '%';
        handleRight.style.left = rightPos + '%';
        handleLeft.dataset.year = startYear;
        handleRight.dataset.year = endYear;
        handleLeft.querySelector('.timeline-year').textContent = startYear;
        handleRight.querySelector('.timeline-year').textContent = endYear;
        
        const timelineRange = document.getElementById('timeline-range');
        const periodText = document.getElementById('period-text');
        
        timelineRange.style.left = leftPos + '%';
        timelineRange.style.width = (rightPos - leftPos) + '%';
        periodText.textContent = `${startYear} - ${endYear}`;
        
        // Mettre à jour la carte
        const periodFilter = { startYear, endYear };
        this.updateMapWithPeriod(periodFilter);
    }
}

// Initialiser la page quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    new GamePage();
});