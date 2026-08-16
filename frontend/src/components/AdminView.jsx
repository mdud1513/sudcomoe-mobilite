import { useEffect, useState } from "react";
import { api } from "../api.js";
import AdminLogin from "./AdminLogin.jsx";

const CLE_SESSION = "scm_admin_session";

export default function AdminView({ onToast, zones }) {
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
  const [signalements, setSignalements] = useState([]);
  const [syndicats, setSyndicats] = useState([]);
  const [bilan, setBilan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviter, setInviter] = useState(false);
  const [formInvite, setFormInvite] = useState({ nom: "", telephone: "", motDePasse: "" });
  const [nouveauSyndicat, setNouveauSyndicat] = useState(false);
  const [formSyndicat, setFormSyndicat] = useState({ nom: "", zoneA: "", zoneB: "", tarifJour: "", telephone: "", codePin: "" });

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
    const [resultatChauffeurs, resultatStats, resultatSignalements, resultatSyndicats, resultatBilan] = await Promise.allSettled([
      api.chauffeurs(),
      api.adminStatistiques(session.token),
      api.adminSignalements(session.token),
      api.adminListeSyndicats(session.token),
      api.adminBilanPilote(session.token),
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

    if (resultatSignalements.status === "fulfilled") {
      setSignalements(resultatSignalements.value);
    }

    if (resultatSyndicats.status === "fulfilled") {
      setSyndicats(resultatSyndicats.value);
    }

    if (resultatBilan.status === "fulfilled") {
      setBilan(resultatBilan.value);
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

  async function desactiver(c) {
    const confirmation = window.confirm(`Désactiver ${c.nom} (${c.badge}) ? Il ne pourra plus se connecter ni recevoir de courses, mais son historique reste conservé.`);
    if (!confirmation) return;
    try {
      await api.desactiverChauffeur(c.id, session.token);
      onToast(`${c.nom} a été désactivé.`);
      charger();
    } catch (err) {
      onToast(err.message);
    }
  }

  async function reactiver(c) {
    try {
      await api.reactiverChauffeur(c.id, session.token);
      onToast(`${c.nom} a été réactivé.`);
      charger();
    } catch (err) {
      onToast(err.message);
    }
  }

  async function marquerTraite(id) {
    try {
      await api.traiterSignalement(id, session.token);
      charger();
    } catch (err) {
      onToast(err.message);
    }
  }

  async function creerSyndicat(e) {
    e.preventDefault();
    const { nom, zoneA, zoneB, tarifJour, telephone, codePin } = formSyndicat;
    if (!nom || !zoneA || !zoneB || !tarifJour || !telephone || !/^\d{4}$/.test(codePin)) {
      onToast("Tous les champs sont requis, code à 4 chiffres.");
      return;
    }
    if (zoneA === zoneB) {
      onToast("Les deux zones de l'axe doivent être différentes.");
      return;
    }
    try {
      await api.adminCreerSyndicat({ ...formSyndicat, tarifJour: parseInt(tarifJour, 10) }, session.token);
      onToast(`Syndicat "${nom}" créé — communiquez le ${telephone} et le code ${codePin} à son représentant.`);
      setFormSyndicat({ nom: "", zoneA: "", zoneB: "", tarifJour: "", telephone: "", codePin: "" });
      setNouveauSyndicat(false);
      charger();
    } catch (err) {
      onToast(err.message);
    }
  }

  async function basculerSyndicat(id) {
    try {
      await api.adminBasculerSyndicat(id, session.token);
      charger();
    } catch (err) {
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

  const enAttente = chauffeurs.filter((c) => c.statut === "en attente de validation");
  const actifs = chauffeurs.filter((c) => c.statut === "actif");
  const desactives = chauffeurs.filter((c) => c.statut === "desactive");

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

      {bilan && (
        <>
          <div style={{ height: 20 }} />
          <p className="section-label">Bilan du pilote</p>
          <div style={{ height: 8 }} />
          <div className="card">
            <p className="card__hint" style={{ marginBottom: 12 }}>
              {bilan.totalCourses} demande{bilan.totalCourses > 1 ? "s" : ""} reçue{bilan.totalCourses > 1 ? "s" : ""} au total
              {bilan.coursesEnCours > 0 && ` · ${bilan.coursesEnCours} en cours`}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <div className="card__hint" style={{ marginBottom: 2, fontSize: 11 }}>COURSES TERMINÉES</div>
                <div className="ticket__amount" style={{ fontSize: 22, color: "var(--color-success)" }}>{bilan.coursesTerminees}</div>
              </div>
              <div>
                <div className="card__hint" style={{ marginBottom: 2, fontSize: 11 }}>TAUX D'ACCEPTATION</div>
                <div className="ticket__amount" style={{ fontSize: 22 }}>
                  {bilan.tauxAcceptation === null ? "—" : `${bilan.tauxAcceptation}%`}
                </div>
              </div>
              <div>
                <div className="card__hint" style={{ marginBottom: 2, fontSize: 11 }}>TAUX D'ANNULATION</div>
                <div className="ticket__amount" style={{ fontSize: 22, color: bilan.tauxAnnulation > 20 ? "var(--color-danger)" : "var(--color-ink)" }}>
                  {bilan.tauxAnnulation === null ? "—" : `${bilan.tauxAnnulation}%`}
                </div>
              </div>
              <div>
                <div className="card__hint" style={{ marginBottom: 2, fontSize: 11 }}>MONTANT MOYEN / COURSE</div>
                <div className="ticket__amount" style={{ fontSize: 22 }}>{bilan.montantMoyen} FCFA</div>
              </div>
              <div>
                <div className="card__hint" style={{ marginBottom: 2, fontSize: 11 }}>ATTENTE RÉELLE MOYENNE</div>
                <div className="ticket__amount" style={{ fontSize: 22 }}>
                  {bilan.tempsAttenteReelMoyen === null ? "—" : `${bilan.tempsAttenteReelMoyen} min`}
                </div>
              </div>
              <div>
                <div className="card__hint" style={{ marginBottom: 2, fontSize: 11 }}>ATTENTE ESTIMÉE MOYENNE</div>
                <div className="ticket__amount" style={{ fontSize: 22, color: "var(--color-ink-soft)" }}>
                  {bilan.tempsAttenteEstimeMoyen === null ? "—" : `${bilan.tempsAttenteEstimeMoyen} min`}
                </div>
              </div>
            </div>
            <p className="card__hint" style={{ marginBottom: 0 }}>
              {bilan.signalements.total} signalement{bilan.signalements.total > 1 ? "s" : ""} au total
              {bilan.signalements.nonTraites > 0 && (
                <span style={{ color: "var(--color-danger)" }}> (dont {bilan.signalements.nonTraites} non traité{bilan.signalements.nonTraites > 1 ? "s" : ""})</span>
              )}
            </p>
          </div>
        </>
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

      {signalements.filter((s) => !s.traite).length > 0 && (
        <>
          <div style={{ height: 20 }} />
          <p className="section-label">Signalements non traités ({signalements.filter((s) => !s.traite).length})</p>
          <div style={{ height: 8 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {signalements.filter((s) => !s.traite).map((s) => (
              <div key={s.id} className="card" style={{ padding: 14 }}>
                <p className="card__hint" style={{ marginBottom: 6 }}>
                  <span className="pill" style={{ background: "var(--color-danger-tint)", color: "var(--color-danger)" }}>
                    {s.auteur === "client" ? "Signalé par le client" : s.auteur === "chauffeur" ? "Signalé par le chauffeur" : "⚠ Détection automatique"}
                  </span>
                  {" "}· {s.zoneDepart} → {s.zoneArrivee} · {s.clientNom}
                </p>
                <p style={{ fontSize: 14, marginBottom: 10 }}>{s.message}</p>
                <button className="btn btn--outline" style={{ width: "auto", padding: "8px 14px", fontSize: 12.5 }} onClick={() => marquerTraite(s.id)}>
                  Marquer comme traité
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 20 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className="section-label" style={{ marginBottom: 0 }}>Syndicats partenaires ({syndicats.length})</p>
        <button
          onClick={() => setNouveauSyndicat((v) => !v)}
          style={{ border: "none", background: "transparent", color: "var(--color-primary)", fontSize: 12.5, fontWeight: 600, padding: "6px 8px" }}
        >
          {nouveauSyndicat ? "Annuler" : "+ Nouvel accord"}
        </button>
      </div>
      <div style={{ height: 8 }} />

      {nouveauSyndicat && (
        <form className="card" onSubmit={creerSyndicat} style={{ marginBottom: 12 }}>
          <div className="field">
            <label htmlFor="synd-nom">Nom du syndicat</label>
            <input id="synd-nom" value={formSyndicat.nom} onChange={(e) => setFormSyndicat((f) => ({ ...f, nom: e.target.value }))} placeholder="Ex. Syndicat Yaou-Bassam" />
          </div>
          <div className="route-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="synd-zoneA">Zone A</label>
              <select id="synd-zoneA" value={formSyndicat.zoneA} onChange={(e) => setFormSyndicat((f) => ({ ...f, zoneA: e.target.value }))}>
                <option value="">—</option>
                {(zones || []).map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div className="route-row__arrow">↔</div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="synd-zoneB">Zone B</label>
              <select id="synd-zoneB" value={formSyndicat.zoneB} onChange={(e) => setFormSyndicat((f) => ({ ...f, zoneB: e.target.value }))}>
                <option value="">—</option>
                {(zones || []).map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="synd-tarif">Tarif forfaitaire journalier (FCFA, par chauffeur)</label>
            <input id="synd-tarif" type="number" min="0" value={formSyndicat.tarifJour} onChange={(e) => setFormSyndicat((f) => ({ ...f, tarifJour: e.target.value }))} placeholder="Ex. 1500" />
          </div>
          <div className="field">
            <label htmlFor="synd-tel">Téléphone du représentant (identifiant de connexion)</label>
            <input id="synd-tel" value={formSyndicat.telephone} onChange={(e) => setFormSyndicat((f) => ({ ...f, telephone: e.target.value }))} placeholder="07 00 00 00 00" />
          </div>
          <div className="field">
            <label htmlFor="synd-pin">Code à 4 chiffres (à communiquer au représentant)</label>
            <input id="synd-pin" inputMode="numeric" maxLength={4} value={formSyndicat.codePin} onChange={(e) => setFormSyndicat((f) => ({ ...f, codePin: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="••••" />
          </div>
          <button className="btn btn--primary" type="submit">Créer l'accord</button>
        </form>
      )}

      {syndicats.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__glyph">—</div>
            Aucun accord syndical enregistré.
          </div>
        </div>
      ) : (
        <div className="card">
          {syndicats.map((s) => (
            <div key={s.id} className="driver-badge" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="driver-badge__name">{s.nom}</div>
                <div className="driver-badge__meta">
                  {s.zoneA} ↔ {s.zoneB} · {s.tarifJour} FCFA/jour · {s.telephone}
                </div>
              </div>
              <button
                onClick={() => basculerSyndicat(s.id)}
                style={{ border: "none", background: "transparent", color: s.actif ? "var(--color-danger)" : "var(--color-success)", fontSize: 12, fontWeight: 600, padding: "6px 8px", flexShrink: 0 }}
              >
                {s.actif ? "Désactiver" : "Réactiver"}
              </button>
            </div>
          ))}
        </div>
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
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => desactiver(c)}
                style={{ border: "none", background: "transparent", color: "var(--color-ink-soft)", fontSize: 12, fontWeight: 600, padding: "6px 8px" }}
              >
                Désactiver
              </button>
              <button
                onClick={() => supprimer(c)}
                style={{ border: "none", background: "transparent", color: "var(--color-danger)", fontSize: 12, fontWeight: 600, padding: "6px 8px" }}
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>

      {desactives.length > 0 && (
        <>
          <div style={{ height: 20 }} />
          <p className="section-label">Chauffeurs désactivés ({desactives.length})</p>
          <div style={{ height: 8 }} />
          <div className="card">
            {desactives.map((c) => (
              <div key={c.id} className="driver-badge" style={{ justifyContent: "space-between", opacity: 0.7 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="driver-badge__avatar">{c.nom.split(" ").map((n) => n[0]).join("")}</div>
                  <div>
                    <div className="driver-badge__name">{c.nom} · {c.badge}</div>
                    <div className="driver-badge__meta">{c.telephone} · Zone {c.zone}</div>
                  </div>
                </div>
                <button
                  onClick={() => reactiver(c)}
                  style={{ border: "none", background: "transparent", color: "var(--color-success)", fontSize: 12, fontWeight: 600, padding: "6px 8px", flexShrink: 0 }}
                >
                  Réactiver
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
