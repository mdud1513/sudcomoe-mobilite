import { useState } from "react";
import { api } from "../api.js";

export default function DriverLogin({ onConnecte, onToast, onSinscrire }) {
  const [etape, setEtape] = useState("connexion");
  const [form, setForm] = useState({ telephone: "", codePin: "" });
  const [otp, setOtp] = useState("");
  const [nouveauPin, setNouveauPin] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.telephone || !/^\d{4}$/.test(form.codePin)) {
      onToast("Numéro de téléphone et code à 4 chiffres requis.");
      return;
    }
    setLoading(true);
    try {
      const session = await api.connexionChauffeur(form);
      onConnecte(session);
    } catch (err) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDemanderOtp(e) {
    e.preventDefault();
    if (!form.telephone) {
      onToast("Indiquez votre numéro de téléphone.");
      return;
    }
    setLoading(true);
    try {
      await api.demanderOtpChauffeur(form.telephone);
      onToast("Si ce numéro est enregistré, un code vient de vous être envoyé par SMS.");
      setEtape("verification-otp");
    } catch (err) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReinitialiser(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp) || !/^\d{4}$/.test(nouveauPin)) {
      onToast("Code reçu par SMS (6 chiffres) et nouveau code (4 chiffres) requis.");
      return;
    }
    setLoading(true);
    try {
      await api.reinitialiserAvecOtpChauffeur({ telephone: form.telephone, otp, nouveauPin });
      onToast("Code mis à jour — connectez-vous avec votre nouveau code.");
      setForm((f) => ({ ...f, codePin: "" }));
      setOtp("");
      setNouveauPin("");
      setEtape("connexion");
    } catch (err) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (etape === "demande-otp") {
    return (
      <form className="card" onSubmit={handleDemanderOtp}>
        <p className="card__title">Code oublié</p>
        <p className="card__hint">Un code de vérification vous sera envoyé par SMS.</p>

        <div className="field">
          <label htmlFor="telephone-otp">Numéro de téléphone</label>
          <input
            id="telephone-otp"
            value={form.telephone}
            onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
            placeholder="07 00 00 00 00"
          />
        </div>

        <div style={{ height: 4 }} />
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? "…" : "Recevoir le code par SMS"}
        </button>
        <div style={{ height: 10 }} />
        <button className="btn btn--outline" type="button" onClick={() => setEtape("connexion")}>
          Retour à la connexion
        </button>
      </form>
    );
  }

  if (etape === "verification-otp") {
    return (
      <form className="card" onSubmit={handleReinitialiser}>
        <p className="card__title">Entrez le code reçu</p>
        <p className="card__hint">Envoyé par SMS au {form.telephone} — valable 10 minutes.</p>

        <div className="field">
          <label htmlFor="otp">Code reçu par SMS (6 chiffres)</label>
          <input
            id="otp"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
          />
        </div>

        <div className="field">
          <label htmlFor="nouveauPin">Nouveau code à 4 chiffres</label>
          <input
            id="nouveauPin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={nouveauPin}
            onChange={(e) => setNouveauPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
          />
        </div>

        <div style={{ height: 4 }} />
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? "…" : "Valider le nouveau code"}
        </button>
        <div style={{ height: 10 }} />
        <button className="btn btn--outline" type="button" onClick={() => setEtape("demande-otp")}>
          Je n'ai pas reçu le code — renvoyer
        </button>
      </form>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <p className="card__title">Connexion chauffeur</p>
      <p className="card__hint">Accès réservé aux chauffeurs affiliés inscrits.</p>

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

      <button
        type="button"
        onClick={() => setEtape("demande-otp")}
        style={{ border: "none", background: "transparent", color: "var(--color-primary)", fontSize: 12.5, fontWeight: 600, padding: "0 0 14px", cursor: "pointer" }}
      >
        Code oublié ?
      </button>

      <button className="btn btn--primary" type="submit" disabled={loading}>
        {loading ? "…" : "Se connecter"}
      </button>
      <div style={{ height: 10 }} />
      <button className="btn btn--outline" type="button" onClick={onSinscrire}>
        Pas encore inscrit ? Devenir chauffeur affilié
      </button>
    </form>
  );
}
