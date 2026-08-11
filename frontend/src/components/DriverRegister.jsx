import { useState } from "react";
import { api } from "../api.js";

export default function DriverRegister({ zones, onToast, onInscrit, onAnnuler }) {
  const [form, setForm] = useState({ nom: "", telephone: "", zone: zones[0] || "", immatriculation: "" });
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nom || !form.telephone || !form.immatriculation) {
      onToast("Tous les champs sont requis.");
      return;
    }
    setLoading(true);
    try {
      const chauffeur = await api.inscrireChauffeur(form);
      onToast("Inscription envoyée — en attente de validation par l'équipe.");
      onInscrit(chauffeur);
    } catch (err) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <p className="card__title">Devenir chauffeur affilié</p>
      <p className="card__hint">
        Après inscription, l'équipe Sud-Comoé Mobilité doit valider votre profil avant votre première course.
      </p>

      <div className="field">
        <label htmlFor="nom">Nom complet</label>
        <input id="nom" value={form.nom} onChange={handleChange("nom")} placeholder="Ex. Traoré Ibrahim" />
      </div>

      <div className="field">
        <label htmlFor="telephone">Numéro de téléphone</label>
        <input id="telephone" value={form.telephone} onChange={handleChange("telephone")} placeholder="07 00 00 00 00" />
      </div>

      <div className="field">
        <label htmlFor="zone">Zone de disponibilité</label>
        <select id="zone" value={form.zone} onChange={handleChange("zone")}>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="immatriculation">Immatriculation du véhicule</label>
        <input id="immatriculation" value={form.immatriculation} onChange={handleChange("immatriculation")} placeholder="CI-0000-XX" />
      </div>

      <div style={{ height: 4 }} />
      <button className="btn btn--accent" type="submit" disabled={loading}>
        {loading ? "Envoi…" : "Envoyer ma demande d'affiliation"}
      </button>
      <div style={{ height: 10 }} />
      <button className="btn btn--outline" type="button" onClick={onAnnuler}>
        Retour
      </button>
    </form>
  );
}
