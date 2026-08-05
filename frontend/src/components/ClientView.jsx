import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Ticket from "./Ticket.jsx";

export default function ClientView({ zones, onToast }) {
  const [form, setForm] = useState({ clientNom: "", clientTelephone: "", zoneDepart: zones[0] || "", zoneArrivee: zones[1] || zones[0] || "" });
  const [course, setCourse] = useState(null);
  const [modePaiement, setModePaiement] = useState(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (!course || ["terminee", "annulee"].includes(course.statut)) {
      clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await api.course(course.id);
        setCourse(fresh);
      } catch {
        /* ignore transient errors */
      }
    }, 2500);
    return () => clearInterval(pollRef.current);
  }, [course?.id, course?.statut]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.clientNom || !form.clientTelephone) {
      onToast("Indiquez votre nom et votre numéro.");
      return;
    }
    if (form.zoneDepart === form.zoneArrivee) {
      onToast("Course locale enregistrée : départ et arrivée dans la même zone.");
    }
    setLoading(true);
    try {
      const created = await api.creerCourse(form);
      setCourse(created);
    } catch (err) {
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAnnuler() {
    try {
      const updated = await api.annuler(course.id);
      setCourse(updated);
    } catch (err) {
      onToast(err.message);
    }
  }

  async function handleTerminer() {
    if (!modePaiement) {
      onToast("Choisissez un mode de paiement pour terminer la course.");
      return;
    }
    try {
      const updated = await api.terminer(course.id, modePaiement);
      setCourse(updated);
      onToast("Course terminée. Merci d'avoir voyagé avec Sud-Comoé Mobilité.");
    } catch (err) {
      onToast(err.message);
    }
  }

  function nouvelleCourse() {
    setCourse(null);
    setModePaiement(null);
  }

  if (course) {
    return (
      <div>
        <Ticket course={course} />

        {course.statut === "demandee" && (
          <div style={{ marginTop: 16 }}>
            <p className="card__hint" style={{ textAlign: "center" }}>
              Un chauffeur affilié de la zone {course.zoneDepart} va accepter votre demande.
            </p>
            <button className="btn btn--danger-outline" onClick={handleAnnuler}>
              Annuler la demande
            </button>
          </div>
        )}

        {course.statut === "confirmee" && (
          <div className="card" style={{ marginTop: 16 }}>
            <p className="card__title" style={{ fontSize: 15 }}>Confirmer la fin de course</p>
            <p className="card__hint">Choisissez comment vous réglez avant de confirmer, conformément à la charte de service.</p>
            <div className="pay-choice">
              <button
                type="button"
                className={modePaiement === "mobile_money" ? "is-selected" : ""}
                onClick={() => setModePaiement("mobile_money")}
              >
                📱 Mobile Money
              </button>
              <button
                type="button"
                className={modePaiement === "especes" ? "is-selected" : ""}
                onClick={() => setModePaiement("especes")}
              >
                💵 Espèces
              </button>
            </div>
            <button className="btn btn--primary" onClick={handleTerminer}>Confirmer l'arrivée</button>
          </div>
        )}

        {(course.statut === "terminee" || course.statut === "annulee") && (
          <button className="btn btn--outline" style={{ marginTop: 16 }} onClick={nouvelleCourse}>
            Demander une nouvelle course
          </button>
        )}
      </div>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <p className="card__title">Réserver une course</p>
      <p className="card__hint">Chauffeurs affiliés, vérifiés et badgés — Yaou, Bassam, Bonoua, Samo.</p>

      <div className="field">
        <label htmlFor="clientNom">Votre nom</label>
        <input id="clientNom" value={form.clientNom} onChange={handleChange("clientNom")} placeholder="Ex. Marie Koné" />
      </div>

      <div className="field">
        <label htmlFor="clientTelephone">Numéro de téléphone</label>
        <input id="clientTelephone" value={form.clientTelephone} onChange={handleChange("clientTelephone")} placeholder="07 00 00 00 00" />
      </div>

      <div className="route-row">
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="zoneDepart">Départ</label>
          <select id="zoneDepart" value={form.zoneDepart} onChange={handleChange("zoneDepart")}>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="route-row__arrow">→</div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="zoneArrivee">Arrivée</label>
          <select id="zoneArrivee" value={form.zoneArrivee} onChange={handleChange("zoneArrivee")}>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
      </div>

      <div style={{ height: 16 }} />
      <button className="btn btn--accent" type="submit" disabled={loading}>
        {loading ? "Envoi de la demande…" : "Demander une course"}
      </button>
    </form>
  );
}
