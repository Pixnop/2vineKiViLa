// Données de secours quand GBIF est inaccessible
// Espèces organisées par classe taxonomique avec données minimales pour le jeu

export const FALLBACK_SPECIES = {
    // Oiseaux (Aves) - TaxonKey: 212
    212: [
        {
            taxonKey: 2498252,
            scientificName: 'Passer domesticus',
            vernacularName: 'Moineau domestique',
            class: 'Aves',
            order: 'Passeriformes',
            family: 'Passeridae',
            genus: 'Passer',
            occurrenceCount: 8567432
        },
        {
            taxonKey: 2482468,
            scientificName: 'Turdus merula',
            vernacularName: 'Merle noir',
            class: 'Aves',
            order: 'Passeriformes',
            family: 'Turdidae',
            genus: 'Turdus',
            occurrenceCount: 5432108
        },
        {
            taxonKey: 2481082,
            scientificName: 'Erithacus rubecula',
            vernacularName: 'Rouge-gorge familier',
            class: 'Aves',
            order: 'Passeriformes',
            family: 'Muscicapidae',
            genus: 'Erithacus',
            occurrenceCount: 3891564
        }
    ],
    
    // Mammifères (Mammalia) - TaxonKey: 359
    359: [
        {
            taxonKey: 2440946,
            scientificName: 'Vulpes vulpes',
            vernacularName: 'Renard roux',
            class: 'Mammalia',
            order: 'Carnivora',
            family: 'Canidae',
            genus: 'Vulpes',
            occurrenceCount: 1245673
        },
        {
            taxonKey: 2433746,
            scientificName: 'Capreolus capreolus',
            vernacularName: 'Chevreuil européen',
            class: 'Mammalia',
            order: 'Artiodactyla',
            family: 'Cervidae',
            genus: 'Capreolus',
            occurrenceCount: 892456
        },
        {
            taxonKey: 2437804,
            scientificName: 'Sciurus vulgaris',
            vernacularName: 'Écureuil roux',
            class: 'Mammalia',
            order: 'Rodentia',
            family: 'Sciuridae',
            genus: 'Sciurus',
            occurrenceCount: 654321
        }
    ],
    
    // Insectes (Insecta) - TaxonKey: 216
    216: [
        {
            taxonKey: 1311477,
            scientificName: 'Apis mellifera',
            vernacularName: 'Abeille domestique',
            class: 'Insecta',
            order: 'Hymenoptera',
            family: 'Apidae',
            genus: 'Apis',
            occurrenceCount: 2789456
        },
        {
            taxonKey: 1920285,
            scientificName: 'Vanessa atalanta',
            vernacularName: 'Belle-Dame',
            class: 'Insecta',
            order: 'Lepidoptera',
            family: 'Nymphalidae',
            genus: 'Vanessa',
            occurrenceCount: 1567890
        },
        {
            taxonKey: 1890925,
            scientificName: 'Coccinella septempunctata',
            vernacularName: 'Coccinelle à sept points',
            class: 'Insecta',
            order: 'Coleoptera',
            family: 'Coccinellidae',
            genus: 'Coccinella',
            occurrenceCount: 987654
        }
    ],
    
    // Reptiles (Squamata) - TaxonKey: 11592253
    11592253: [
        {
            taxonKey: 2465963,
            scientificName: 'Lacerta agilis',
            vernacularName: 'Lézard des souches',
            class: 'Reptilia',
            order: 'Squamata',
            family: 'Lacertidae',
            genus: 'Lacerta',
            occurrenceCount: 198765
        },
        {
            taxonKey: 2458794,
            scientificName: 'Natrix natrix',
            vernacularName: 'Couleuvre à collier',
            class: 'Reptilia',
            order: 'Squamata',
            family: 'Natricidae',
            genus: 'Natrix',
            occurrenceCount: 123456
        },
        {
            taxonKey: 2465969,
            scientificName: 'Vipera berus',
            vernacularName: 'Vipère péliade',
            class: 'Reptilia',
            order: 'Squamata',
            family: 'Viperidae',
            genus: 'Vipera',
            occurrenceCount: 87654
        }
    ],
    
    // Amphibiens (Amphibia) - TaxonKey: 131
    131: [
        {
            taxonKey: 2427091,
            scientificName: 'Rana temporaria',
            vernacularName: 'Grenouille rousse',
            class: 'Amphibia',
            order: 'Anura',
            family: 'Ranidae',
            genus: 'Rana',
            occurrenceCount: 345678
        },
        {
            taxonKey: 2433477,
            scientificName: 'Bufo bufo',
            vernacularName: 'Crapaud commun',
            class: 'Amphibia',
            order: 'Anura',
            family: 'Bufonidae',
            genus: 'Bufo',
            occurrenceCount: 234567
        },
        {
            taxonKey: 2430915,
            scientificName: 'Salamandra salamandra',
            vernacularName: 'Salamandre tachetée',
            class: 'Amphibia',
            order: 'Caudata',
            family: 'Salamandridae',
            genus: 'Salamandra',
            occurrenceCount: 156789
        }
    ],
    
    // Arachnides (Arachnida) - TaxonKey: 367
    367: [
        {
            taxonKey: 2163740,
            scientificName: 'Argiope bruennichi',
            vernacularName: 'Épeire frelon',
            class: 'Arachnida',
            order: 'Araneae',
            family: 'Araneidae',
            genus: 'Argiope',
            occurrenceCount: 76543
        },
        {
            taxonKey: 2161811,
            scientificName: 'Latrodectus mactans',
            vernacularName: 'Veuve noire',
            class: 'Arachnida',
            order: 'Araneae',
            family: 'Theridiidae',
            genus: 'Latrodectus',
            occurrenceCount: 45678
        },
        {
            taxonKey: 2164056,
            scientificName: 'Lycosa tarantula',
            vernacularName: 'Tarentule',
            class: 'Arachnida',
            order: 'Araneae',
            family: 'Lycosidae',
            genus: 'Lycosa',
            occurrenceCount: 98765
        }
    ],
    
    // Gastéropodes (Gastropoda) - TaxonKey: 225
    225: [
        {
            taxonKey: 2301374,
            scientificName: 'Helix pomatia',
            vernacularName: 'Escargot de Bourgogne',
            class: 'Gastropoda',
            order: 'Stylommatophora',
            family: 'Helicidae',
            genus: 'Helix',
            occurrenceCount: 234567
        },
        {
            taxonKey: 2290125,
            scientificName: 'Limax maximus',
            vernacularName: 'Limace léopard',
            class: 'Gastropoda',
            order: 'Stylommatophora',
            family: 'Limacidae',
            genus: 'Limax',
            occurrenceCount: 123456
        },
        {
            taxonKey: 2296515,
            scientificName: 'Cepaea nemoralis',
            vernacularName: 'Escargot des haies',
            class: 'Gastropoda',
            order: 'Stylommatophora',
            family: 'Helicidae',
            genus: 'Cepaea',
            occurrenceCount: 345678
        }
    ],
    
    // Plantes à fleurs (Magnoliopsida) - TaxonKey: 220
    220: [
        {
            taxonKey: 3034893,
            scientificName: 'Quercus robur',
            vernacularName: 'Chêne pédonculé',
            class: 'Magnoliopsida',
            order: 'Fagales',
            family: 'Fagaceae',
            genus: 'Quercus',
            occurrenceCount: 1567890
        },
        {
            taxonKey: 3152594,
            scientificName: 'Rosa canina',
            vernacularName: 'Églantier',
            class: 'Magnoliopsida',
            order: 'Rosales',
            family: 'Rosaceae',
            genus: 'Rosa',
            occurrenceCount: 876543
        },
        {
            taxonKey: 3034332,
            scientificName: 'Bellis perennis',
            vernacularName: 'Pâquerette',
            class: 'Magnoliopsida',
            order: 'Asterales',
            family: 'Asteraceae',
            genus: 'Bellis',
            occurrenceCount: 2345678
        }
    ],
    
    // Crustacés (Malacostraca) - TaxonKey: 229
    229: [
        {
            taxonKey: 2225897,
            scientificName: 'Cancer pagurus',
            vernacularName: 'Tourteau',
            class: 'Malacostraca',
            order: 'Decapoda',
            family: 'Cancridae',
            genus: 'Cancer',
            occurrenceCount: 432109
        },
        {
            taxonKey: 2225626,
            scientificName: 'Homarus gammarus',
            vernacularName: 'Homard européen',
            class: 'Malacostraca',
            order: 'Decapoda',
            family: 'Nephropidae',
            genus: 'Homarus',
            occurrenceCount: 198765
        },
        {
            taxonKey: 2224708,
            scientificName: 'Crangon crangon',
            vernacularName: 'Crevette grise',
            class: 'Malacostraca',
            order: 'Decapoda',
            family: 'Crangonidae',
            genus: 'Crangon',
            occurrenceCount: 567890
        }
    ]
};

// Fonction pour obtenir une espèce aléatoire d'une classe donnée
export function getFallbackSpecies(taxonKey) {
    const speciesForClass = FALLBACK_SPECIES[taxonKey];
    if (!speciesForClass || speciesForClass.length === 0) {
        return null;
    }
    
    const randomIndex = Math.floor(Math.random() * speciesForClass.length);
    const species = { ...speciesForClass[randomIndex] };
    
    // Marquer comme espèce hors ligne
    species.isOfflineSpecies = true;
    
    // Si pas d'image, essayer de récupérer une image générique basée sur le nom
    if (!species.image) {
        species.needsImage = true; // Marquer pour récupération d'image
    }
    
    return species;
}

// Fonction pour obtenir une espèce aléatoire de n'importe quelle classe (mode populaire)
export function getRandomFallbackSpecies() {
    const allClasses = Object.keys(FALLBACK_SPECIES);
    const randomClass = allClasses[Math.floor(Math.random() * allClasses.length)];
    return getFallbackSpecies(randomClass);
}

// Enrichir une espèce de fallback avec une image si nécessaire
export async function enrichFallbackSpeciesWithImage(species, api) {
    if (species && species.needsImage && species.scientificName) {
        try {
            const imageData = await api.getSpeciesImage(species.scientificName, species.taxonKey);
            if (imageData && imageData.url) {
                species.image = imageData.url;
                delete species.needsImage; // Supprimer le flag
            }
        } catch (error) {
            console.warn('Impossible de récupérer une image pour l\'espèce de fallback', species.scientificName);
        }
    }
    return species;
}