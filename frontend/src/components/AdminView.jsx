import { useEffect, useState } from "react";
import { api } from "../api.js";
import AdminLogin from "./AdminLogin.jsx";

const CLE_SESSION = "scm_admin_session";

export default function AdminView({ onToast }) {
  const [session, setSession] = useState(() => {
    try {
      const brut = localStorage.getItem(CLE_SESSION);
      return brut ? JSON.parse(brut) : null;
    } catch {
      return null;
    }
  });
  const [chauffeurs, setChauffeurs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviter, setInviter] = useState(false);
  const [formInvite, setFormInvite] = useState({ nom: "", telephone: "", motDePasse: "" });

  function connecte(nouvelleSession) {
    localStorage.setItem(CLE_SESSION, JSON.stringify(nouvelleSession));
    setSession(nouvelleSession);
    onToast(`Bienvenue, ${nouvelleSession.nom}.`);
  }

  function deconnecter() {
    localStorage.removeItem(CLE_SESSION);
    setSession(null);
  }

  async function charger() {
    const [resultatChauffeurs, resultatStats] = await Promise.allSettled([
      api.chauffeurs(),
      api.adminStatistiques(session.token),
    ]);

    if (resultatChauffeurs.status === "fulfilled") {
      setChauffeurs(resultatChauffeurs.value);
    } else {
      onToast(resultatChauffeurs.reason.message);
    }

    if (resultatStats.status === "fulfilled") {
      setStats(resultatStats.value);
    } else if (resultatStats.reason.message.includes("Authentification")) {
      onToast("Session expirée — reconnectez-vous.");
      deconnecter();
      return;
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!session) return;
    charger();
    const t = setInterval(charger, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  async function valider(id) {
    try {
      await api.validerChauffeur(id, session.token);
      onToast("Chauffeur validé et activé.");
      charger();
    } catch (err) {
      if (err.message.includes("Authentification")) {
        onToast("Session expirée, reconnectez-vous.");
        deconnecter();
        return;
      }
      onToast(err.message);
    }
  }

  async function supprimer(c) {
    const confirmation = window.confirm(`Supprimer définitivement ${c.nom} (${c.badge}) ? Cette action est irréversible.`);
    if (!confirmation) return;
    try {
      await api.supprimerChauffeur(c.id, session.token);
      onToast(`${c.nom} a été supprimé.`);
      charger();
    } catch (err) {
      if (err.message.includes("Authentification")) {
        onToast("Session expirée, reconnectez-vous.");
        deconnecter();
        return;
      }
      onToast(err.message);
    }
  }

  async function envoyerInvitation(e) {
    e.preventDefault();
    if (!formInvite.nom || !formInvite.telephone || formInvite.motDePasse.length < 6) {
      onToast("Nom, téléphone et mot de passe (6 caractères min.) sont requis.");
      return;
    }
    try {
      await api.adminInviter(formInvite, session.token);
      onToast(`${formInvite.nom} peut maintenant se connecter en tant qu'admin.`);
      setFormInvite({ nom: "", telephone: "", motDePasse: "" });
      setInviter(false);
    } catch (err) {
      onToast(err.message);
    }
  }

  if (!session) {
    return <AdminLogin onConnecte={connecte} onToast={onToast} />;
  }

  if (loading) return <p className="card__hint">Chargement…</p>;

  const enAttente = chauffeurs.filter((c) => c.statut !== "actif");
  const actifs = chauffeurs.filter((c) => c.statut === "actif");

  return (
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p className="card__title" style={{ fontSize: 15, marginBottom: 0 }}>Connecté : {session.nom}</p>
        </div>
        <button className="btn btn--outline" style={{ width: "auto", padding: "8px 14px" }} onClick={deconnecter}>
          Déconnexion
        </button>
      </div>

      <div style={{ height: 16 }} />

      {inviter ? (
        <form className="card" onSubmit={envoyerInvitation}>
          <p className="card__title" style={{ fontSize: 15 }}>Inviter un autre admin</p>
          <div className="field">
            <label htmlFor="inom">Nom complet</label>
            <input id="inom" value={formInvite.nom} onChange={(e) => setFormInvite((f) => ({ ...f, nom: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="itel">Téléphone</label>
            <input id="itel" value={formInvite.telephone} onChange={(e) => setFormInvite((f) => ({ ...f, telephone: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="imdp">Mot de passe provisoire</label>
            <input id="imdp" type="password" value={formInvite.motDePasse} onChange={(e) => setFormInvite((f) => ({ ...f, motDePasse: e.target.value }))} />
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--outline" onClick={() => setInviter(false)}>Annuler</button>
            <button type="submit" className="btn btn--primary">Inviter</button>
          </div>
        </form>
      ) : (
        <button className="btn btn--outline" onClick={() => setInviter(true)}>
          + Inviter un autre admin
        </button>
      )}

      {stats && (
        <>
          <div style={{ height: 20 }} />
          <p className="section-label">Vue d'ensemble</p>
          <div style={{ height: 8 }} />
          <div className="card">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <div className="ticket__amount-label">Commission totale perçue</div>
                <div className="ticket__amount" style={{ fontSize: 26 }}>{stats.global.commissionTotale} FCFA</div>
              </div>
              <div>
                <div className="ticket__amount-label">Chiffre d'affaires total</div>
                <div className="ticket__amount" style={{ fontSize: 26 }}>{stats.global.chiffreAffairesTotal} FCFA</div>
              </div>
            </div>
            <div style={{ height: 14 }} />
            <p className="card__hint" style={{ marginBottom: 0 }}>
              <span className="pill">{stats.global.nbCoursesTerminees} terminées</span>{" "}
              <span className="pill">{stats.global.nbCoursesEnCours} en cours</span>{" "}
              <span className="pill">{stats.global.nbCoursesAnnulees} annulées</span>{" "}
              · {stats.global.nbCoursesTotal} demandes au total depuis le lancement
            </p>
          </div>

          <div style={{ height: 16 }} />
          <p className="section-label">Courses et commissions par chauffeur</p>
          <div style={{ height: 8 }} />
          {stats.parChauffeur.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state__glyph">—</div>
                Aucune course terminée pour le moment.
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {stats.parChauffeur.map((c, i) => (
                <div
                  key={c.chauffeurId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "14px 20px",
                    borderTop: i > 0 ? "1px solid var(--color-line)" : "none",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.nom} · {c.badge}</div>
                    <div className="card__hint" style={{ marginBottom: 0 }}>
                      Zone {c.zone} · {c.nbCourses} course{c.nbCourses > 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 18 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 15, color: "var(--color-success)" }}>
                        {c.partChauffeur} FCFA
                      </div>
                      <div className="card__hint" style={{ marginBottom: 0, fontSize: 11 }}>chauffeur</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 15 }}>
                        {c.commission} FCFA
                      </div>
                      <div className="card__hint" style={{ marginBottom: 0, fontSize: 11 }}>commission</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ height: 20 }} />
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
              <div className="btn-row">
                <button className="btn btn--danger-outline" onClick={() => supprimer(c)}>
                  Supprimer
                </button>
                <button className="btn btn--primary" onClick={() => valider(c.id)}>
                  Valider et activer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 20 }} />
      <p className="section-label">Chauffeurs actifs ({actifs.length})</p>
      <div style={{ height: 8 }} />
      <div className="card">
        {actifs.map((c) => (
          <div key={c.id} className="driver-badge" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="driver-badge__avatar">{c.nom.split(" ").map((n) => n[0]).join("")}</div>
              <div>
                <div className="driver-badge__name">{c.nom} · {c.badge}</div>
                <div className="driver-badge__meta">{c.telephone} · Zone {c.zone}</div>
              </div>
            </div>
            <button
              onClick={() => supprimer(c)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--color-danger)",
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 8px",
                flexShrink: 0,
              }}
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
