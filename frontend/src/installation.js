// Capture l'événement natif du navigateur qui permet de déclencher l'installation en un tap
// (Android/Chrome uniquement — iOS ne propose aucune API équivalente).
let evenementInstallDiffere = null;
let onEvenementDisponible = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  evenementInstallDiffere = e;
  if (onEvenementDisponible) onEvenementDisponible();
});

window.addEventListener("appinstalled", () => {
  evenementInstallDiffere = null;
});

export function surInstallabiliteDisponible(callback) {
  onEvenementDisponible = callback;
  if (evenementInstallDiffere) callback();
}

export function installationDisponible() {
  return !!evenementInstallDiffere;
}

export async function declencherInstallation() {
  if (!evenementInstallDiffere) return { ok: false, raison: "indisponible" };
  evenementInstallDiffere.prompt();
  const { outcome } = await evenementInstallDiffere.userChoice;
  evenementInstallDiffere = null;
  return { ok: outcome === "accepted", raison: outcome };
}

export function dejaInstallee() {
  // Mode standalone = l'appli tourne déjà comme une PWA installée (Android et iOS)
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export function estIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}
