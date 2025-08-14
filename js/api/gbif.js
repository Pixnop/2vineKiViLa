import CONFIG from '../utils/config.js';

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

    // Obtenir des informations détaillées pour les indices
    async getSpeciesHintData(taxonKey) {
        try {
            const [details, vernacularNames, descriptions] = await Promise.all([
                this.getSpeciesDetails(taxonKey),
                this.getVernacularNames(taxonKey).catch(() => ({ results: [] })),
                this.getSpeciesDescriptions(taxonKey).catch(() => ({ results: [] }))
            ]);

            return {
                details,
                vernacularNames: vernacularNames.results || [],
                descriptions: descriptions.results || []
            };
        } catch (error) {
            console.error('Erreur lors de la récupération des données d\'indice:', error);
            return null;
        }
    }

    // Autocomplétion pour les noms d'espèces - recherche multilingue élargie
    async suggestSpecies(query, limit = 10) {
        const searchPromises = [];
        
        // 1. Recherche directe par nom scientifique et noms communs
        searchPromises.push(
            this.makeRequest('/species/suggest', { 
                q: query, 
                limit: Math.ceil(limit/3), 
                rank: 'SPECIES' 
            }).catch(() => ({ results: [] }))
        );
        
        // 2. Recherche élargie incluant tous les rangs
        searchPromises.push(
            this.makeRequest('/species/suggest', { 
                q: query, 
                limit: Math.ceil(limit/3) 
            }).catch(() => ({ results: [] }))
        );
        
        // 3. Recherche par noms vernaculaires multilingues
        searchPromises.push(
            this.searchMultilingualNames(query, Math.ceil(limit/2)).catch(() => [])
        );
        
        // 4. Recherche fuzzy (pour les fautes de frappe)
        if (query.length > 3) {
            searchPromises.push(
                this.searchFuzzy(query, Math.ceil(limit/4)).catch(() => [])
            );
        }
        
        const results = await Promise.all(searchPromises);
        
        // Combiner et dédupliquer les résultats
        const combined = [];
        const seen = new Set();
        
        results.forEach(result => {
            const items = result.results || result || [];
            items.forEach(item => {
                const key = item.key || item.usageKey || item.taxonKey;
                if (!seen.has(key) && key) {
                    seen.add(key);
                    // Enrichir avec des infos de langue si disponibles
                    this.enrichWithLanguageInfo(item, query);
                    combined.push(item);
                }
            });
        });
        
        // Trier par pertinence
        return this.sortByRelevance(combined, query).slice(0, limit);
    }
    
    // Recherche multilingue (français, anglais, espagnol, allemand, etc.)
    async searchMultilingualNames(query, limit = 8) {
        const searches = [];
        
        // Recherche dans les noms vernaculaires avec différentes langues prioritaires
        const languages = ['fr', 'en', 'es', 'de', 'it', 'pt'];
        
        // Recherche générale
        searches.push(
            this.makeRequest('/species/search', { 
                q: query, 
                limit: Math.ceil(limit/2),
                rank: 'SPECIES'
            }).catch(() => ({ results: [] }))
        );
        
        // Recherche spécifique par langue si le terme semble être dans une langue particulière
        const detectedLang = this.detectLanguageHints(query);
        if (detectedLang) {
            searches.push(
                this.searchByLanguage(query, detectedLang, Math.ceil(limit/2)).catch(() => [])
            );
        }
        
        const results = await Promise.all(searches);
        const combined = [];
        
        results.forEach(result => {
            const items = result.results || result || [];
            items.forEach(item => combined.push(item));
        });
        
        return combined;
    }

    // Recherche par langue spécifique
    async searchByLanguage(query, language, limit = 5) {
        try {
            // Utiliser l'API de recherche avec des paramètres spécifiques à la langue
            const response = await this.makeRequest('/species/search', { 
                q: query, 
                limit,
                rank: 'SPECIES',
                language: language
            });
            return response.results || [];
        } catch (error) {
            return [];
        }
    }

    // Recherche fuzzy pour les fautes de frappe
    async searchFuzzy(query, limit = 5) {
        try {
            // Créer des variantes du terme pour la recherche fuzzy
            const variants = this.generateQueryVariants(query);
            const searches = variants.map(variant => 
                this.makeRequest('/species/suggest', { 
                    q: variant, 
                    limit: Math.ceil(limit / variants.length)
                }).catch(() => ({ results: [] }))
            );
            
            const results = await Promise.all(searches);
            const combined = [];
            
            results.forEach(result => {
                const items = result.results || [];
                items.forEach(item => combined.push(item));
            });
            
            return combined;
        } catch (error) {
            return [];
        }
    }

    // Détecter des indices de langue dans la requête
    detectLanguageHints(query) {
        const frenchWords = ['le', 'la', 'du', 'de', 'des', 'grand', 'petit', 'rouge', 'noir', 'blanc'];
        const englishWords = ['the', 'of', 'and', 'great', 'small', 'red', 'black', 'white', 'common'];
        const spanishWords = ['el', 'la', 'del', 'de', 'los', 'gran', 'pequeño', 'rojo', 'negro', 'blanco'];
        
        const lowerQuery = query.toLowerCase();
        
        if (frenchWords.some(word => lowerQuery.includes(word))) return 'fr';
        if (englishWords.some(word => lowerQuery.includes(word))) return 'en';
        if (spanishWords.some(word => lowerQuery.includes(word))) return 'es';
        
        return null;
    }

    // Générer des variantes de requête pour la recherche fuzzy
    generateQueryVariants(query) {
        const variants = [query];
        
        // Variantes de casse
        variants.push(query.toLowerCase());
        variants.push(this.capitalize(query));
        
        // Suppression d'accents courants
        const noAccents = query
            .replace(/[àáâãäå]/g, 'a')
            .replace(/[èéêë]/g, 'e')
            .replace(/[ìíîï]/g, 'i')
            .replace(/[òóôõö]/g, 'o')
            .replace(/[ùúûü]/g, 'u')
            .replace(/[ç]/g, 'c')
            .replace(/[ñ]/g, 'n');
        
        if (noAccents !== query) {
            variants.push(noAccents);
        }
        
        return [...new Set(variants)]; // Dédupliquer
    }

    // Capitaliser la première lettre
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    // Enrichir les résultats avec des infos de langue
    enrichWithLanguageInfo(item, query) {
        // Marquer si la correspondance vient du nom scientifique ou vernaculaire
        const scientificMatch = item.scientificName && 
            item.scientificName.toLowerCase().includes(query.toLowerCase());
        const vernacularMatch = item.vernacularName && 
            item.vernacularName.toLowerCase().includes(query.toLowerCase());
        
        item.matchType = scientificMatch ? 'scientific' : 
                        vernacularMatch ? 'vernacular' : 'other';
        
        return item;
    }

    // Trier par pertinence
    sortByRelevance(results, query) {
        return results.sort((a, b) => {
            const aScore = this.calculateRelevanceScore(a, query);
            const bScore = this.calculateRelevanceScore(b, query);
            return bScore - aScore;
        });
    }

    // Calculer un score de pertinence
    calculateRelevanceScore(item, query) {
        let score = 0;
        const queryLower = query.toLowerCase();
        
        // Score basé sur le type de correspondance
        if (item.matchType === 'scientific') score += 10;
        if (item.matchType === 'vernacular') score += 8;
        
        // Score basé sur la longueur de correspondance
        const scientificName = (item.scientificName || '').toLowerCase();
        const vernacularName = (item.vernacularName || '').toLowerCase();
        
        if (scientificName.startsWith(queryLower)) score += 15;
        else if (scientificName.includes(queryLower)) score += 10;
        
        if (vernacularName.startsWith(queryLower)) score += 12;
        else if (vernacularName.includes(queryLower)) score += 8;
        
        // Bonus pour correspondance exacte
        if (scientificName === queryLower || vernacularName === queryLower) {
            score += 20;
        }
        
        // Bonus pour les espèces (vs genres, familles, etc.)
        if (item.rank === 'SPECIES') score += 5;
        
        return score;
    }

    // Recherche spécifique par nom vernaculaire (méthode existante améliorée)
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

export default GBIFApi;