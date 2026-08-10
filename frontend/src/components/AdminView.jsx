import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function AdminView({ onToast }) {
  const [chauffeurs, setChauffeurs] = useState([]);
  const [loading, setLoading] = useState(true);

  async function charger() {
    try {
      const liste = await api.chauffeurs();
      setChauffeurs(liste);
    } catch (err) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    charger();
    const t = setInterval(charger, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function valider(id) {
    try {
      await api.validerChauffeur(id);
      onToast("Chauffeur validé et activé.");
      charger();
    } catch (err) {
      onToast(err.message);
    }
  }

  const enAttente = chauffeurs.filter((c) => c.statut !== "actif");
  const actifs = chauffeurs.filter((c) => c.statut === "actif");

  if (loading) return <p className="card__hint">Chargement…</p>;

  return (
    <div>
      <p className="section-label">En attente de validation ({enAttente.length})</p>
      <div style={{ height: 8 }} />
      {enAttente.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__glyph">—</div>
            Aucune inscription en attente.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {enAttente.map((c) => (
            <div key={c.id} className="card">
              <div className="driver-badge" style={{ background: "transparent", padding: 0, marginBottom: 12 }}>
                <div className="driver-badge__avatar">{c.nom.split(" ").map((n) => n[0]).join("")}</div>
                <div>
                  <div className="driver-badge__name">{c.nom} · {c.badge}</div>
                  <div className="driver-badge__meta">
                    {c.telephone} · Zone {c.zone} · {c.vehicule?.immatriculation}
                  </div>
                </div>
              </div>
              <p className="card__hint" style={{ marginBottom: 12 }}>
                Statut : <span className="pill">{c.statut}</span> — vérifiez le diagnostic gaz et la signature
                du contrat avant de valider.
              </p>
              <button className="btn btn--primary" onClick={() => valider(c.id)}>
                Valider et activer
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 20 }} />
      <p className="section-label">Chauffeurs actifs ({actifs.length})</p>
      <div style={{ height: 8 }} />
      <div className="card">
        {actifs.map((c) => (
          <div key={c.id} className="driver-badge">
            <div className="driver-badge__avatar">{c.nom.split(" ").map((n) => n[0]).join("")}</div>
            <div>
              <div className="driver-badge__name">{c.nom} · {c.badge}</div>
              <div className="driver-badge__meta">{c.telephone} · Zone {c.zone}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
