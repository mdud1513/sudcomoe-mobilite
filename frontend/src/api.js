const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}, tentative = 0) {
  const methodesAvecCorps = ["POST", "PUT", "PATCH"];
  const methode = (options.method || "GET").toUpperCase();
  const corps = options.body ?? (methodesAvecCorps.includes(methode) ? "{}" : undefined);

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      body: corps,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch {
    // Échec réseau (souvent : le serveur Render était en veille et se réveille)
    if (tentative < 2) {
      await attendre(3000 * (tentative + 1));
      return request(path, options, tentative + 1);
    }
    throw new Error("Le serveur ne répond pas. Vérifiez votre connexion et réessayez dans quelques secondes.");
  }

  // Le serveur se réveille (ou est temporairement indisponible) : Render renvoie parfois une page d'erreur non-JSON
  if ([502, 503, 504].includes(res.status) && tentative < 2) {
    await attendre(3000 * (tentative + 1));
    return request(path, options, tentative + 1);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.erreur || `Le serveur a mis du temps à répondre (code ${res.status}). Réessayez.`);
  }
  return data;
}

export const api = {
  zones: () => request("/api/zones"),
  devis: ({ zoneDepart, zoneArrivee, nombrePassagers, arrets, positionDepart, positionArrivee }) =>
    request(
      `/api/devis?zoneDepart=${encodeURIComponent(zoneDepart)}&zoneArrivee=${encodeURIComponent(zoneArrivee)}&nombrePassagers=${nombrePassagers}&arrets=${encodeURIComponent(JSON.stringify((arrets || []).map((a) => ({ zone: a.zone }))))}` +
        (positionDepart ? `&positionDepart=${encodeURIComponent(JSON.stringify(positionDepart))}` : "") +
        (positionArrivee ? `&positionArrivee=${encodeURIComponent(JSON.stringify(positionArrivee))}` : "")
    ),
  chauffeurs: () => request("/api/chauffeurs"),
  creerCourse: (payload, token) =>
    request("/api/rides", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  course: (id) => request(`/api/rides/${id}`),
  suiviPublic: (id) => request(`/api/rides/${id}/suivi-public`),
  coursesDemandees: (zone, token) =>
    request(`/api/rides?statut=demandee${zone ? `&zone=${encodeURIComponent(zone)}` : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  coursesChauffeur: (chauffeurId) => request(`/api/rides?chauffeurId=${chauffeurId}`),
  accepter: (id, token) => request(`/api/rides/${id}/accepter`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  liberer: (id, token) => request(`/api/rides/${id}/liberer`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  clientIntrouvable: (id, token) => request(`/api/rides/${id}/client-introuvable`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  clientNeConfirmePas: (id, token) => request(`/api/rides/${id}/client-ne-confirme-pas`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  terminer: (id, modePaiement) => request(`/api/rides/${id}/terminer`, { method: "POST", body: JSON.stringify({ modePaiement }) }),
  annuler: (id, motif) => request(`/api/rides/${id}/annuler`, { method: "POST", body: JSON.stringify({ motif }) }),
  contesterArrivee: (id) => request(`/api/rides/${id}/contester-arrivee`, { method: "POST" }),
  noter: (rideId, auteur, note, commentaire, token) =>
    request(`/api/rides/${rideId}/noter`, {
      method: "POST",
      body: JSON.stringify({ auteur, note, commentaire }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  notesDeLaCourse: (rideId) => request(`/api/rides/${rideId}/notes`),
  signaler: (id, auteur, message) =>
    request(`/api/rides/${id}/signaler`, { method: "POST", body: JSON.stringify({ auteur, message }) }),
  solde: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}/solde`, { headers: { Authorization: `Bearer ${token}` } }),
  gains: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}/gains`, { headers: { Authorization: `Bearer ${token}` } }),
  moi: (token) => request("/api/chauffeurs/moi", { headers: { Authorization: `Bearer ${token}` } }),
  uploaderPhotoChauffeur: (photoBase64, token) =>
    request("/api/chauffeurs/moi/photo", { method: "POST", body: JSON.stringify({ photoBase64 }), headers: { Authorization: `Bearer ${token}` } }),
  inscrireChauffeur: (payload) => request("/api/chauffeurs", { method: "POST", body: JSON.stringify(payload) }),
  connexionChauffeur: (payload) => request("/api/chauffeurs/connexion", { method: "POST", body: JSON.stringify(payload) }),
  validerChauffeur: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}/valider`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  desactiverChauffeur: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}/desactiver`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  reactiverChauffeur: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}/reactiver`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  reinitialiserPinChauffeur: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}/reinitialiser-pin`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  supprimerChauffeur: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }),
  adminExiste: () => request("/api/admin/existe"),
  adminBootstrap: (payload) => request("/api/admin/bootstrap", { method: "POST", body: JSON.stringify(payload) }),
  adminConnexion: (payload) => request("/api/admin/connexion", { method: "POST", body: JSON.stringify(payload) }),
  adminInviter: (payload, token) =>
    request("/api/admin/inviter", { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } }),
  adminStatistiques: (token) =>
    request("/api/admin/statistiques", { headers: { Authorization: `Bearer ${token}` } }),
  adminBilanPilote: (token) =>
    request("/api/admin/bilan-pilote", { headers: { Authorization: `Bearer ${token}` } }),
  adminSignalements: (token) =>
    request("/api/admin/signalements", { headers: { Authorization: `Bearer ${token}` } }),
  adminBilanPilote: (token) =>
    request("/api/admin/bilan-pilote", { headers: { Authorization: `Bearer ${token}` } }),
  traiterSignalement: (id, token) =>
    request(`/api/admin/signalements/${id}/traiter`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  pushClePublique: () => request("/api/push/cle-publique"),
  pushAbonnerChauffeur: (subscription, token) =>
    request("/api/push/abonner-chauffeur", { method: "POST", body: JSON.stringify({ subscription }), headers: { Authorization: `Bearer ${token}` } }),
  pushAbonnerCourse: (rideId, subscription) =>
    request(`/api/push/abonner-course/${rideId}`, { method: "POST", body: JSON.stringify({ subscription }) }),
  arriveeClient: (id, token, position) =>
    request(`/api/rides/${id}/arrivee-client`, { method: "POST", body: JSON.stringify({ position }), headers: { Authorization: `Bearer ${token}` } }),
  arriveeDestination: (id, token) => request(`/api/rides/${id}/arrivee-destination`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  relancerClient: (id, token) => request(`/api/rides/${id}/relancer-client`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  inscriptionClient: (payload) => request("/api/clients/inscription", { method: "POST", body: JSON.stringify(payload) }),
  connexionClient: (payload) => request("/api/clients/connexion", { method: "POST", body: JSON.stringify(payload) }),
  clientMoi: (token) => request("/api/clients/moi", { headers: { Authorization: `Bearer ${token}` } }),
  clientMesCourses: (token) => request("/api/clients/moi/courses", { headers: { Authorization: `Bearer ${token}` } }),
  ajouterAdresseFavorite: (payload, token) =>
    request("/api/clients/moi/adresses", { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } }),
  supprimerAdresseFavorite: (index, token) =>
    request(`/api/clients/moi/adresses/${index}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }),
  adminCreerSyndicat: (payload, token) =>
    request("/api/admin/syndicats", { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } }),
  adminListeSyndicats: (token) =>
    request("/api/admin/syndicats", { headers: { Authorization: `Bearer ${token}` } }),
  adminBasculerSyndicat: (id, token) =>
    request(`/api/admin/syndicats/${id}/desactiver`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  connexionSyndicat: (payload) => request("/api/syndicats/connexion", { method: "POST", body: JSON.stringify(payload) }),
  syndicatCotisations: (token, jour) =>
    request(`/api/syndicats/moi/cotisations${jour ? `?jour=${jour}` : ""}`, { headers: { Authorization: `Bearer ${token}` } }),
  syndicatMarquerPaye: (cotisationId, token) =>
    request(`/api/syndicats/cotisations/${cotisationId}/marquer-paye`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
};
