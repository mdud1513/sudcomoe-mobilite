import { api } from "./api.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function creerAbonnement() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, raison: "non_supporte" };
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, raison: "refuse" };

    const registration = await navigator.serviceWorker.ready;
    const { clePublique } = await api.pushClePublique();

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(clePublique),
      });
    }
    return { ok: true, subscription: subscription.toJSON() };
  } catch {
    return { ok: false, raison: "erreur" };
  }
}

// Abonnement permanent pour un chauffeur : reçoit toutes les nouvelles demandes tant qu'il est actif
export async function abonnerChauffeur(token) {
  const resultat = await creerAbonnement();
  if (!resultat.ok) return resultat;
  await api.pushAbonnerChauffeur(resultat.subscription, token);
  return resultat;
}

// Abonnement limité à une course précise : pour le client (avec ou sans compte)
export async function abonnerCourse(rideId) {
  const resultat = await creerAbonnement();
  if (!resultat.ok) return resultat;
  await api.pushAbonnerCourse(rideId, resultat.subscription);
  return resultat;
}

// Abonnement permanent pour un admin : reçoit les nouvelles inscriptions chauffeur à valider
export async function abonnerAdmin(token) {
  const resultat = await creerAbonnement();
  if (!resultat.ok) return resultat;
  await api.pushAbonnerAdmin(resultat.subscription, token);
  return resultat;
}
