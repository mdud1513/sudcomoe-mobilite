import { useEffect, useState } from "react";
import { api } from "./api.js";
import ClientView from "./components/ClientView.jsx";
import DriverView from "./components/DriverView.jsx";
import AdminView from "./components/AdminView.jsx";

const CLE_SESSION_ADMIN = "scm_admin_session";

function accesAdminAutorise() {
  const parametreUrl = new URLSearchParams(window.location.search).has("admin");
  const sessionExistante = !!localStorage.getItem(CLE_SESSION_ADMIN);
  return parametreUrl || sessionExistante;
}

function roleInitial() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("admin")) return "admin";
  const role = params.get("role");
  if (role === "client" || role === "chauffeur") return role;
  return "client";
}

export default function App() {
  const [peutVoirAdmin] = useState(accesAdminAutorise);
  const [role, setRole] = useState(roleInitial);
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-header__eyebrow">Sud-Comoé · Prototype</p>
        <h1 className="app-header__title">Sud-Comoé Mobilité</h1>
        <p className="app-header__sub">Taxi sécurisé — Yaou, Bassam, Bonoua, Samo</p>

        <div className="role-switch">
          <button className={role === "client" ? "is-active" : ""} onClick={() => setRole("client")}>
            Client
          </button>
          <button className={role === "chauffeur" ? "is-active" : ""} onClick={() => setRole("chauffeur")}>
            Chauffeur
          </button>
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
