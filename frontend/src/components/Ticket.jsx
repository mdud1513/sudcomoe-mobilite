const STATUT_LABELS = {
  demandee: "Recherche d'un chauffeur",
  confirmee: "Chauffeur en route",
  terminee: "Course terminée",
  annulee: "Course annulée",
};

export default function Ticket({ course, children }) {
  const statut = course.statut;
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
        <div className="ticket__meta">
          {course.clientNom}
          {course.nombrePassagers ? ` · ${course.nombrePassagers} passager${course.nombrePassagers > 1 ? "s" : ""}` : ""}
          {course.chauffeur ? ` · Chauffeur : ${course.chauffeur.nom} (${course.chauffeur.badge})` : ""}
        </div>
        {course.position && (
          <a
            href={`https://www.google.com/maps?q=${course.position.lat},${course.position.lng}`}
            target="_blank"
            rel="noreferrer"
            className="pill"
            style={{ display: "inline-block", marginTop: 8, textDecoration: "none" }}
          >
            📍 Voir la position exacte sur la carte
          </a>
        )}
        {children}
      </div>
      <div className="ticket__perforation" />
      <div className="ticket__stub">
        <div>
          <div className="ticket__amount-label">Montant</div>
          <div className="ticket__amount">{course.montant} FCFA</div>
        </div>
        <div className="ticket__code">
          {course.id.replace("ride_", "SCM-").toUpperCase()}
        </div>
      </div>
    </div>
  );
}
