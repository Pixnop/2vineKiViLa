import debugManager from '../utils/debug.js';

// Gestionnaire des suggestions d'autocomplétion
class SuggestionsManager {
    constructor(api) {
        this.api = api;
        this.currentIndex = -1;
        this.suggestions = [];
        this.isVisible = false;
        this.debounceTimer = null;
    }

    async handleInput(inputElement, query) {
        // Débouncer les requêtes
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(async () => {
            if (query.length < 2) {
                this.hideSuggestions();
                return;
            }

            try {
                this.showLoading();
                const startTime = performance.now();
                const suggestions = await this.api.suggestSpecies(query, 10);
                const endTime = performance.now();
                
                // Debug: Logger la recherche
                debugManager.log(`Recherche suggestions pour "${query}"`, {
                    resultCount: suggestions.length,
                    searchTime: `${Math.round(endTime - startTime)}ms`,
                    suggestions: suggestions.map(s => ({
                        name: s.vernacularName || s.scientificName,
                        scientific: s.scientificName,
                        matchType: s.matchType
                    }))
                });
                
                this.displaySuggestions(suggestions, query);
            } catch (error) {
                console.error('Erreur lors de la recherche de suggestions:', error);
                debugManager.error('Erreur recherche suggestions', error);
                this.showError();
            }
        }, 300);
    }

    displaySuggestions(suggestions, query) {
        const container = document.getElementById('suggestions');
        if (!container) return;

        this.suggestions = suggestions;
        this.currentIndex = -1;

        if (suggestions.length === 0) {
            this.showEmptyMessage();
            return;
        }

        container.innerHTML = '';
        container.style.display = 'block';
        this.isVisible = true;

        suggestions.forEach((suggestion, index) => {
            const item = this.createSuggestionItem(suggestion, query, index);
            container.appendChild(item);
        });
    }

    createSuggestionItem(suggestion, query, index) {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.dataset.index = index;

        const name = suggestion.vernacularName || suggestion.canonicalName || suggestion.scientificName;
        const scientificName = suggestion.scientificName || suggestion.canonicalName;
        const rank = suggestion.rank || 'SPECIES';

        // Surligner les termes de recherche
        const highlightedName = this.highlightText(name, query);
        const highlightedScientific = this.highlightText(scientificName, query);

        item.innerHTML = `
            <span class="suggestion-name">${highlightedName}</span>
            <span class="suggestion-scientific">${highlightedScientific}</span>
            <span class="suggestion-rank">${rank}</span>
        `;

        // Événements
        item.addEventListener('click', () => this.selectSuggestion(index));
        item.addEventListener('mouseenter', () => this.highlightSuggestion(index));

        return item;
    }

    highlightText(text, query) {
        if (!text || !query) return text;
        
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }

    showLoading() {
        const container = document.getElementById('suggestions');
        if (!container) return;

        container.innerHTML = '<div class="suggestion-loading">Recherche...</div>';
        container.style.display = 'block';
        this.isVisible = true;
    }

    showError() {
        const container = document.getElementById('suggestions');
        if (!container) return;

        container.innerHTML = '<div class="suggestion-error">Erreur lors de la recherche</div>';
        container.style.display = 'block';
        this.isVisible = true;
    }

    showEmptyMessage() {
        const container = document.getElementById('suggestions');
        if (!container) return;

        container.innerHTML = '<div class="suggestion-empty">Aucun résultat trouvé</div>';
        container.style.display = 'block';
        this.isVisible = true;
    }

    hideSuggestions() {
        const container = document.getElementById('suggestions');
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
        this.isVisible = false;
        this.currentIndex = -1;
    }

    handleKeyNavigation(event, inputElement) {
        if (!this.isVisible || this.suggestions.length === 0) return false;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.currentIndex = Math.min(this.currentIndex + 1, this.suggestions.length - 1);
                this.highlightSuggestion(this.currentIndex);
                return true;

            case 'ArrowUp':
                event.preventDefault();
                this.currentIndex = Math.max(this.currentIndex - 1, -1);
                this.highlightSuggestion(this.currentIndex);
                return true;

            case 'Enter':
                if (this.currentIndex >= 0) {
                    event.preventDefault();
                    this.selectSuggestion(this.currentIndex);
                    return true;
                }
                break;

            case 'Escape':
                this.hideSuggestions();
                return true;
        }

        return false;
    }

    highlightSuggestion(index) {
        // Retirer la surbrillance précédente
        document.querySelectorAll('.suggestion-item.selected').forEach(item => {
            item.classList.remove('selected');
        });

        // Ajouter la surbrillance au nouvel élément
        if (index >= 0) {
            const item = document.querySelector(`[data-index="${index}"]`);
            if (item) {
                item.classList.add('selected');
                this.currentIndex = index;
            }
        }
    }

    selectSuggestion(index) {
        if (index < 0 || index >= this.suggestions.length) return;

        const suggestion = this.suggestions[index];
        const name = suggestion.vernacularName || suggestion.canonicalName || suggestion.scientificName;
        
        const inputElement = document.getElementById('species-input');
        if (inputElement) {
            inputElement.value = name;
            inputElement.focus();
        }

        this.hideSuggestions();
        
        // Déclencher la soumission automatique
        const event = new CustomEvent('suggestionSelected', {
            detail: { suggestion, name }
        });
        document.dispatchEvent(event);
    }

    getCurrentSuggestion() {
        if (this.currentIndex >= 0 && this.currentIndex < this.suggestions.length) {
            return this.suggestions[this.currentIndex];
        }
        return null;
    }
}

export default SuggestionsManager;