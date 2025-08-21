import CONFIG from '../utils/config.js';
import { updateLoadingStep } from '../ui/loading.js';
import { getFallbackSpecies, getRandomFallbackSpecies, enrichFallbackSpeciesWithImage } from '../data/fallback-species.js';

// Classe pour la sélection intelligente d'espèces
class SpeciesSelector {
    constructor(api) {
        this.api = api;
    }

    // Sélectionner une espèce selon le mode de jeu
    async selectSpecies(gameMode, classKey = null, franceModeEnabled = false) {
        const maxAttempts = 5; // Réduit de 10 à 5
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                updateLoadingStep(`Recherche en cours...`);
                
                // Recherche simplifiée et directe
                const searchConfig = { gameMode, classKey, franceModeEnabled };
                const occurrenceData = await this.raceForBestResults(searchConfig);
                
                // Vérifier si on a des données de fallback
                if (occurrenceData && occurrenceData.fallbackSpecies) {
                    console.log(`Utilisation des données de secours`);
                    // Enrichir avec une image si nécessaire
                    return await enrichFallbackSpeciesWithImage(occurrenceData.fallbackSpecies, this.api);
                }
                
                if (!occurrenceData || !occurrenceData.results || occurrenceData.results.length === 0) {
                    attempts++;
                    continue;
                }
                
                // Suite du traitement avec les résultats obtenus

                // Extraire les taxonKeys uniques et mélanger l'ordre
                const taxonKeys = [...new Set(
                    occurrenceData.results.map(r => r.taxonKey).filter(key => key)
                )];
                
                // Mélanger l'ordre des taxonKeys pour éviter toujours les mêmes en premier
                for (let i = taxonKeys.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [taxonKeys[i], taxonKeys[j]] = [taxonKeys[j], taxonKeys[i]];
                }

                if (taxonKeys.length === 0) {
                    attempts++;
                    continue;
                }

                // Évaluation séquentielle optimisée pour éviter la surcharge API
                updateLoadingStep('Analyse des données...');
                
                // Prendre seulement 1 ou 2 candidats pour accélérer
                const candidateKeys = taxonKeys.slice(0, Math.min(2, taxonKeys.length));
                
                // Évaluation rapide sans vérifications complexes
                const candidates = await this.quickEvaluate(candidateKeys, gameMode, classKey);
                
                // Sélectionner intelligemment parmi les candidats obtenus
                if (candidates.length > 0) {
                    return this.selectBestCandidate(candidates);
                }

                attempts++;
            } catch (error) {
                console.error('Erreur lors de la sélection d\'espèce:', error);
                attempts++;
            }
        }

        // Si échec, utiliser directement les données de secours
        console.warn('Recherche GBIF échouée, utilisation des données de secours...');
        const fallbackSpecies = this.getFallbackSpeciesForGame(gameMode, classKey);
        return await enrichFallbackSpeciesWithImage(fallbackSpecies, this.api);
    }
    
    // Méthode de secours : recherche sans filtre puis validation
    async selectSpeciesWithoutClassFilter(gameMode, expectedClassKey) {
        const maxAttempts = 5; // Réduit de 20 à 5
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            try {
                updateLoadingStep(`Recherche en cours...`);
                
                // Recherche générale avec moins de résultats
                const params = {
                    hasCoordinate: true,
                    hasGeospatialIssue: false,
                    limit: 100, // Réduit de 500 à 100
                    offset: Math.floor(Math.random() * 10000) // Réduit de 50000 à 10000
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

    // Calculer un score de qualité pour une espèce (0-100)
    calculateSpeciesQuality(species) {
        let score = 0;
        
        // Nom vernaculaire français = très bon (+30)
        if (species.vernacularName && 
            !species.vernacularName.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/) &&
            species.vernacularName.length < 30) {
            score += 30;
        }
        
        // Nombre d'occurrences équilibré (+25)
        if (species.occurrenceCount) {
            if (species.occurrenceCount >= 1000 && species.occurrenceCount <= 50000) {
                score += 25; // Pas trop rare, pas trop commun
            } else if (species.occurrenceCount >= 100) {
                score += 15; // Assez d'observations
            } else {
                score += 5; // Peu d'observations
            }
        }
        
        // Données taxonomiques complètes (+15)
        const taxonomyFields = [species.kingdom, species.phylum, species.class, 
                              species.order, species.family, species.genus];
        const completeTaxonomy = taxonomyFields.filter(field => field).length;
        score += (completeTaxonomy / 6) * 15;
        
        // Média disponible (+10)
        if (species.media && species.media.length > 0) {
            score += 10;
        }
        
        // Distribution géographique intéressante (+10)
        if (species.distributions && species.distributions.length > 0) {
            const countries = species.distributions.length;
            if (countries >= 2 && countries <= 10) {
                score += 10; // Distribution intéressante
            } else if (countries > 0) {
                score += 5; // Au moins une distribution
            }
        }
        
        // Descriptions disponibles (+10)
        if (species.descriptions && species.descriptions.length > 0) {
            score += 10;
        }
        
        return Math.min(100, score);
    }

    // Sélectionner intelligemment parmi les candidats
    selectBestCandidate(candidates) {
        // Trier par score combiné (70% qualité + 30% aléatoire)
        candidates.sort((a, b) => {
            const scoreA = (a.score * 0.7) + (a.randomFactor * 30);
            const scoreB = (b.score * 0.7) + (b.randomFactor * 30);
            return scoreB - scoreA;
        });
        
        // Sélectionner aléatoirement parmi les 3 meilleurs
        const topCandidates = candidates.slice(0, Math.min(3, candidates.length));
        const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];
        
        if (CONFIG.DEBUG_MODE) {
            console.log(`DEBUG: Sélection terminée (score: ${selected.score.toFixed(1)})`);
            console.log(`DEBUG: Nombre de candidats:`, candidates.length);
        }
        
        return selected.species;
    }

    // Évaluation rapide simplifiée
    async quickEvaluate(candidateKeys, gameMode, classKey) {
        const candidates = [];
        
        for (const taxonKey of candidateKeys) {
            try {
                updateLoadingStep(`Vérification...`);
                
                // Timeout adapté pour l'évaluation des espèces
                const evaluationPromise = this.evaluateSpecies(taxonKey, gameMode, classKey);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 5000) // Augmenté à 5 secondes
                );
                
                const species = await Promise.race([evaluationPromise, timeoutPromise]);
                
                if (species) {
                    candidates.push({
                        species: species,
                        score: 50, // Score fixe pour accélérer
                        randomFactor: Math.random()
                    });
                    
                    // Arrêt immédiat dès qu'on a un candidat
                    break;
                }
            } catch (error) {
                console.warn(`Erreur évaluation candidat ${taxonKey}:`, error.message);
                // Si GBIF échoue complètement, essayer les données de secours
                if (error.message.includes('Timeout') && gameMode === 'thematic' && classKey) {
                    const fallbackSpecies = getFallbackSpecies(classKey);
                    if (fallbackSpecies) {
                        const enrichedSpecies = await enrichFallbackSpeciesWithImage(fallbackSpecies, this.api);
                        candidates.push({
                            species: enrichedSpecies,
                            score: 50,
                            randomFactor: Math.random()
                        });
                        break;
                    }
                }
            }
        }
        
        return candidates;
    }

    // Attendre les meilleurs candidats avec timeout et compétition (version simplifiée)
    async waitForBestCandidates(promises, minCandidates = 3, timeoutMs = 8000) {
        return new Promise((resolve) => {
            const candidates = [];
            let resolvedCount = 0;
            let hasResolved = false;
            
            // Timeout général
            const timeout = setTimeout(() => {
                if (!hasResolved) {
                    hasResolved = true;
                    resolve(candidates.filter(c => c !== null));
                }
            }, timeoutMs);
            
            // Traiter chaque promesse
            promises.forEach((promise) => {
                promise.then((result) => {
                    resolvedCount++;
                    
                    if (result) {
                        candidates.push(result);
                        
                        // Résoudre dès qu'on a assez de bons candidats
                        if (candidates.length >= minCandidates && !hasResolved) {
                            hasResolved = true;
                            clearTimeout(timeout);
                            resolve(candidates);
                            return;
                        }
                    }
                    
                    // Ou si toutes les promesses sont terminées
                    if (resolvedCount >= promises.length && !hasResolved) {
                        hasResolved = true;
                        clearTimeout(timeout);
                        resolve(candidates.filter(c => c !== null));
                    }
                }).catch(() => {
                    resolvedCount++;
                    
                    // Vérifier si toutes les promesses sont terminées
                    if (resolvedCount >= promises.length && !hasResolved) {
                        hasResolved = true;
                        clearTimeout(timeout);
                        resolve(candidates.filter(c => c !== null));
                    }
                });
            });
        });
    }

    // Créer plusieurs stratégies de recherche séquentielle pour éviter CORS
    createSequentialSearchStrategies(gameMode, classKey, franceModeEnabled) {
        const strategies = [];
        
        // Stratégie 1: Offset aléatoire principal - LIMITE TRÈS RÉDUITE
        const strategy1 = {
            params: {
                hasCoordinate: true,
                hasGeospatialIssue: false,
                limit: 50  // Augmenté pour plus de choix
            },
            name: 'offset_random'
        };
        
        if (franceModeEnabled) {
            strategy1.params.country = 'FR';
            strategy1.params.offset = Math.floor(Math.random() * 15000);
        } else {
            strategy1.params.offset = Math.floor(Math.random() * 80000);
        }
        
        if (classKey && gameMode === 'thematic') {
            strategy1.params.taxonKey = classKey;
            strategy1.params.offset = Math.floor(Math.random() * 8000);
        }
        
        strategies.push(strategy1);
        
        // Stratégie 2: Par pays avec années récentes - LIMITE TRÈS RÉDUITE
        const strategy2 = {
            params: {
                hasCoordinate: true,
                hasGeospatialIssue: false,
                limit: 30,  // Compromis vitesse/choix
                year: 2020 + Math.floor(Math.random() * 4), // 2020-2023
                offset: Math.floor(Math.random() * 5000)
            },
            name: 'country_year'
        };
        
        if (franceModeEnabled) {
            strategy2.params.country = 'FR';
        } else {
            const randomCountries = ['FR', 'ES', 'IT', 'DE', 'GB', 'US', 'CA', 'AU', 'NL', 'BE'];
            strategy2.params.country = randomCountries[Math.floor(Math.random() * randomCountries.length)];
        }
        
        if (classKey && gameMode === 'thematic') {
            strategy2.params.taxonKey = classKey;
            strategy2.params.offset = Math.floor(Math.random() * 3000);
        }
        
        strategies.push(strategy2);
        
        // Stratégie 3: Recherche large avec offset différent - LIMITE TRÈS RÉDUITE
        const strategy3 = {
            params: {
                hasCoordinate: true,
                hasGeospatialIssue: false,
                limit: 25,  // Compromis vitesse/choix
                offset: Math.floor(Math.random() * 25000)
            },
            name: 'large_search'
        };
        
        if (franceModeEnabled) {
            strategy3.params.country = 'FR';
        }
        
        if (classKey && gameMode === 'thematic') {
            strategy3.params.taxonKey = classKey;
            strategy3.params.offset = Math.floor(Math.random() * 2000);
        }
        
        strategies.push(strategy3);
        
        return strategies;
    }

    // Recherche séquentielle rapide avec timeout court pour éviter CORS
    async raceForBestResults(searchPromises) {
        // Convertir en stratégies séquentielles
        const gameMode = searchPromises.gameMode;
        const classKey = searchPromises.classKey;
        const franceModeEnabled = searchPromises.franceModeEnabled;
        
        const strategies = this.createSequentialSearchStrategies(gameMode, classKey, franceModeEnabled);
        
        // Essayer séquentiellement avec timeout court
        for (let i = 0; i < strategies.length; i++) {
            try {
                updateLoadingStep(`Recherche en cours...`);
                
                // Timeout adapté pour GBIF (qui peut être lent)
                const searchPromise = this.api.searchOccurrences(strategies[i].params);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 8000) // Augmenté à 8 secondes
                );
                
                const data = await Promise.race([searchPromise, timeoutPromise]);
                
                // Si cette recherche a des résultats valides, la prendre
                if (data && data.results && data.results.length > 0) {
                    console.log(`Stratégie ${strategies[i].name} réussie: ${data.results.length} résultats`);
                    return data;
                }
                
                // Attendre un peu plus entre les stratégies pour éviter la surcharge
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.warn(`Stratégie ${strategies[i].name} échouée:`, error.message);
                // Continuer avec la stratégie suivante
                continue;
            }
        }
        
        // Tentatives de fallback avec timeouts progressivement plus longs
        console.warn('Toutes les stratégies ont échoué, tentatives de fallback...');
        
        const fallbackStrategies = [
            {
                params: { 
                    hasCoordinate: true, 
                    hasGeospatialIssue: false, 
                    limit: 20, 
                    offset: 0 
                },
                timeout: 12000,
                name: 'fallback_basic'
            },
            {
                params: { 
                    hasCoordinate: true, 
                    limit: 15,
                    offset: Math.floor(Math.random() * 5000)
                },
                timeout: 15000,
                name: 'fallback_minimal'
            },
            {
                params: { 
                    limit: 10,
                    offset: Math.floor(Math.random() * 1000)
                },
                timeout: 20000,
                name: 'fallback_last_resort'
            }
        ];
        
        // Ajouter les filtres selon le contexte
        fallbackStrategies.forEach(strategy => {
            if (franceModeEnabled) {
                strategy.params.country = 'FR';
            }
            if (classKey && gameMode === 'thematic') {
                strategy.params.taxonKey = classKey;
            }
        });
        
        for (const fallback of fallbackStrategies) {
            try {
                updateLoadingStep(`Connexion en cours...`);
                
                const fallbackPromise = this.api.searchOccurrences(fallback.params);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout fallback')), fallback.timeout)
                );
                
                const result = await Promise.race([fallbackPromise, timeoutPromise]);
                if (result && result.results && result.results.length > 0) {
                    console.log(`Fallback réussi: ${fallback.name} avec ${result.results.length} résultats`);
                    return result;
                }
            } catch (fallbackError) {
                console.warn(`Fallback ${fallback.name} échoué:`, fallbackError.message);
                // Attendre encore plus entre les fallbacks
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
        }
        
        console.error('Tous les fallbacks GBIF ont échoué, utilisation des données locales');
        
        // Utiliser les données de secours locales
        updateLoadingStep('Chargement des données...');
        
        if (classKey && gameMode === 'thematic') {
            const fallbackSpecies = getFallbackSpecies(classKey);
            if (fallbackSpecies) {
                // Retourner les données complètes de l'espèce, pas juste le taxonKey
                return { 
                    results: [], // Pas de résultats GBIF
                    fallbackSpecies: fallbackSpecies // Espèce de secours complète
                };
            }
        }
        
        // Mode populaire ou aucune espèce trouvée pour la classe
        const randomSpecies = getRandomFallbackSpecies();
        if (randomSpecies) {
            return { 
                results: [], // Pas de résultats GBIF
                fallbackSpecies: randomSpecies // Espèce de secours complète
            };
        }
        
        throw new Error('Aucune donnée disponible - ni GBIF ni données locales');
    }
    
    // Méthode pour obtenir une espèce de secours selon le mode de jeu
    getFallbackSpeciesForGame(gameMode, classKey = null) {
        updateLoadingStep('Chargement...');
        
        let fallbackSpecies;
        
        if (gameMode === 'thematic' && classKey) {
            // Mode thématique : récupérer une espèce de la classe demandée
            fallbackSpecies = getFallbackSpecies(classKey);
            if (!fallbackSpecies) {
                console.warn(`Aucune espèce de secours trouvée pour la classe ${classKey}`);
                // Fallback vers une espèce aléatoire
                fallbackSpecies = getRandomFallbackSpecies();
            }
        } else {
            // Mode populaire : espèce aléatoire
            fallbackSpecies = getRandomFallbackSpecies();
        }
        
        if (!fallbackSpecies) {
            throw new Error('Aucune espèce de secours disponible');
        }
        
        console.log(`Données chargées`);
        
        // Retourner l'espèce directement formatée pour le jeu
        return fallbackSpecies;
    }

    async evaluateSpecies(taxonKey, gameMode, expectedClassKey = null) {
        try {
            updateLoadingStep(`Vérification...`);
            
            // Si c'est un objet d'espèce de secours (pas juste un taxonKey), le retourner directement
            if (typeof taxonKey === 'object' && taxonKey.scientificName) {
                return taxonKey;
            }

            // Obtenir les détails de base depuis GBIF
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
                    // '204': 'Actinopterygii', // Poissons osseux - SUPPRIMÉ
                    '367': 'Arachnida',   // Arachnides
                    '225': 'Gastropoda',  // Gastéropodes
                    '220': 'Magnoliopsida', // Plantes à fleurs
                    '229': 'Malacostraca'  // Crustacés
                };
                
                const expectedClassName = classMapping[expectedClassKey];
                if (expectedClassName && speciesDetails.class !== expectedClassName) {
                    // Debug - afficher la classe réelle vs attendue
                    if (CONFIG.DEBUG_MODE) {
                        console.log(`DEBUG: Classe incompatible`);
                    }
                    
                    // Vérifier des variantes possibles du nom de classe
                    const classVariants = {
                        'Squamata': ['Squamata'], // Squamata direct (lézards, serpents)
                        'Aves': ['Aves'],
                        'Mammalia': ['Mammalia'],
                        'Insecta': ['Insecta', 'Hexapoda'],
                        'Amphibia': ['Amphibia'],
                        // 'Actinopterygii': ['Actinopterygii', 'Osteichthyes'], // SUPPRIMÉ
                        'Arachnida': ['Arachnida'],
                        'Gastropoda': ['Gastropoda'],
                        'Magnoliopsida': ['Magnoliopsida'],
                        'Malacostraca': ['Malacostraca']
                    };
                    
                    const validVariants = classVariants[expectedClassName] || [expectedClassName];
                    if (!validVariants.includes(speciesDetails.class)) {
                        console.log(`Incompatibilité de classe`);
                        return null;
                    }
                }
            }

            // Vérifier si l'espèce respecte les critères
            if (!this.isSpeciesPlayable(speciesDetails, occurrenceCount, gameMode)) {
                return null;
            }

            // Obtenir des informations supplémentaires
            updateLoadingStep(`Chargement des détails...`);
            
            const [vernacularNames, media, descriptions, distributions] = await Promise.all([
                this.api.getVernacularNames(taxonKey).catch(() => ({ results: [] })),
                this.api.getSpeciesMedia(taxonKey).catch(() => ({ results: [] })),
                this.api.getSpeciesDescriptions(taxonKey).catch(() => ({ results: [] })),
                this.api.getSpeciesDistributions(taxonKey).catch(() => ({ results: [] }))
            ]);

            // Récupérer la meilleure image disponible
            let speciesImage = this.extractBestImage(media.results);
            
            // Si pas d'image dans les médias, essayer de récupérer une image avec le nom scientifique
            if (!speciesImage) {
                try {
                    const imageData = await this.api.getSpeciesImage(
                        speciesDetails.canonicalName || speciesDetails.scientificName,
                        taxonKey
                    );
                    if (imageData && imageData.url) {
                        speciesImage = imageData.url;
                    }
                } catch (error) {
                    console.warn('Impossible de récupérer une image pour', speciesDetails.scientificName, error);
                }
            }

            // Construire l'objet espèce complet
            const species = {
                taxonKey,
                scientificName: speciesDetails.canonicalName || speciesDetails.scientificName,
                vernacularName: this.extractBestVernacularName(vernacularNames.results),
                taxonomicClass: this.extractTaxonomicInfo(speciesDetails),
                occurrenceCount,
                continent: this.extractContinentInfo(distributions.results),
                image: speciesImage,
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

        const result = {};
        descriptions.forEach(desc => {
            if (desc.description && desc.type) {
                result[desc.type.toLowerCase()] = desc.description;
            }
        });
        return result;
    }

    extractDistributions(distributions) {
        if (!distributions || distributions.length === 0) {
            return [];
        }
        
        return distributions.map(d => ({
            locality: d.locality,
            country: d.country,
            continent: d.continent,
            establishmentMeans: d.establishmentMeans
        })).filter(d => d.locality || d.country);
    }
}

export default SpeciesSelector;