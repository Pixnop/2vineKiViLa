// État global de l'application
const GameState = {
    currentScreen: 'home',
    gameMode: null,
    selectedTaxon: null,
    currentSpecies: null,
    score: 0,
    streak: 0,
    hintsUsed: 0,
    maxHints: 4,
    lives: 3,
    maxLives: 3,
    wrongAnswers: [],
    map: null,
    speciesCache: [],
    currentSession: {
        startTime: null,
        totalAttempts: 0,
        correctAnswers: 0,
        species: null
    },
    stats: {
        totalPlayed: 0,
        totalFound: 0,
        bestStreak: 0,
        discoveredSpecies: []
    }
};

export default GameState;