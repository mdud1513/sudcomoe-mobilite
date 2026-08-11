import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Ticket from "./Ticket.jsx";
import DriverRegister from "./DriverRegister.jsx";
import { demanderPermissionNotification, notifierNouvelleCourse } from "../alertes.js";

export default function DriverView({ chauffeurs, zones, onToast, onChauffeurAjoute }) {
  const [inscription, setInscription] = useState(false);
  const [chauffeurId, setChauffeurId] = useState(chauffeurs[0]?.id || "");
  const [demandes, setDemandes] = useState([]);
  const [courseActive, setCourseActive] = useState(null);
  const [solde, setSolde] = useState(null);
  const [alertesActives, setAlertesActives] = useState(false);
  const alertesActivesRef = useRef(false);
  const idsConnusRef = useRef(new Set());

  useEffect(() => {
    alertesActivesRef.current = alertesActives;
  }, [alertesActives]);

  const chauffeur = chauffeurs.find((c) => c.id === chauffeurId);

  async function activerAlertes() {
    const permission = await demanderPermissionNotification();
    if (permission === "granted") {
      setAlertesActives(true);
      onToast("Alertes activées — vous serez notifié des nouvelles demandes.");
    } else if (permission === "unsupported") {
      setAlertesActives(true); // le son fonctionne quand même sans l'API Notification
      onToast("Alerte sonore activée (notifications visuelles non supportées sur cet appareil).");
    } else {
      onToast("Notifications refusées — vous pouvez les activer plus tard dans les réglages du navigateur.");
    }
  }

  async function rafraichir() {
    if (!chauffeurId) return;
    try {
      const [enCours, mesCourses, mSolde] = await Promise.all([
        api.coursesDemandees(), // toutes zones confondues : le chauffeur choisit librement
        api.coursesChauffeur(chauffeurId),
        api.solde(chauffeurId),
      ]);

      if (alertesActivesRef.current) {
        const nouvelles = enCours.filter((r) => !idsConnusRef.current.has(r.id));
        if (idsConnusRef.current.size > 0) {
          nouvelles.forEach((r) => notifierNouvelleCourse(r));
        }
      }
      idsConnusRef.current = new Set(enCours.map((r) => r.id));

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

      {!alertesActives && (
        <>
          <div style={{ height: 12 }} />
          <button className="btn btn--outline" onClick={activerAlertes}>
            🔔 Activer les alertes de nouvelle demande
          </button>
        </>
      )}

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
          <p className="section-label">Demandes disponibles — toutes zones</p>
          <div style={{ height: 8 }} />
          {demandes.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state__glyph">—</div>
                Aucune demande en attente pour le moment.
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
                    {r.position && (
                      <>
                        {" · "}
                        <a
                          href={`https://www.google.com/maps?q=${r.position.lat},${r.position.lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📍 Voir sur la carte
                        </a>
                      </>
                    )}
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
