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
  devis: ({ zoneDepart, zoneArrivee, nombrePassagers, arrets }) =>
    request(
      `/api/devis?zoneDepart=${encodeURIComponent(zoneDepart)}&zoneArrivee=${encodeURIComponent(zoneArrivee)}&nombrePassagers=${nombrePassagers}&arrets=${encodeURIComponent(JSON.stringify((arrets || []).map((a) => ({ zone: a.zone }))))}`
    ),
  chauffeurs: () => request("/api/chauffeurs"),
  creerCourse: (payload, token) =>
    request("/api/rides", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  course: (id) => request(`/api/rides/${id}`),
  coursesDemandees: (zone) => request(`/api/rides?statut=demandee${zone ? `&zone=${encodeURIComponent(zone)}` : ""}`),
  coursesChauffeur: (chauffeurId) => request(`/api/rides?chauffeurId=${chauffeurId}`),
  accepter: (id, token) => request(`/api/rides/${id}/accepter`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  terminer: (id, modePaiement) => request(`/api/rides/${id}/terminer`, { method: "POST", body: JSON.stringify({ modePaiement }) }),
  annuler: (id) => request(`/api/rides/${id}/annuler`, { method: "POST" }),
  solde: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}/solde`, { headers: { Authorization: `Bearer ${token}` } }),
  gains: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}/gains`, { headers: { Authorization: `Bearer ${token}` } }),
  moi: (token) => request("/api/chauffeurs/moi", { headers: { Authorization: `Bearer ${token}` } }),
  inscrireChauffeur: (payload) => request("/api/chauffeurs", { method: "POST", body: JSON.stringify(payload) }),
  connexionChauffeur: (payload) => request("/api/chauffeurs/connexion", { method: "POST", body: JSON.stringify(payload) }),
  validerChauffeur: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}/valider`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  supprimerChauffeur: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }),
  adminExiste: () => request("/api/admin/existe"),
  adminBootstrap: (payload) => request("/api/admin/bootstrap", { method: "POST", body: JSON.stringify(payload) }),
  adminConnexion: (payload) => request("/api/admin/connexion", { method: "POST", body: JSON.stringify(payload) }),
  adminInviter: (payload, token) =>
    request("/api/admin/inviter", { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } }),
  adminStatistiques: (token) =>
    request("/api/admin/statistiques", { headers: { Authorization: `Bearer ${token}` } }),
  inscriptionClient: (payload) => request("/api/clients/inscription", { method: "POST", body: JSON.stringify(payload) }),
  connexionClient: (payload) => request("/api/clients/connexion", { method: "POST", body: JSON.stringify(payload) }),
  clientMoi: (token) => request("/api/clients/moi", { headers: { Authorization: `Bearer ${token}` } }),
  clientMesCourses: (token) => request("/api/clients/moi/courses", { headers: { Authorization: `Bearer ${token}` } }),
  ajouterAdresseFavorite: (payload, token) =>
    request("/api/clients/moi/adresses", { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } }),
  supprimerAdresseFavorite: (index, token) =>
    request(`/api/clients/moi/adresses/${index}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }),
};
