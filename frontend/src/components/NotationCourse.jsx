import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function NotationCourse({ rideId, auteur, token, cible, onToast }) {
  const [notesExistantes, setNotesExistantes] = useState(null);
  const [note, setNote] = useState(0);
  const [survol, setSurvol] = useState(0);
  const [commentaire, setCommentaire] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  useEffect(() => {
    let annule = false;
    api
      .notesDeLaCourse(rideId)
      .then((notes) => {
        if (!annule) setNotesExistantes(notes);
      })
      .catch(() => {
        if (!annule) setNotesExistantes([]);
      });
    return () => {
      annule = true;
    };
  }, [rideId]);

  async function envoyer() {
    if (note < 1) {
      onToast("Choisissez une note avant d'envoyer.");
      return;
    }
    setEnvoi(true);
    try {
      await api.noter(rideId, auteur, note, commentaire, token);
      setEnvoye(true);
      onToast("Merci pour votre note !");
    } catch (err) {
      onToast(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  if (notesExistantes === null) return null;

  const dejaNote = envoye || notesExistantes.some((n) => n.auteur === auteur);
  if (dejaNote) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <p className="card__title" style={{ fontSize: 15 }}>Comment s'est passée la course{cible ? ` avec ${cible}` : ""} ?</p>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, justifyContent: "center" }}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setNote(v)}
            onMouseEnter={() => setSurvol(v)}
            onMouseLeave={() => setSurvol(0)}
            style={{ border: "none", background: "transparent", fontSize: 30, cursor: "pointer", padding: 2, lineHeight: 1 }}
            aria-label={`${v} étoile${v > 1 ? "s" : ""}`}
          >
            {(survol || note) >= v ? "★" : "☆"}
          </button>
        ))}
      </div>
      <div className="field">
        <textarea
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value.slice(0, 300))}
          placeholder="Un commentaire (facultatif)"
          rows={2}
          style={{ width: "100%", border: "1.5px solid var(--color-line)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
        />
      </div>
      <button className="btn btn--primary" onClick={envoyer} disabled={envoi}>
        {envoi ? "…" : "Envoyer ma note"}
      </button>
    </div>
  );
}
