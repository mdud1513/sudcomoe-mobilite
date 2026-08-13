import { useEffect, useState } from "react";
import { api } from "../api.js";
import SyndicatLogin from "./SyndicatLogin.jsx";

const CLE_SESSION = "scm_syndicat_session";

export default function SyndicatView({ onToast }) {
  const [session, setSession] = useState(() => {
    try {
      const brut = localStorage.getItem(CLE_SESSION);
      return brut ? JSON.parse(brut) : null;
    } catch {
      return null;
    }
  });
  const [donnees, setDonnees] = useState(null);
  const [loading, setLoading] = useState(true);

  function connecte(nouvelleSession) {
    localStorage.setItem(CLE_SESSION, JSON.stringify(nouvelleSession));
    setSession(nouvelleSession);
    onToast(`Bienvenue, ${nouvelleSession.nom}.`);
  }

  function deconnecter() {
    localStorage.removeItem(CLE_SESSION);
    setSession(null);
    setDonnees(null);
  }

  async function charger() {
    if (!session) return;
    try {
      const d = await api.syndicatCotisations(session.token);
      setDonnees(d);
    } catch (err) {
      if (err.message.includes("Connexion syndicat")) {
        onToast("Session expirée, reconnectez-vous.");
        deconnecter();
        return;
      }
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    charger();
    const t = setInterval(charger, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  async function marquerPaye(cotisationId) {
    try {
      await api.syndicatMarquerPaye(cotisationId, session.token);
      onToast("Cotisation marquée payée.");
      charger();
    } catch (err) {
      onToast(err.message);
    }
  }

  if (!session) {
    return <SyndicatLogin onToast={onToast} onConnecte={connecte} />;
  }

  if (loading || !donnees) {
    return <p className="card__hint">Chargement…</p>;
  }

  const enAttente = donnees.cotisations.filter((c) => !c.paye);
  const payees = donnees.cotisations.filter((c) => c.paye);

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p className="card__title" style={{ marginBottom: 4, fontSize: 16 }}>{donnees.syndicat.nom}</p>
            <p className="card__hint" style={{ marginBottom: 0 }}>
              Axe {donnees.syndicat.zoneA} ↔ {donnees.syndicat.zoneB} · {donnees.syndicat.tarifJour} FCFA/jour/chauffeur
            </p>
          </div>
          <button className="btn btn--outline" style={{ width: "auto", padding: "6px 12px", fontSize: 12.5 }} onClick={deconnecter}>
            Déconnexion
          </button>
        </div>
      </div>

      <div style={{ height: 16 }} />

      <div className="card">
        <p className="card__title" style={{ fontSize: 15 }}>Aujourd'hui — {donnees.jour}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div className="ticket__amount-label">Attendu</div>
            <div className="ticket__amount" style={{ fontSize: 22 }}>{donnees.totalAttendu} FCFA</div>
          </div>
          <div>
            <div className="ticket__amount-label">Collecté</div>
            <div className="ticket__amount" style={{ fontSize: 22, color: "var(--color-success)" }}>
              {donnees.totalCollecte} FCFA
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 20 }} />
      <p className="section-label">En attente de paiement ({enAttente.length})</p>
      <div style={{ height: 8 }} />

      {enAttente.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__glyph">—</div>
            Aucune cotisation en attente pour aujourd'hui.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {enAttente.map((c) => (
            <div key={c.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.chauffeurNom} · {c.chauffeurBadge}</div>
                  <div className="card__hint" style={{ marginBottom: 0 }}>{c.chauffeurTelephone}</div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{c.montant} FCFA</div>
              </div>
              <button className="btn btn--primary" style={{ marginTop: 10 }} onClick={() => marquerPaye(c.id)}>
                Marquer payé
              </button>
            </div>
          ))}
        </div>
      )}

      {payees.length > 0 && (
        <>
          <div style={{ height: 20 }} />
          <p className="section-label">Déjà payées ({payees.length})</p>
          <div style={{ height: 8 }} />
          <div className="card">
            {payees.map((c) => (
              <div key={c.id} className="driver-badge" style={{ justifyContent: "space-between" }}>
                <div>
                  <div className="driver-badge__name">{c.chauffeurNom} · {c.chauffeurBadge}</div>
                  <div className="driver-badge__meta">{c.montant} FCFA</div>
                </div>
                <span className="pill">✓ payé</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
