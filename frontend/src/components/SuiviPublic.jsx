import { useEffect, useState } from "react";
import { api } from "../api.js";
import { lienAppel, lienWhatsApp } from "../contact.js";

const STATUT_LABELS = {
  demandee: "Recherche d'un chauffeur en cours",
  confirmee: "Chauffeur en route",
  arrivee: "Arrivé à destination",
  terminee: "Course terminée",
  annulee: "Course annulée",
};

export default function SuiviPublic({ rideId }) {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let annule = false;
    async function charger() {
      try {
        const d = await api.suiviPublic(rideId);
        if (!annule) setDonnees(d);
      } catch (err) {
        if (!annule) setErreur(err.message);
      }
    }
    charger();
    const t = setInterval(charger, 5000);
    return () => {
      annule = true;
      clearInterval(t);
    };
  }, [rideId]);

  if (erreur) {
    return (
      <div className="card">
        <p className="card__title" style={{ color: "var(--color-danger)" }}>Trajet introuvable</p>
        <p className="card__hint">Ce lien de suivi n'est plus valide, ou la course a été supprimée.</p>
      </div>
    );
  }

  if (!donnees) {
    return <p className="card__hint">Chargement du suivi…</p>;
  }

  return (
    <div>
      <div className="card">
        <p className="card__title" style={{ fontSize: 15 }}>Suivi de trajet — {donnees.clientNom}</p>
        <div className="ticket__route" style={{ marginBottom: 6 }}>
          <span>{donnees.zoneDepart}</span>
          <span className="ticket__route-arrow">→</span>
          <span>{donnees.zoneArrivee}</span>
        </div>
        <span className="pill">{STATUT_LABELS[donnees.statut] || donnees.statut}</span>
        {donnees.tempsAttenteMinutes != null && donnees.statut === "confirmee" && (
          <p className="card__hint" style={{ marginTop: 8, marginBottom: 0 }}>
            Arrivée estimée dans ≈{donnees.tempsAttenteMinutes} min
          </p>
        )}
      </div>

      {donnees.chauffeur && (
        <>
          <div style={{ height: 14 }} />
          <div className="card">
            <p className="card__title" style={{ fontSize: 14 }}>Chauffeur</p>
            {donnees.chauffeur.photoBase64 && (
              <img
                src={donnees.chauffeur.photoBase64}
                alt=""
                style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", marginBottom: 8 }}
              />
            )}
            <p className="card__hint" style={{ marginBottom: 12 }}>
              {donnees.chauffeur.nom} · {donnees.chauffeur.badge} · Véhicule {donnees.chauffeur.immatriculation}
            </p>
            <div className="btn-row">
              <a href={lienAppel(donnees.chauffeur.telephone)} className="btn btn--primary" style={{ textDecoration: "none", textAlign: "center" }}>
                📞 Appeler
              </a>
              <a
                href={lienWhatsApp(donnees.chauffeur.telephone, `Bonjour, je suis un proche de ${donnees.clientNom}, je suis son trajet.`)}
                target="_blank"
                rel="noreferrer"
                className="btn btn--outline"
                style={{ textDecoration: "none", textAlign: "center" }}
              >
                💬 WhatsApp
              </a>
            </div>
          </div>
        </>
      )}

      {donnees.position && (
        <>
          <div style={{ height: 14 }} />
          <a
            href={`https://www.google.com/maps?q=${donnees.position.lat},${donnees.position.lng}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn--outline"
            style={{ textDecoration: "none", textAlign: "center", display: "block" }}
          >
            📍 Voir le point de départ sur la carte
          </a>
        </>
      )}

      <p className="card__hint" style={{ textAlign: "center", marginTop: 16 }}>
        Page de suivi en lecture seule, mise à jour automatiquement.
      </p>
    </div>
  );
}
