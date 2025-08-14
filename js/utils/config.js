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
    DEBUG_MODE: false,
    // Activer le debug via URL ?debug=true
    ENABLE_URL_DEBUG: true
};

export default CONFIG;