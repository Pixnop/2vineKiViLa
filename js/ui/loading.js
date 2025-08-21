// Gestion de l'écran de chargement
export function updateLoadingStep(step) {
    const loadingStep = document.getElementById('loading-step');
    if (loadingStep) {
        loadingStep.textContent = step;
    }
}

export function showLoadingScreen() {
    hideAllScreens();
    document.getElementById('loading-screen').classList.add('active');
}

export function hideLoadingScreen() {
    document.getElementById('loading-screen').classList.remove('active');
}

function hideAllScreens() {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
}