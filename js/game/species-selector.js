import CONFIG from '../utils/config.js';
import { updateLoadingStep } from '../ui/loading.js';

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