import { useState } from "react";
import { api } from "../api.js";

export default function ClientAuth({ onToast, onConnecte, onFermer }) {
  const [mode, setMode] = useState("connexion"); // connexion | inscription
  const [form, setForm] = useState({ nom: "", telephone: "", codePin: "" });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.telephone || !/^\d{4}$/.test(form.codePin)) {
      onToast("Numéro et code à 4 chiffres requis.");
      return;
    }
    if (mode === "inscription" && !form.nom) {
      onToast("Indiquez votre nom pour créer le compte.");
      return;
    }
    setLoading(true);
    try {
      const session =
        mode === "connexion" ? await api.connexionClient(form) : await api.inscriptionClient(form);
      onConnecte(session);
    } catch (err) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <p className="card__title">{mode === "connexion" ? "Se connecter" : "Créer mon espace client"}</p>
      <p className="card__hint">
        {mode === "connexion"
          ? "Retrouvez votre historique et vos adresses favorites."
          : "Un compte facultatif pour ne plus retaper vos informations à chaque course."}
      </p>

      {mode === "inscription" && (
        <div className="field">
          <label htmlFor="nom">Votre nom</label>
          <input id="nom" value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} placeholder="Ex. Marie Koné" />
        </div>
      )}

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
        {loading ? "…" : mode === "connexion" ? "Se connecter" : "Créer mon compte"}
      </button>
      <div style={{ height: 10 }} />
      <button
        className="btn btn--outline"
        type="button"
        onClick={() => setMode(mode === "connexion" ? "inscription" : "connexion")}
      >
        {mode === "connexion" ? "Pas encore de compte ? En créer un" : "Déjà un compte ? Se connecter"}
      </button>
      {onFermer && (
        <>
          <div style={{ height: 10 }} />
          <button className="btn btn--outline" type="button" onClick={onFermer} style={{ borderStyle: "dashed" }}>
            Continuer sans compte
          </button>
        </>
      )}
    </form>
  );
}
