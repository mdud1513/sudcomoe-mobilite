import { lienAppel, lienWhatsApp } from "../contact.js";
import { api } from "../api.js";

const STATUT_LABELS = {
  demandee: "Recherche d'un chauffeur",
  confirmee: "Chauffeur en route",
  terminee: "Course terminée",
  annulee: "Course annulée",
};

export default function Ticket({ course, children, contact, role, onToast }) {
  const statut = course.statut;

  async function signaler() {
    const message = window.prompt("Décrivez le problème rencontré avec cette course :", "");
    if (!message || !message.trim()) return;
    try {
      await api.signaler(course.id, role || "client", message);
      onToast?.("Signalement envoyé — l'équipe va le consulter.");
    } catch (err) {
      onToast?.(err.message);
    }
  }

  return (
    <div className="ticket">
      <div className="ticket__main">
        <span className={`ticket__status ticket__status--${statut}`}>
          {STATUT_LABELS[statut] || statut}
        </span>
        <div className="ticket__route">
          <span>{course.zoneDepart}</span>
          <span className="ticket__route-arrow">→</span>
          <span>{course.zoneArrivee}</span>
        </div>
        {course.statut === "confirmee" && course.tempsAttenteMinutes != null && (
          <div style={{ marginTop: 6, marginBottom: 2, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="pill" style={{ background: "var(--color-accent)", color: "#4A3410" }}>
              ⏱ Arrivée estimée dans ~{course.tempsAttenteMinutes} min
            </span>
            {course.heureArriveeEstimee && (
              <span style={{ fontSize: 12, color: "var(--color-ink-soft)" }}>
                vers{" "}
                {new Date(course.heureArriveeEstimee).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}
        <div className="ticket__meta">
          {course.clientNom}
          {course.nombrePassagers ? ` · ${course.nombrePassagers} passager${course.nombrePassagers > 1 ? "s" : ""}` : ""}
          {typeof course.distanceKm === "number" ? ` · ≈ ${course.distanceKm} km` : ""}
          {course.chauffeur ? ` · Chauffeur : ${course.chauffeur.nom} (${course.chauffeur.badge})` : ""}
        </div>
        {course.adresseArrivee && (
          <div className="ticket__meta" style={{ marginTop: 2 }}>
            🏁 {course.adresseArrivee}
          </div>
        )}
        {course.position && (
          <a
            href={`https://www.google.com/maps?q=${course.position.lat},${course.position.lng}`}
            target="_blank"
            rel="noreferrer"
            className="pill"
            style={{ display: "inline-block", marginTop: 8, marginRight: 6, textDecoration: "none" }}
          >
            📍 Position du client
          </a>
        )}
        {course.arrets && course.arrets.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="ticket__amount-label" style={{ marginBottom: 4 }}>
              Autres passagers à récupérer
            </div>
            {course.arrets.map((a, i) => (
              <div key={i} style={{ fontSize: 13, marginBottom: 3 }}>
                {a.nom || `Passager ${i + 2}`} — {a.zone}
                {a.lieu && <span style={{ color: "var(--color-ink-soft)" }}> ({a.lieu})</span>}
                {a.surLeChemin ? (
                  <span style={{ color: "var(--color-success)" }}> · sur le chemin</span>
                ) : typeof a.distanceKm === "number" ? (
                  ` (+${a.distanceKm} km de détour)`
                ) : (
                  ""
                )}
                {a.position && (
                  <>
                    {" "}
                    <a
                      href={`https://www.google.com/maps?q=${a.position.lat},${a.position.lng}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      📍 voir
                    </a>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        {children}

        {contact && ["confirmee", "terminee"].includes(statut) && (
          <div className="btn-row" style={{ marginTop: 12 }}>
            <a href={lienAppel(contact.telephone)} className="btn btn--primary" style={{ textDecoration: "none", textAlign: "center" }}>
              📞 Appeler {contact.nom?.split(" ")[0] || ""}
            </a>
            <a
              href={lienWhatsApp(contact.telephone, `Bonjour, au sujet de la course ${course.id.replace("ride_", "SCM-").toUpperCase()}`)}
              target="_blank"
              rel="noreferrer"
              className="btn btn--outline"
              style={{ textDecoration: "none", textAlign: "center" }}
            >
              💬 WhatsApp
            </a>
          </div>
        )}

        {["confirmee", "terminee"].includes(statut) && (
          <button
            type="button"
            onClick={signaler}
            style={{ border: "none", background: "transparent", color: "var(--color-danger)", fontSize: 12.5, fontWeight: 600, padding: "10px 0 0", cursor: "pointer" }}
          >
            ⚠ Signaler un problème avec cette course
          </button>
        )}
      </div>
      <div className="ticket__perforation" />
      <div className="ticket__stub">
        <div>
          <div className="ticket__amount-label">Montant</div>
          <div className="ticket__amount">{course.montant} FCFA</div>
          {course.supplementArrets > 0 && (
            <div style={{ fontSize: 11, color: "var(--color-ink-soft)", marginTop: 2 }}>
              dont {course.supplementArrets} FCFA de détour ({course.arrets?.filter((a) => !a.surLeChemin).length} arrêt{course.arrets?.filter((a) => !a.surLeChemin).length > 1 ? "s" : ""} hors chemin)
            </div>
          )}
        </div>
        <div className="ticket__code">
          {course.id.replace("ride_", "SCM-").toUpperCase()}
        </div>
      </div>
    </div>
  );
}
