const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erreur || "Une erreur est survenue.");
  return data;
}

export const api = {
  zones: () => request("/api/zones"),
  chauffeurs: () => request("/api/chauffeurs"),
  creerCourse: (payload) => request("/api/rides", { method: "POST", body: JSON.stringify(payload) }),
  course: (id) => request(`/api/rides/${id}`),
  coursesDemandees: (zone) => request(`/api/rides?statut=demandee${zone ? `&zone=${encodeURIComponent(zone)}` : ""}`),
  coursesChauffeur: (chauffeurId) => request(`/api/rides?chauffeurId=${chauffeurId}`),
  accepter: (id, chauffeurId) => request(`/api/rides/${id}/accepter`, { method: "POST", body: JSON.stringify({ chauffeurId }) }),
  terminer: (id, modePaiement) => request(`/api/rides/${id}/terminer`, { method: "POST", body: JSON.stringify({ modePaiement }) }),
  annuler: (id) => request(`/api/rides/${id}/annuler`, { method: "POST" }),
  solde: (chauffeurId) => request(`/api/chauffeurs/${chauffeurId}/solde`),
  inscrireChauffeur: (payload) => request("/api/chauffeurs", { method: "POST", body: JSON.stringify(payload) }),
  validerChauffeur: (chauffeurId, token) =>
    request(`/api/chauffeurs/${chauffeurId}/valider`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }),
  adminExiste: () => request("/api/admin/existe"),
  adminBootstrap: (payload) => request("/api/admin/bootstrap", { method: "POST", body: JSON.stringify(payload) }),
  adminConnexion: (payload) => request("/api/admin/connexion", { method: "POST", body: JSON.stringify(payload) }),
  adminInviter: (payload, token) =>
    request("/api/admin/inviter", { method: "POST", body: JSON.stringify(payload), headers: { Authorization: `Bearer ${token}` } }),
};
