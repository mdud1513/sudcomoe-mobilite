import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function AdminLogin({ onConnecte, onToast }) {
  const [adminExiste, setAdminExiste] = useState(null); // null = chargement
  const [form, setForm] = useState({ nom: "", telephone: "", motDePasse: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.adminExiste().then((r) => setAdminExiste(r.existe)).catch(() => setAdminExiste(true));
  }, []);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const session = adminExiste
        ? await api.adminConnexion({ telephone: form.telephone, motDePasse: form.motDePasse })
        : await api.adminBootstrap(form);
      onConnecte(session);
    } catch (err) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (adminExiste === null) {
    return <p className="card__hint">Chargement…</p>;
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <p className="card__title">{adminExiste ? "Connexion admin" : "Créer le compte administrateur"}</p>
      <p className="card__hint">
        {adminExiste
          ? "Accès réservé à l'équipe Scotrans."
          : "Aucun compte admin n'existe encore — créez le premier ici. Vous pourrez ensuite en inviter d'autres."}
      </p>

      {!adminExiste && (
        <div className="field">
          <label htmlFor="nom">Nom complet</label>
          <input id="nom" value={form.nom} onChange={handleChange("nom")} placeholder="Ex. Ulrich Mandan" />
        </div>
      )}

      <div className="field">
        <label htmlFor="telephone">Numéro de téléphone</label>
        <input id="telephone" value={form.telephone} onChange={handleChange("telephone")} placeholder="07 00 00 00 00" />
      </div>

      <div className="field">
        <label htmlFor="motDePasse">Mot de passe</label>
        <input id="motDePasse" type="password" value={form.motDePasse} onChange={handleChange("motDePasse")} placeholder="6 caractères minimum" />
      </div>

      <div style={{ height: 4 }} />
      <button className="btn btn--primary" type="submit" disabled={loading}>
        {loading ? "…" : adminExiste ? "Se connecter" : "Créer mon compte admin"}
      </button>
    </form>
  );
}
