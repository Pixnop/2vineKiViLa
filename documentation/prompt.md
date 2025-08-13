**Projet : 2vineKiViLa - Jeu de devinettes d'espèces basé sur leur répartition géographique**

## Contexte
Je veux créer un jeu web éducatif et fun où les joueurs doivent deviner une espèce animale ou végétale en observant uniquement sa carte de répartition géographique. Le jeu s'appelle "2vineKiViLa" (stylisation de "Devine Qui Vit Là").

## Documentation disponible
J'ai placé la documentation de l'API GBIF dans le dossier `documentation/` :
- `checklistbank.json` - API pour les informations taxonomiques
- `occurrence.json` - API pour les données d'occurrence/répartition
- `registry.json` - API pour le registre GBIF
- `v2-maps.json` - API pour générer les cartes de répartition

## Spécifications techniques

### Contraintes
- **100% client-side** : L'application doit fonctionner sur GitHub Pages (pas de backend)
- Utiliser l'API GBIF directement depuis le navigateur
- HTML, CSS, JavaScript vanilla ou avec frameworks légers compatibles GitHub Pages
- Design responsive pour mobile et desktop

### Fonctionnalités principales

1. **Sélection dynamique des espèces**
- **PAS de liste pré-définie** - Sélection 100% dynamique via l'API GBIF
- Utiliser l'API GBIF pour chercher des espèces selon différents critères :
* Nombre d'occurrences (popularité) - espèces bien documentées
* Répartition géographique intéressante (ni trop locale, ni trop globale)
* Avoir des images disponibles
* Avoir un nom vernaculaire (common name)
- Modes de sélection possibles :
* **Mode "Populaire"** : Espèces avec beaucoup d'observations (> 10000 occurrences)
* **Mode "Découverte"** : Espèces moyennement documentées (1000-10000 occurrences)
* **Mode "Expert"** : Espèces plus rares (100-1000 occurrences)
* **Mode "Thématique"** : Par classe (Aves, Mammalia, Insecta, Plantae, etc.)

2. **Stratégie de sélection d'espèces**
- Requêter l'API GBIF avec des filtres pour obtenir des espèces jouables :
* `hasCoordinate=true` (a des données de localisation)
* `hasGeospatialIssue=false` (données géographiques valides)
* `mediaType=StillImage` (a des images)
* `rank=SPECIES` (niveau espèce uniquement)
- Utiliser la pagination avec un offset aléatoire pour varier les espèces
- Filtrer côté client pour s'assurer que :
* L'espèce a un nom vernaculaire OU un nom scientifique prononçable
* La carte de répartition est intéressante (ni un seul point, ni toute la planète)

3. **Écran de jeu principal**
- Afficher une carte du monde avec les points de répartition d'une espèce
- Utiliser l'API GBIF Maps v2 pour générer les tuiles de carte
- Système d'indices progressifs :
* Indice 1 : Classe taxonomique (Oiseau, Mammifère, Plante, etc.)
* Indice 2 : Nombre d'observations dans GBIF
* Indice 3 : Continent(s) principal(aux)
* Indice 4 : Première lettre du nom
- Champ de saisie pour la réponse avec autocomplétion via l'API GBIF suggest
- Score et streak

4. **Interface utilisateur**
- Sélecteur de mode de difficulté/thème en début de partie
- Design moderne et ludique
- Animations de feedback
- Statistiques : espèces trouvées, meilleur streak, etc.

### APIs GBIF à utiliser

1. **Pour trouver des espèces jouables** :
```
/occurrence/search?hasCoordinate=true&hasGeospatialIssue=false&rank=SPECIES&limit=300&offset=[random]
```
Puis extraire les taxonKey uniques et les filtrer

2. **Pour obtenir les infos de l'espèce** :
```
/species/{taxonKey}
/species/{taxonKey}/vernacularNames
/species/{taxonKey}/media
```

3. **Pour la carte** :
```
/v2/map/occurrence/density/{z}/{x}/{y}@2x.png?taxonKey={taxonKey}
```

4. **Pour l'autocomplétion** :
```
/species/suggest?q={userInput}
```

### Exemple d'algorithme de sélection
```javascript
// 1. Faire une recherche avec des critères de base
// 2. Offset aléatoire pour varier les résultats  
// 3. Récupérer les taxonKeys des résultats
// 4. Pour chaque taxonKey, vérifier s'il est "jouable" :
//    - A assez d'occurrences mais pas trop
//    - A une répartition intéressante
//    - A un nom (vernaculaire ou scientifique utilisable)
// 5. Sélectionner aléatoirement parmi les candidats valides
```

## Commencer par
1. Analyser la documentation fournie pour comprendre les endpoints disponibles
2. Créer une fonction pour récupérer dynamiquement des espèces depuis GBIF
3. Implémenter la logique de filtrage pour sélectionner des espèces "jouables"
4. Créer l'interface de jeu avec la carte
5. Ajouter les mécaniques de jeu et le scoring

Peux-tu créer cette application web en utilisant la documentation GBIF fournie ? L'objectif clé est de NE PAS avoir de liste d'espèces pré-définie mais de tout récupérer dynamiquement depuis l'API GBIF selon différents critères de sélection.
