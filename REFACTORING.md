# Refactorisation de l'Application 2vineKiViLa

## Nouvelle Structure

L'application a été refactorisée pour une meilleure organisation et maintenabilité. Voici la nouvelle structure :

```
2vineKiViLa/
├── pages/                  # Pages HTML séparées
│   ├── home.html          # Page d'accueil
│   ├── loading.html       # Page de chargement
│   ├── game.html          # Page de jeu
│   ├── result.html        # Page de résultats
│   └── stats.html         # Page des statistiques
│
├── js/                    # Scripts JavaScript modulaires
│   ├── api/               # Modules d'API
│   │   └── gbif.js       # API GBIF
│   ├── game/             # Logique de jeu
│   │   ├── state.js      # État global du jeu
│   │   └── species-selector.js # Sélection d'espèces
│   ├── ui/               # Interface utilisateur
│   │   ├── loading.js    # Gestion du chargement
│   │   ├── screen-manager.js # Gestionnaire d'écrans
│   │   └── suggestions.js # Système de suggestions
│   ├── utils/            # Utilitaires
│   │   ├── config.js     # Configuration
│   │   └── navigation.js # Navigation entre pages
│   └── pages/            # Scripts spécifiques aux pages
│       ├── home.js       # Script de la page d'accueil
│       ├── loading.js    # Script de la page de chargement
│       └── stats.js      # Script de la page des statistiques
│
├── css/                   # Styles CSS modulaires
│   ├── main.css          # Styles de base et variables
│   └── pages/            # Styles spécifiques aux pages
│       ├── home.css      # Styles de l'accueil
│       ├── loading.css   # Styles du chargement
│       ├── game.css      # Styles du jeu
│       ├── result.css    # Styles des résultats
│       └── stats.css     # Styles des statistiques
│
├── index-new.html         # Nouveau point d'entrée (avec redirection)
└── [fichiers originaux]   # Anciens fichiers conservés pour référence
```

## Avantages de cette Structure

### 1. **Séparation des Responsabilités**
- Chaque module a une responsabilité claire
- Code plus facile à comprendre et maintenir
- Réutilisabilité améliorée

### 2. **Navigation Multi-Pages**
- Chaque écran est maintenant une page HTML séparée
- Navigation plus naturelle avec l'historique du navigateur
- Possibilité de créer des liens directs vers chaque page

### 3. **Modularité**
- Scripts JavaScript organisés en modules ES6
- CSS divisé par fonctionnalité
- Facilite les tests et le débogage

### 4. **Performance**
- Chargement à la demande des ressources
- Réduction de la taille des fichiers individuels
- Meilleure mise en cache par le navigateur

## Comment Utiliser la Nouvelle Structure

### 1. **Point d'Entrée**
- Accédez à `index-new.html` qui redirige vers `pages/home.html`
- Ou accédez directement à `pages/home.html`

### 2. **Navigation**
- La navigation se fait automatiquement via le système `navigation.js`
- Les données sont partagées via `sessionStorage` entre les pages

### 3. **Développement**
- Modifiez les styles dans `css/pages/` pour chaque page
- Ajoutez de nouvelles fonctionnalités dans les modules appropriés
- Utilisez les modules existants pour étendre les fonctionnalités

## Migration depuis l'Ancienne Version

Pour migrer depuis l'ancienne version :

1. **Remplacer le point d'entrée** : Utilisez `index-new.html` au lieu de `index.html`
2. **Statistiques** : Les données existantes dans `localStorage` sont conservées
3. **Compatibilité** : L'ancienne version reste fonctionnelle en parallèle

## Modules Principaux

### `js/api/gbif.js`
Gestion de toutes les interactions avec l'API GBIF

### `js/game/species-selector.js`
Logique de sélection intelligente des espèces

### `js/utils/navigation.js`
Système de navigation entre pages avec gestion des données

### `js/ui/suggestions.js`
Système d'autocomplétion pour la saisie des espèces

## Fichiers CSS

### `css/main.css`
Variables CSS globales et styles de base communs

### `css/pages/`
Styles spécifiques à chaque page pour un chargement optimisé

## Scripts de Page

Chaque page a son propre script dans `js/pages/` qui :
- Initialise les fonctionnalités spécifiques à la page
- Gère les interactions utilisateur
- Communique avec les modules centraux

Cette nouvelle structure facilite la maintenance, améliore les performances et rend l'application plus évolutive.