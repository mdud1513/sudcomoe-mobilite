import { useEffect, useState } from "react";
import { api } from "../api.js";
import Ticket from "./Ticket.jsx";
import DriverRegister from "./DriverRegister.jsx";

export default function DriverView({ chauffeurs, zones, onToast, onChauffeurAjoute }) {
  const [inscription, setInscription] = useState(false);
  const [chauffeurId, setChauffeurId] = useState(chauffeurs[0]?.id || "");
  const [demandes, setDemandes] = useState([]);
  const [courseActive, setCourseActive] = useState(null);
  const [solde, setSolde] = useState(null);

  const chauffeur = chauffeurs.find((c) => c.id === chauffeurId);

  async function rafraichir() {
    if (!chauffeurId) return;
    try {
      const [enCours, mesCourses, mSolde] = await Promise.all([
        api.coursesDemandees(chauffeur?.zone),
        api.coursesChauffeur(chauffeurId),
        api.solde(chauffeurId),
      ]);
      setDemandes(enCours);
      const active = mesCourses.find((r) => r.statut === "confirmee");
      setCourseActive(active || null);
      setSolde(mSolde);
    } catch (err) {
      onToast(err.message);
    }
  }

  useEffect(() => {
    rafraichir();
    const t = setInterval(rafraichir, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chauffeurId]);

  async function accepter(rideId) {
    try {
      const updated = await api.accepter(rideId, chauffeurId);
      setCourseActive(updated);
      onToast("Course acceptée. Rendez-vous au point de prise en charge.");
      rafraichir();
    } catch (err) {
      onToast(err.message);
    }
  }

  if (inscription) {
    return (
      <DriverRegister
        zones={zones}
        onToast={onToast}
        onAnnuler={() => setInscription(false)}
        onInscrit={(nouveau) => {
          setInscription(false);
          onChauffeurAjoute(nouveau);
          setChauffeurId(nouveau.id);
        }}
      />
    );
  }

  if (!chauffeur) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state__glyph">—</div>
          Aucun chauffeur affilié enregistré.
        </div>
        <button className="btn btn--accent" style={{ marginTop: 12 }} onClick={() => setInscription(true)}>
          Devenir chauffeur affilié
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <p className="card__title" style={{ fontSize: 15 }}>Chauffeur connecté</p>
        <div className="field" style={{ marginBottom: 12 }}>
          <select value={chauffeurId} onChange={(e) => setChauffeurId(e.target.value)}>
            {chauffeurs.map((c) => (
              <option key={c.id} value={c.id}>{c.nom} — {c.zone} ({c.badge})</option>
            ))}
          </select>
        </div>
        <button className="btn btn--outline" style={{ marginBottom: 12 }} onClick={() => setInscription(true)}>
          + Nouveau chauffeur : s'inscrire
        </button>
        <div className="driver-badge">
          <div className="driver-badge__avatar">{chauffeur.nom.split(" ").map((n) => n[0]).join("")}</div>
          <div>
            <div className="driver-badge__name">{chauffeur.nom} · {chauffeur.badge}</div>
            <div className="driver-badge__meta">
              Zone {chauffeur.zone} · Véhicule {chauffeur.vehicule?.immatriculation || "—"} · Kit GPL {chauffeur.vehicule?.kitGpl || "inconnu"}
            </div>
          </div>
        </div>
        {solde && solde.commissionDueEspeces > 0 && (
          <p className="card__hint" style={{ marginTop: 10, marginBottom: 0 }}>
            Solde commission espèces à reverser :{" "}
            <strong style={{ color: "var(--color-danger)" }}>{solde.commissionDueEspeces} FCFA</strong>{" "}
            ({solde.nbCourses} course{solde.nbCourses > 1 ? "s" : ""})
          </p>
        )}
      </div>

      {chauffeur.statut !== "actif" ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="card__title" style={{ fontSize: 15 }}>Inscription en attente de validation</p>
          <p className="card__hint" style={{ marginBottom: 0 }}>
            Statut : <span className="pill">{chauffeur.statut}</span>. L'équipe Sud-Comoé Mobilité doit
            confirmer le diagnostic gaz et la signature du contrat d'affiliation avant que vous puissiez
            accepter des courses.
          </p>
        </div>
      ) : courseActive ? (
        <div style={{ marginTop: 16 }}>
          <p className="section-label">Course en cours</p>
          <div style={{ height: 8 }} />
          <Ticket course={courseActive} />
          <p className="card__hint" style={{ textAlign: "center", marginTop: 12 }}>
            En attente de la confirmation d'arrivée par le client.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <p className="section-label">Demandes disponibles — zone {chauffeur.zone}</p>
          <div style={{ height: 8 }} />
          {demandes.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state__glyph">—</div>
                Aucune demande en attente dans votre zone pour le moment.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {demandes.map((r) => (
                <div key={r.id} className="card">
                  <div className="ticket__route" style={{ marginBottom: 4 }}>
                    <span>{r.zoneDepart}</span>
                    <span className="ticket__route-arrow">→</span>
                    <span>{r.zoneArrivee}</span>
                  </div>
                  <p className="card__hint" style={{ marginBottom: 12 }}>
                    {r.clientNom} · <span className="pill">{r.montant} FCFA</span>
                  </p>
                  <button className="btn btn--primary" onClick={() => accepter(r.id)}>
                    Accepter cette course
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
