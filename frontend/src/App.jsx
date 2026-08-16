import { useEffect, useState } from "react";
import { api } from "./api.js";
import ClientView from "./components/ClientView.jsx";
import DriverView from "./components/DriverView.jsx";
import AdminView from "./components/AdminView.jsx";
import SyndicatView from "./components/SyndicatView.jsx";
import SuiviPublic from "./components/SuiviPublic.jsx";
import { surInstallabiliteDisponible, declencherInstallation, dejaInstallee, estIOS } from "./installation.js";
import { lienSupportWhatsApp } from "./contact.js";

const CLE_SESSION_ADMIN = "scm_admin_session";
const CLE_SESSION_CLIENT = "scm_client_session";
const CLE_SESSION_CHAUFFEUR = "scm_chauffeur_session";

function accesAdminAutorise() {
  const parametreUrl = new URLSearchParams(window.location.search).has("admin");
  const sessionExistante = !!localStorage.getItem(CLE_SESSION_ADMIN);
  return parametreUrl || sessionExistante;
}

// Détermine par quel lien la personne est entrée — c'est ce lien qui décide ce qu'elle voit,
// pas ses éventuelles sessions déjà enregistrées sur cet appareil (une même personne peut avoir
// installé l'icône Client et l'icône Chauffeur : chacune doit rester strictement cloisonnée).
function roleDepuisLien() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("admin")) return "admin";
  const role = params.get("role");
  if (role === "chauffeur" || role === "syndicat") return role;
  return "client";
}

// Lien ouvert sans indication de rôle, mais avec les deux profils déjà enregistrés sur cet appareil :
// mieux vaut demander explicitement que de choisir "Client" par défaut sans le dire.
function choixProfilRequis() {
  const params = new URLSearchParams(window.location.search);
  const lienExplicite = params.has("admin") || params.has("role");
  if (lienExplicite) return false;
  const aClient = !!localStorage.getItem(CLE_SESSION_CLIENT);
  const aChauffeur = !!localStorage.getItem(CLE_SESSION_CHAUFFEUR);
  const estAdmin = !!localStorage.getItem(CLE_SESSION_ADMIN);
  return aClient && aChauffeur && !estAdmin;
}

function ChoixProfil() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-header__eyebrow">Sud-Comoé · Prototype</p>
        <h1 className="app-header__title">Scotrans</h1>
        <p className="app-header__sub">Vous avez un profil client et un profil chauffeur sur cet appareil</p>
      </header>
      <main className="app-body">
        <div className="card">
          <p className="card__title">Vous vous connectez en tant que...</p>
          <p className="card__hint">Ce choix détermine l'écran que vous verrez à chaque prochaine ouverture depuis cet appareil.</p>
          <button className="btn btn--accent" onClick={() => (window.location.href = "/?role=client")}>
            Je suis client
          </button>
          <div style={{ height: 12 }} />
          <button className="btn btn--primary" onClick={() => (window.location.href = "/?role=chauffeur")}>
            Je suis chauffeur
          </button>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [peutVoirAdmin] = useState(accesAdminAutorise);
  const [roleLien] = useState(roleDepuisLien);
  const [role, setRole] = useState(() => (peutVoirAdmin && roleLien === "admin" ? "admin" : roleLien));
  const [zones, setZones] = useState([]);
  const [toast, setToast] = useState(null);
  const [erreurApi, setErreurApi] = useState(false);
  const [peutInstaller, setPeutInstaller] = useState(false);
  const [bannièreFermee, setBannièreFermee] = useState(() => sessionStorage.getItem("scm_banniere_install_fermee") === "1");

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => {
    api
      .zones()
      .then(setZones)
      .catch(() => setErreurApi(true));
  }, []);

  useEffect(() => {
    surInstallabiliteDisponible(() => setPeutInstaller(true));
  }, []);

  function fermerBanniere() {
    sessionStorage.setItem("scm_banniere_install_fermee", "1");
    setBannièreFermee(true);
  }

  async function installer() {
    const resultat = await declencherInstallation();
    if (resultat.ok) {
      showToast("Application installée ✅");
      fermerBanniere();
    } else if (resultat.raison === "dismissed") {
      fermerBanniere();
    }
  }

  const afficherBanniereInstall =
    !bannièreFermee && !dejaInstallee() && (peutInstaller || estIOS());

  const rideIdSuivi = new URLSearchParams(window.location.search).get("suivi");
  if (rideIdSuivi) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <p className="app-header__eyebrow">Sud-Comoé · Prototype</p>
          <h1 className="app-header__title">Scotrans</h1>
          <p className="app-header__sub">Suivi de trajet partagé</p>
        </header>
        <main className="app-body">
          <SuiviPublic rideId={rideIdSuivi} />
        </main>
      </div>
    );
  }

  if (choixProfilRequis()) {
    return <ChoixProfil />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-header__eyebrow">Sud-Comoé · Prototype</p>
        <h1 className="app-header__title">Scotrans</h1>
        <p className="app-header__sub">Taxi sécurisé — Yaou, Bassam, Bonoua, Samo</p>

        <div className="role-switch">
          {(peutVoirAdmin || roleLien === "client") && (
            <button className={role === "client" ? "is-active" : ""} onClick={() => setRole("client")}>
              Client
            </button>
          )}
          {(peutVoirAdmin || roleLien === "chauffeur") && (
            <button className={role === "chauffeur" ? "is-active" : ""} onClick={() => setRole("chauffeur")}>
              Chauffeur
            </button>
          )}
          {peutVoirAdmin && (
            <button className={role === "admin" ? "is-active" : ""} onClick={() => setRole("admin")}>
              Admin
            </button>
          )}
          {(peutVoirAdmin || roleLien === "syndicat") && (
            <button className={role === "syndicat" ? "is-active" : ""} onClick={() => setRole("syndicat")}>
              Syndicat
            </button>
          )}
        </div>
      </header>

      {afficherBanniereInstall && (
        <div style={{ background: "var(--color-primary-tint)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--color-line)" }}>
          <span style={{ fontSize: 20 }}>📲</span>
          <div style={{ flex: 1, fontSize: 12.5, color: "var(--color-ink)" }}>
            {estIOS() ? (
              <>Ajoutez Scotrans à l'écran d'accueil : appuyez sur <strong>Partager</strong> puis <strong>« Sur l'écran d'accueil »</strong>.</>
            ) : (
              "Installez Scotrans comme une application, en un tap."
            )}
          </div>
          {!estIOS() && (
            <button className="btn btn--primary" style={{ width: "auto", padding: "8px 14px", fontSize: 12.5, flexShrink: 0 }} onClick={installer}>
              Installer
            </button>
          )}
          <button
            onClick={fermerBanniere}
            aria-label="Fermer"
            style={{ border: "none", background: "transparent", color: "var(--color-ink-soft)", fontSize: 18, padding: "0 4px", flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      )}

      <main className="app-body">
        {erreurApi && (
          <div className="card">
            <p className="card__title" style={{ color: "var(--color-danger)" }}>API indisponible</p>
            <p className="card__hint">
              Le backend ne répond pas sur {import.meta.env.VITE_API_URL || "http://localhost:8787"}.
              Lancez-le avec <code>npm run dev</code> dans le dossier <code>backend/</code>.
            </p>
          </div>
        )}

        {!erreurApi && zones.length > 0 && (
          role === "client" ? (
            <ClientView zones={zones} onToast={showToast} courseIdDepuisNotification={new URLSearchParams(window.location.search).get("course")} />
          ) : role === "chauffeur" ? (
            <DriverView zones={zones} onToast={showToast} />
          ) : role === "syndicat" ? (
            <SyndicatView onToast={showToast} />
          ) : (
            <AdminView onToast={showToast} zones={zones} />
          )
        )}
      </main>

      {(role === "client" || role === "chauffeur") && (
        <a
          href={lienSupportWhatsApp()}
          target="_blank"
          rel="noreferrer"
          style={{
            position: "sticky",
            bottom: 16,
            marginLeft: "auto",
            marginRight: 16,
            marginTop: 16,
            width: "fit-content",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#25D366",
            color: "white",
            textDecoration: "none",
            padding: "10px 16px",
            borderRadius: 999,
            fontWeight: 600,
            fontSize: 13,
            boxShadow: "0 6px 18px -6px rgba(0,0,0,0.35)",
          }}
        >
          💬 Besoin d'aide ?
        </a>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
