const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
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
};
