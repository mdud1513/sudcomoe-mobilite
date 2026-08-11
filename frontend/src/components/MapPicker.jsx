import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function MapPicker({ centreInitial, onValider, onAnnuler }) {
  const conteneurRef = useRef(null);
  const carteRef = useRef(null);
  const marqueurRef = useRef(null);
  const [position, setPosition] = useState(centreInitial);

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

  return (
    <div className="card" style={{ padding: 14 }}>
      <p className="card__title" style={{ fontSize: 15 }}>Choisir la position sur la carte</p>
      <p className="card__hint">Déplacez le repère ou touchez la carte à l'endroit exact.</p>
      <div
        ref={conteneurRef}
        style={{ height: 260, borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: 12 }}
      />
      <div className="btn-row">
        <button type="button" className="btn btn--outline" onClick={onAnnuler}>
          Annuler
        </button>
        <button type="button" className="btn btn--primary" onClick={() => onValider(position)}>
          Valider cette position
        </button>
      </div>
    </div>
  );
}
