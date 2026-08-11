import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Ticket from "./Ticket.jsx";
import DriverRegister from "./DriverRegister.jsx";
import DriverLogin from "./DriverLogin.jsx";
import { demanderPermissionNotification, notifierNouvelleCourse } from "../alertes.js";

const CLE_SESSION = "scm_chauffeur_session";

export default function DriverView({ zones, onToast }) {
  const [session, setSession] = useState(() => {
    try {
      const brut = localStorage.getItem(CLE_SESSION);
      return brut ? JSON.parse(brut) : null;
    } catch {
      return null;
    }
  });
  const [inscription, setInscription] = useState(false);
  const [chauffeur, setChauffeur] = useState(null);
  const [demandes, setDemandes] = useState([]);
  const [courseActive, setCourseActive] = useState(null);
  const [solde, setSolde] = useState(null);
  const [gains, setGains] = useState(null);
  const [alertesActives, setAlertesActives] = useState(false);
  const alertesActivesRef = useRef(false);
  const idsConnusRef = useRef(new Set());

  useEffect(() => {
    alertesActivesRef.current = alertesActives;
  }, [alertesActives]);

  function connecte(nouvelleSession) {
    localStorage.setItem(CLE_SESSION, JSON.stringify(nouvelleSession));
    setSession(nouvelleSession);
    setInscription(false);
    onToast(`Bienvenue, ${nouvelleSession.nom}.`);
  }

  function deconnecter() {
    localStorage.removeItem(CLE_SESSION);
    setSession(null);
    setChauffeur(null);
  }

  async function activerAlertes() {
    const permission = await demanderPermissionNotification();
    if (permission === "granted") {
      setAlertesActives(true);
      onToast("Alertes activées — vous serez notifié des nouvelles demandes.");
    } else if (permission === "unsupported") {
      setAlertesActives(true);
      onToast("Alerte sonore activée (notifications visuelles non supportées sur cet appareil).");
    } else {
      onToast("Notifications refusées — vous pouvez les activer plus tard dans les réglages du navigateur.");
    }
  }

  async function rafraichir() {
    if (!session) return;
    try {
      const moi = await api.moi(session.token);
      setChauffeur(moi);

      const [enCours, mesCourses, mSolde, mGains] = await Promise.all([
        api.coursesDemandees(),
        api.coursesChauffeur(session.chauffeurId),
        api.solde(session.chauffeurId, session.token),
        api.gains(session.chauffeurId, session.token),
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
      setGains(mGains);
    } catch (err) {
      if (err.message.includes("Connexion chauffeur")) {
        onToast("Session expirée, reconnectez-vous.");
        deconnecter();
        return;
      }
      onToast(err.message);
    }
  }

  useEffect(() => {
    if (!session) return;
    rafraichir();
    const t = setInterval(rafraichir, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  async function accepter(rideId) {
    try {
      const updated = await api.accepter(rideId, session.token);
      setCourseActive(updated);
      onToast("Course acceptée. Rendez-vous au point de prise en charge.");
      rafraichir();
    } catch (err) {
      onToast(err.message);
    }
  }

  if (!session || inscription) {
    if (inscription) {
      return (
        <DriverRegister
          zones={zones}
          onToast={onToast}
          onAnnuler={() => setInscription(false)}
          onInscrit={(nouvelleSession) =>
            connecte({ token: nouvelleSession.token, chauffeurId: nouvelleSession.id, nom: nouvelleSession.nom })
          }
        />
      );
    }
    return (
      <DriverLogin
        onToast={onToast}
        onSinscrire={() => setInscription(true)}
        onConnecte={(s) => connecte({ token: s.token, chauffeurId: s.id, nom: s.nom })}
      />
    );
  }

  if (!chauffeur) {
    return <p className="card__hint">Chargement…</p>;
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <p className="card__title" style={{ fontSize: 15, marginBottom: 12 }}>Mon profil</p>
          <button className="btn btn--outline" style={{ width: "auto", padding: "6px 12px", fontSize: 12.5 }} onClick={deconnecter}>
            Déconnexion
          </button>
        </div>
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

      {gains && gains.nbCourses > 0 && (
        <>
          <div style={{ height: 16 }} />
          <div className="card">
            <p className="card__title" style={{ fontSize: 15 }}>Mes gains</p>
            <p className="card__hint">{gains.nbCourses} course{gains.nbCourses > 1 ? "s" : ""} terminée{gains.nbCourses > 1 ? "s" : ""} au total</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <div className="ticket__amount-label">Ce que j'ai gagné</div>
                <div className="ticket__amount" style={{ fontSize: 24, color: "var(--color-success)" }}>
                  {gains.gainsChauffeur} FCFA
                </div>
              </div>
              <div>
                <div className="ticket__amount-label">Commission Sud-Comoé Mobilité</div>
                <div className="ticket__amount" style={{ fontSize: 24 }}>{gains.commissionPlateforme} FCFA</div>
              </div>
            </div>
            <p className="card__hint" style={{ marginTop: 10, marginBottom: 0, fontSize: 11.5 }}>
              Chiffre d'affaires total généré : {gains.chiffreAffaires} FCFA · commission 12% transparente sur chaque course
            </p>
          </div>
        </>
      )}

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
