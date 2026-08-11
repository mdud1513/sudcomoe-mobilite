import { useEffect, useState } from "react";
import { api } from "../api.js";

const STATUT_LABELS = {
  demandee: "En recherche",
  confirmee: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

export default function ClientHistory({ token, onFermer }) {
  const [courses, setCourses] = useState(null);

  useEffect(() => {
    api
      .clientMesCourses(token)
      .then(setCourses)
      .catch(() => setCourses([]));
  }, [token]);

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className="card__title" style={{ marginBottom: 0, fontSize: 15 }}>Mes courses</p>
          <button className="btn btn--outline" style={{ width: "auto", padding: "6px 12px", fontSize: 12.5 }} onClick={onFermer}>
            Retour
          </button>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {courses === null ? (
        <p className="card__hint">Chargement…</p>
      ) : courses.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__glyph">—</div>
            Aucune course pour le moment.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {courses.map((c) => (
            <div key={c.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="ticket__route" style={{ fontSize: 16, marginBottom: 2 }}>
                    <span>{c.zoneDepart}</span>
                    <span className="ticket__route-arrow">→</span>
                    <span>{c.zoneArrivee}</span>
                  </div>
                  <div className="card__hint" style={{ marginBottom: 0 }}>
                    {new Date(c.creeLe).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {" · "}
                    <span className="pill">{STATUT_LABELS[c.statut] || c.statut}</span>
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 15 }}>
                  {c.montant} FCFA
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
