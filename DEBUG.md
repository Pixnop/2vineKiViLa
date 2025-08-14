# Guide du Mode Debug 🐛

Le mode debug permet de diagnostiquer et analyser le comportement de l'application en temps réel.

## Activation du Mode Debug

### 🔗 Méthode 1 : URL
Ajoutez `?debug=true` à l'URL :
```
https://votre-site.com/pages/home.html?debug=true
```

### ⌨️ Méthode 2 : Raccourci Clavier
- **Ctrl + Shift + D** : Active/désactive le mode debug
- **Ctrl + Shift + I** : Affiche les informations de jeu dans la console

### 💾 Méthode 3 : LocalStorage (Persistant)
En console navigateur :
```javascript
localStorage.setItem('debugMode', 'true');
// Puis recharger la page
```

## Fonctionnalités du Mode Debug

### 🎛️ Panneau de Debug
- **Position** : Coin supérieur droit
- **Contenu** :
  - Page actuelle
  - URL courante  
  - Présence de données de jeu
  - Informations sur l'espèce actuelle

### 📊 Boutons d'Action
- **Voir données** : Affiche les données complètes dans la console
- **Clear storage** : Efface localStorage et sessionStorage
- **Export logs** : Télécharge un fichier JSON avec toutes les infos debug

### 🔍 Logs Automatiques

#### Recherche d'Espèces
```javascript
🐛 [DEBUG] Recherche suggestions pour "lion"
- Nombre de résultats: 8
- Temps de recherche: 250ms
- Types de correspondance: scientific, vernacular
```

#### Sélection d'Espèces
```javascript
🐛 [DEBUG] Espèce sélectionnée
- Espèce: Panthera leo
- Temps de sélection: 1850ms
- TaxonKey: 5219404
- Occurrences: 15420
```

#### Appels API
```javascript
🔍 API Call: /species/suggest
Paramètres: {q: "lion", limit: 10}
Réponse: {...}
```

## Recherche Multilingue Avancée

### 🌍 Langues Supportées
- **Français** : cerf, rouge-gorge, grand chêne
- **Anglais** : deer, robin, great oak
- **Espagnol** : ciervo, petirrojo, gran roble
- **Latin** : Cervus elaphus, Erithacus rubecula

### 🔍 Types de Recherche
1. **Nom scientifique** : `Panthera leo`
2. **Nom vernaculaire** : `lion`
3. **Recherche fuzzy** : `panthera leo` → `Panthera leo`
4. **Détection de langue** : `le grand cerf` (détecté comme français)

### 📈 Score de Pertinence
- **Correspondance exacte** : +20 points
- **Début de nom scientifique** : +15 points
- **Début de nom vernaculaire** : +12 points
- **Nom scientifique contient** : +10 points
- **Type SPECIES** : +5 points

## Indicateurs Visuels

### 🚨 Bannière Debug Mode
- Position : Coin supérieur gauche
- Couleur : Rouge clignotant
- Texte : "🐛 DEBUG MODE"

### 🎨 Classes CSS Debug
- `.debug-mode` : Ajoutée au body
- Permet des styles spécifiques au debug

## Conseils d'Utilisation

### 🔍 Pour Développeurs
1. **Tester la recherche** : Essayez différentes langues et fautes de frappe
2. **Analyser les performances** : Surveillez les temps de réponse API
3. **Débugger la sélection** : Vérifiez les critères de filtrage des espèces

### 🐞 Pour Signaler des Bugs
1. **Activer le debug** avant de reproduire le problème
2. **Exporter les logs** après le problème
3. **Joindre le fichier JSON** au rapport de bug

## Désactivation

### ⚡ Rapide
- **Ctrl + Shift + D**
- **Bouton × sur le panneau**

### 🧹 Complète
```javascript
localStorage.removeItem('debugMode');
// Puis recharger sans ?debug=true dans l'URL
```

## Sécurité

⚠️ **Important** : Le mode debug ne doit pas être activé en production car il :
- Expose des informations internes
- Peut ralentir l'application
- Génère beaucoup de logs

Le mode debug est un outil puissant pour comprendre le comportement de l'application et diagnostiquer les problèmes !