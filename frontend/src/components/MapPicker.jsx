import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function MapPicker({ centreInitial, rechercheInitiale = "", onValider, onAnnuler }) {
  const conteneurRef = useRef(null);
  const carteRef = useRef(null);
  const marqueurRef = useRef(null);
  const [position, setPosition] = useState(centreInitial);
  const [recherche, setRecherche] = useState(rechercheInitiale);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [erreurRecherche, setErreurRecherche] = useState(null);

  useEffect(() => {
    if (!conteneurRef.current || carteRef.current) return;

    const carte = L.map(conteneurRef.current).setView([centreInitial.lat, centreInitial.lng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(carte);

    const marqueur = L.marker([centreInitial.lat, centreInitial.lng], { draggable: true }).addTo(carte);
    marqueur.on("dragend", () => {
      const p = marqueur.getLatLng();
      setPosition({ lat: p.lat, lng: p.lng });
    });
    carte.on("click", (e) => {
      marqueur.setLatLng(e.latlng);
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    carteRef.current = carte;
    marqueurRef.current = marqueur;

    setTimeout(() => carte.invalidateSize(), 100);

    return () => {
      carte.remove();
      carteRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rechercherLieu(e) {
    e.preventDefault();
    if (!recherche.trim()) return;
    setRechercheEnCours(true);
    setErreurRecherche(null);
    try {
      // Nominatim (OpenStreetMap) — recherche gratuite, centrée sur la Côte d'Ivoire / Sud-Comoé
      const params = new URLSearchParams({
        q: recherche.trim(),
        format: "json",
        limit: "1",
        countrycodes: "ci",
        viewbox: "-3.85,5.05,-3.45,5.40", // encadre largement Yaou/Bassam/Bonoua/Samo
        bounded: "0",
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      const resultats = await res.json();
      if (!resultats || resultats.length === 0) {
        setErreurRecherche("Aucun lieu trouvé pour cette recherche — essayez avec un nom plus précis, ou placez le repère manuellement.");
        return;
      }
      const { lat, lon } = resultats[0];
      const nouvellePosition = { lat: parseFloat(lat), lng: parseFloat(lon) };
      setPosition(nouvellePosition);
      if (carteRef.current && marqueurRef.current) {
        carteRef.current.setView([nouvellePosition.lat, nouvellePosition.lng], 16);
        marqueurRef.current.setLatLng([nouvellePosition.lat, nouvellePosition.lng]);
      }
    } catch {
      setErreurRecherche("Recherche indisponible pour le moment — placez le repère manuellement.");
    } finally {
      setRechercheEnCours(false);
    }
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <p className="card__title" style={{ fontSize: 15 }}>Choisir la position sur la carte</p>

      <form onSubmit={rechercherLieu} className="btn-row" style={{ marginBottom: 10 }}>
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un lieu (ex. Marché de Bonoua)"
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn--outline" disabled={rechercheEnCours} style={{ width: "auto", padding: "10px 16px" }}>
          {rechercheEnCours ? "…" : "🔍 Rechercher"}
        </button>
      </form>
      {erreurRecherche && (
        <p className="card__hint" style={{ color: "var(--color-danger)", marginTop: -4, marginBottom: 10 }}>
          {erreurRecherche}
        </p>
      )}

      <p className="card__hint">Déplacez le repère ou touchez la carte pour ajuster l'endroit exact.</p>
      <div
        ref={conteneurRef}
        style={{ height: 260, borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: 12 }}
      />
      <div className="btn-row">
        <button type="button" className="btn btn--outline" onClick={onAnnuler}>
          Annuler
        </button>
        <button type="button" className="btn btn--primary" onClick={() => onValider(position, recherche.trim())}>
          Valider cette position
        </button>
      </div>
    </div>
  );
}
