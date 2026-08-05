import { useEffect, useState } from "react";
import { api } from "./api.js";
import ClientView from "./components/ClientView.jsx";
import DriverView from "./components/DriverView.jsx";

export default function App() {
  const [role, setRole] = useState("client");
  const [zones, setZones] = useState([]);
  const [chauffeurs, setChauffeurs] = useState([]);
  const [toast, setToast] = useState(null);
  const [erreurApi, setErreurApi] = useState(false);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => {
    Promise.all([api.zones(), api.chauffeurs()])
      .then(([z, c]) => {
        setZones(z);
        setChauffeurs(c);
      })
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
            Je suis client
          </button>
          <button className={role === "chauffeur" ? "is-active" : ""} onClick={() => setRole("chauffeur")}>
            Je suis chauffeur
          </button>
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
            <ClientView zones={zones} onToast={showToast} />
          ) : (
            <DriverView chauffeurs={chauffeurs} onToast={showToast} />
          )
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
