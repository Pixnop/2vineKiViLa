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

    createSpeciesLayer(styleOverride = null) {
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

        return L.tileLayer(gbifMapUrl, {
            attribution: `© GBIF - ${species.scientificName}`,
            opacity: 0.8,
            maxZoom: 14
        });
    }

    showHint() {
        if (this.gameState.hintsUsed >= this.gameState.maxHints) {
            return;
        }

        const hints = this.generateHints();
        const hintIndex = this.gameState.hintsUsed;
        
        if (hints[hintIndex]) {
            this.displayHint(hints[hintIndex]);
            this.gameState.hintsUsed++;
            this.updateGameDisplay();
        }
    }

    generateHints() {
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
        const hints = [];
        
        // Indice 1: Classe avec description
        const classDesc = classDescriptions[species.class] || species.class;
        if (species.class) {
            availableHints.push({
                priority: 5,
                text: `🎯 Classe: ${classDesc}`
            });
        }

        // Indice 2: Famille avec exemples
        const familyDesc = familyExamples[species.family];
        if (species.family) {
            if (familyDesc) {
                availableHints.push({
                    priority: 5,
                    text: `🏠 Famille: ${species.family} (${familyDesc})`
                });
            } else {
                availableHints.push({
                    priority: 5,
                    text: `🏠 Famille: ${species.family}`
                });
            }
        }

        // Indice 3: Ordre avec exemples
        const orderDesc = orderExamples[species.order];
        if (species.order) {
            if (orderDesc) {
                availableHints.push({
                    priority: 5,
                    text: `📊 Ordre: ${species.order} (${orderDesc})`
                });
            } else {
                availableHints.push({
                    priority: 5,
                    text: `📊 Ordre: ${species.order}`
                });
            }
        }

        // Genre avec aide
        if (species.genus) {
            availableHints.push({
                priority: 6,
                text: `🔬 Genre: ${species.genus} (partie du nom scientifique)`
            });
        }
        
        // 7. Première lettre du nom (indice facile)
        if (species.vernacularName || species.scientificName) {
            const name = species.vernacularName || species.scientificName;
            availableHints.push({
                priority: 7,
                text: `🔤 Commence par: "${name.charAt(0).toUpperCase()}..."`
            });
        }
        
        // 8. Nombre de lettres
        if (species.vernacularName || species.scientificName) {
            const name = species.vernacularName || species.scientificName;
            availableHints.push({
                priority: 7,
                text: `🔢 Nombre de lettres: ${name.length}`
            });
        }
        
        // Trier les indices par priorité et sélectionner les 4 meilleurs
        availableHints.sort((a, b) => a.priority - b.priority);
        
        // Sélectionner jusqu'à 4 indices variés
        const selectedHints = [];
        const maxHints = 4;
        
        // Prendre les meilleurs indices disponibles
        for (let i = 0; i < Math.min(maxHints, availableHints.length); i++) {
            selectedHints.push(availableHints[i].text);
        }
        
        // Si pas assez d'indices, ajouter des indices par défaut
        while (selectedHints.length < maxHints) {
            selectedHints.push('❔ Indice non disponible pour cette espèce');
        }
        
        return selectedHints;
    }

    displayHint(hint) {
        const hintsDisplay = document.getElementById('hints-display');
        if (!hintsDisplay) return;

        const hintElement = document.createElement('div');
        hintElement.className = 'hint-item';
        hintElement.textContent = hint;
        
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
            feedback.innerHTML = `✅ Correct ! "${answer}"`;
        } else {
            feedback.innerHTML = `❌ Incorrect ! "${answer}" - ${session.lives} vie(s) restante(s)`;
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
            <h4>❌ Réponses incorrectes (${session.wrongAnswers.length})</h4>
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
                    { value: 'classic.poly', label: '🔷 Hexagones classiques (défaut)', description: 'Polygones hexagonaux' },
                    { value: 'orangeHeat.point', label: '🟠 Points oranges', description: 'Points de chaleur orange' },
                    { value: 'green.poly', label: '🟢 Hexagones verts', description: 'Polygones verts' },
                    { value: 'blueHeat.point', label: '🔵 Points bleus', description: 'Points de chaleur bleus' },
                    { value: 'purpleYellow.poly', label: '🟣 Hexagones violets', description: 'Polygones violet-jaune' },
                    { value: 'glacier.point', label: '❄️ Points glacier', description: 'Points style glacier' },
                    { value: 'fire.point', label: '🔥 Points feu', description: 'Points de chaleur rouge' },
                    { value: 'outline.poly', label: '⬡ Contours seuls', description: 'Hexagones avec contours' }
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

        // Créer et ajouter la nouvelle couche avec le nouveau style
        const newLayer = this.createSpeciesLayer(newStyle);
        if (newLayer) {
            newLayer.addTo(this.map);
            this.currentSpeciesLayer = newLayer;
        }

        debugManager.log('Style de carte changé', { newStyle });
    }
}

// Initialiser la page quand le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    new GamePage();
});