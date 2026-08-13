import { useState } from "react";
import { api } from "../api.js";

export default function SyndicatLogin({ onConnecte, onToast }) {
  const [form, setForm] = useState({ telephone: "", codePin: "" });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.telephone || !/^\d{4}$/.test(form.codePin)) {
      onToast("Numéro de téléphone et code à 4 chiffres requis.");
      return;
    }
    setLoading(true);
    try {
      const session = await api.connexionSyndicat(form);
      onConnecte(session);
    } catch (err) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <p className="card__title">Espace syndicat</p>
      <p className="card__hint">
        Accès réservé aux représentants syndicaux partenaires. Vos identifiants vous ont été
        communiqués par l'équipe Scotrans.
      </p>

      <div className="field">
        <label htmlFor="telephone">Numéro de téléphone</label>
        <input
          id="telephone"
          value={form.telephone}
          onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
          placeholder="07 00 00 00 00"
        />
      </div>

      <div className="field">
        <label htmlFor="codePin">Code à 4 chiffres</label>
        <input
          id="codePin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={form.codePin}
          onChange={(e) => setForm((f) => ({ ...f, codePin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
          placeholder="••••"
        />
      </div>

      <div style={{ height: 4 }} />
      <button className="btn btn--primary" type="submit" disabled={loading}>
        {loading ? "…" : "Se connecter"}
      </button>
    </form>
  );
}
