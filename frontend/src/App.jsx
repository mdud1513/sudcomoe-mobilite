import { useEffect, useState } from "react";
import { api } from "./api.js";
import ClientView from "./components/ClientView.jsx";
import DriverView from "./components/DriverView.jsx";
import AdminView from "./components/AdminView.jsx";

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
  return params.get("role") === "chauffeur" ? "chauffeur" : "client";
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
        </div>
      </header>

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
          ) : (
            <AdminView onToast={showToast} />
          )
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
