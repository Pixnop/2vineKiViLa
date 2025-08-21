import CONFIG from './config.js';

// Gestionnaire du mode debug
class DebugManager {
    constructor() {
        this.isEnabled = this.checkDebugMode();
        this.debugPanel = null;
        this.init();
    }

    checkDebugMode() {
        // Vérifier l'URL pour ?debug=true
        const urlParams = new URLSearchParams(window.location.search);
        const urlDebug = urlParams.get('debug') === 'true';
        
        // Vérifier le localStorage pour une activation persistante
        const localDebug = localStorage.getItem('debugMode') === 'true';
        
        return CONFIG.DEBUG_MODE || urlDebug || localDebug;
    }

    init() {
        if (this.isEnabled) {
            this.enableDebugMode();
            this.createDebugPanel();
            this.addKeyboardShortcuts();
        }
    }

    enableDebugMode() {
        // Mettre à jour la config globale
        CONFIG.DEBUG_MODE = true;
        console.log('🐛 Mode DEBUG activé');
        
        // Stocker dans localStorage pour les autres pages
        localStorage.setItem('debugMode', 'true');
        
        // Ajouter une classe CSS pour le styling debug
        document.body.classList.add('debug-mode');
    }

    disableDebugMode() {
        CONFIG.DEBUG_MODE = false;
        localStorage.removeItem('debugMode');
        document.body.classList.remove('debug-mode');
        
        if (this.debugPanel) {
            this.debugPanel.remove();
            this.debugPanel = null;
        }
        
        console.log('🐛 Mode DEBUG désactivé');
    }

    createDebugPanel() {
        this.debugPanel = document.createElement('div');
        this.debugPanel.className = 'debug-panel';
        this.debugPanel.innerHTML = `
            <div class="debug-header">
                <h4>🐛 DEBUG</h4>
                <button class="debug-close" onclick="window.debugManager.disableDebugMode()" data-debug-tooltip="Fermer le debug">×</button>
            </div>
            <div class="debug-content">
                <div data-debug-tooltip="Page actuellement affichée">
                    <strong>Page:</strong> <span id="debug-page">${this.getCurrentPage()}</span>
                </div>
                <div data-debug-tooltip="Chemin URL complet">
                    <strong>URL:</strong> <span id="debug-url">${window.location.pathname}</span>
                </div>
                <div data-debug-tooltip="État des données de session">
                    <strong>Session:</strong> <span id="debug-gamedata">-</span>
                </div>
                <div data-debug-tooltip="Performance de la page">
                    <strong>Perf:</strong> <span id="debug-perf">-</span>
                </div>
                <hr>
                <div class="debug-actions">
                    <button onclick="window.debugManager.showGameData()" class="debug-btn" data-debug-tooltip="Afficher toutes les données dans la console">
                        📊 Données
                    </button>
                    <button onclick="window.debugManager.clearStorage()" class="debug-btn" data-debug-tooltip="Effacer localStorage et sessionStorage">
                        🗑️ Nettoyer
                    </button>
                    <button onclick="window.debugManager.exportLogs()" class="debug-btn" data-debug-tooltip="Télécharger un rapport debug complet">
                        📥 Export
                    </button>
                    <button onclick="window.debugManager.toggleConsole()" class="debug-btn" data-debug-tooltip="Afficher/masquer les logs en temps réel">
                        🔍 Console
                    </button>
                </div>
                <div class="debug-species" id="debug-species-info"></div>
            </div>
        `;

        document.body.appendChild(this.debugPanel);
        this.updateDebugInfo();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        return path.split('/').pop().replace('.html', '') || 'index';
    }

    updateDebugInfo() {
        if (!this.debugPanel) return;

        // Mettre à jour les infos de base
        const pageElement = this.debugPanel.querySelector('#debug-page');
        const urlElement = this.debugPanel.querySelector('#debug-url');
        const gamedataElement = this.debugPanel.querySelector('#debug-gamedata');
        const perfElement = this.debugPanel.querySelector('#debug-perf');

        if (pageElement) pageElement.textContent = this.getCurrentPage();
        if (urlElement) urlElement.textContent = window.location.pathname;

        // Afficher les données de jeu si disponibles
        const gameData = this.getGameData();
        if (gamedataElement) {
            gamedataElement.textContent = gameData ? '✅ Active' : '❌ Vide';
            gamedataElement.style.color = gameData ? '#00ff41' : '#ff6b7a';
        }

        // Info de performance
        if (perfElement) {
            const loadTime = performance.now();
            perfElement.textContent = `${Math.round(loadTime)}ms`;
            perfElement.style.color = loadTime < 1000 ? '#00ff41' : loadTime < 3000 ? '#ffa500' : '#ff6b7a';
        }

        // Info sur l'espèce actuelle si disponible
        if (gameData && gameData.species) {
            this.showSpeciesDebugInfo(gameData.species);
        }
    }

    getGameData() {
        try {
            const data = sessionStorage.getItem('gameData');
            return data ? JSON.parse(data) : null;
        } catch (error) {
            return null;
        }
    }

    showSpeciesDebugInfo(species) {
        const container = this.debugPanel.querySelector('#debug-species-info');
        if (!container) return;

        container.innerHTML = `
            <hr>
            <div style="color: #00d4ff; font-weight: bold; margin-bottom: 0.75rem;">
                🧬 Espèce Actuelle
            </div>
            <div><strong>Nom:</strong> <span style="color: #ffffff;">${species.scientificName}</span></div>
            <div><strong>Vernac:</strong> <span style="color: #ffffff;">${species.vernacularName || 'N/A'}</span></div>
            <div><strong>TaxonKey:</strong> <span style="color: #00ff41;">${species.taxonKey}</span></div>
            <div><strong>Classe:</strong> <span style="color: #ffffff;">${species.class}</span></div>
            <div><strong>Observ:</strong> <span style="color: ${this.getOccurrenceColor(species.occurrenceCount)}">${species.occurrenceCount?.toLocaleString() || 'N/A'}</span></div>
        `;
    }

    getOccurrenceColor(count) {
        if (!count) return '#666';
        if (count < 1000) return '#ff6b7a';
        if (count < 10000) return '#ffa500';
        if (count < 100000) return '#00d4ff';
        return '#00ff41';
    }

    toggleConsole() {
        const existingConsole = document.getElementById('debug-console');
        
        if (existingConsole) {
            existingConsole.remove();
        } else {
            this.createDebugConsole();
        }
    }

    createDebugConsole() {
        const consoleDiv = document.createElement('div');
        consoleDiv.id = 'debug-console';
        consoleDiv.innerHTML = `
            <div style="
                position: fixed;
                bottom: 20px;
                left: 20px;
                right: 20px;
                height: 200px;
                background: rgba(0, 0, 0, 0.95);
                border: 1px solid rgba(0, 255, 65, 0.3);
                border-radius: 12px;
                z-index: 9998;
                backdrop-filter: blur(10px);
                display: flex;
                flex-direction: column;
            ">
                <div style="
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid rgba(0, 255, 65, 0.2);
                    color: #00ff41;
                    font-family: monospace;
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <span>🔍 Console Debug</span>
                    <button onclick="document.getElementById('debug-console').remove()" style="
                        background: none;
                        border: none;
                        color: #ff6b7a;
                        cursor: pointer;
                        font-size: 1.2rem;
                    ">×</button>
                </div>
                <div id="debug-console-content" style="
                    flex: 1;
                    padding: 1rem;
                    overflow-y: auto;
                    font-family: monospace;
                    font-size: 0.8rem;
                    color: #00ff41;
                ">
                    <div style="color: #00d4ff;">Console de debug en temps réel...</div>
                </div>
            </div>
        `;
        document.body.appendChild(consoleDiv);
    }

    showGameData() {
        const gameData = this.getGameData();
        if (gameData) {
            console.log('🎮 Données de jeu:', gameData);
            alert('Données de jeu affichées dans la console (F12)');
        } else {
            alert('Aucune donnée de jeu disponible');
        }
    }

    clearStorage() {
        if (confirm('Effacer toutes les données stockées ?')) {
            localStorage.clear();
            sessionStorage.clear();
            console.log('🗑️ Storage effacé');
            alert('Storage effacé');
        }
    }

    exportLogs() {
        const logs = {
            timestamp: new Date().toISOString(),
            page: this.getCurrentPage(),
            url: window.location.href,
            gameData: this.getGameData(),
            localStorage: { ...localStorage },
            userAgent: navigator.userAgent
        };

        const blob = new Blob([JSON.stringify(logs, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug-logs-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    addKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl + Shift + D pour toggle debug
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                if (this.isEnabled) {
                    this.disableDebugMode();
                } else {
                    this.enableDebugMode();
                    this.createDebugPanel();
                }
                this.isEnabled = !this.isEnabled;
            }

            // Ctrl + Shift + I pour afficher les infos
            if (e.ctrlKey && e.shiftKey && e.key === 'I' && this.isEnabled) {
                e.preventDefault();
                this.showGameData();
            }
        });
    }

    log(message, data = null) {
        if (this.isEnabled) {
            console.log(`🐛 [DEBUG] ${message}`, data || '');
        }
    }

    error(message, error = null) {
        if (this.isEnabled) {
            console.error(`🐛 [DEBUG ERROR] ${message}`, error || '');
        }
    }

    logApiCall(endpoint, params, response) {
        if (this.isEnabled) {
            console.group(`🔍 API Call: ${endpoint}`);
            console.log('Paramètres:', params);
            console.log('Réponse:', response);
            console.groupEnd();
        }
    }
}

// Instance globale
const debugManager = new DebugManager();

// Exposer globalement pour les boutons
window.debugManager = debugManager;

export default debugManager;