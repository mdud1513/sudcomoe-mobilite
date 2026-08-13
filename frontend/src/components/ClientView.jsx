import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Ticket from "./Ticket.jsx";
import ClientAuth from "./ClientAuth.jsx";
import ClientHistory from "./ClientHistory.jsx";
import MapPicker from "./MapPicker.jsx";
import { abonnerCourse } from "../push.js";

function distanceKmEntre(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const CLE_SESSION_CLIENT = "scm_client_session";
const CLE_COURSE_EN_COURS = "scm_course_en_cours";

// Centres approximatifs des zones, uniquement pour centrer la carte au départ (Samo = estimation)
const CENTRE_ZONES = {
  Yaou: { lat: 5.2344, lng: -3.6346 },
  "Grand-Bassam": { lat: 5.2118, lng: -3.7388 },
  Bonoua: { lat: 5.2725, lng: -3.5963 },
  Samo: { lat: 5.29, lng: -3.61 },
};

export default function ClientView({ zones, onToast, courseIdDepuisNotification }) {
  const [session, setSession] = useState(() => {
    try {
      const brut = localStorage.getItem(CLE_SESSION_CLIENT);
      return brut ? JSON.parse(brut) : null;
    } catch {
      return null;
    }
  });
  const [afficherAuth, setAfficherAuth] = useState(false);
  const [afficherHistorique, setAfficherHistorique] = useState(false);
  const [form, setForm] = useState({ clientNom: "", clientTelephone: "", zoneDepart: zones[0] || "", zoneArrivee: zones[1] || zones[0] || "", adresseArrivee: "", adresseDepart: "", nombrePassagers: 1 });
  const [position, setPosition] = useState(null); // { lat, lng } une fois localisé (départ)
  const [localisation, setLocalisation] = useState("inactif"); // inactif | en_cours | ok | refuse
  const [positionArrivee, setPositionArrivee] = useState(null); // { lat, lng } pour une arrivée hors des 4 zones
  const [localisationArrivee, setLocalisationArrivee] = useState("inactif");
  const [arrets, setArrets] = useState([]); // jusqu'à 3 points de collecte supplémentaires
  const [estimation, setEstimation] = useState(null);
  const [estimationEnCours, setEstimationEnCours] = useState(false);
  const [carteOuverte, setCarteOuverte] = useState(null); // null | "principale" | index de l'arrêt
  const [course, setCourse] = useState(null);
  const [modePaiement, setModePaiement] = useState(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  // Reprendre le suivi d'une course : priorité à celle indiquée par une notification cliquée,
  // sinon celle déjà en cours si l'onglet a été fermé puis rouvert
  useEffect(() => {
    const rideIdSauve = courseIdDepuisNotification || localStorage.getItem(CLE_COURSE_EN_COURS);
    if (!rideIdSauve) return;
    api
      .course(rideIdSauve)
      .then((fresh) => {
        if (["demandee", "confirmee", "arrivee"].includes(fresh.statut)) {
          setCourse(fresh);
        } else {
          localStorage.removeItem(CLE_COURSE_EN_COURS);
        }
      })
      .catch(() => localStorage.removeItem(CLE_COURSE_EN_COURS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (course?.id && ["demandee", "confirmee", "arrivee"].includes(course.statut)) {
      localStorage.setItem(CLE_COURSE_EN_COURS, course.id);
    } else if (course?.id) {
      localStorage.removeItem(CLE_COURSE_EN_COURS);
    }
  }, [course?.id, course?.statut]);

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

  useEffect(() => {
    const zoneLibre = form.zoneDepart === "Autre" || form.zoneArrivee === "Autre";
    const nbArretsRequis = zoneLibre ? 0 : Math.max(0, Math.min(3, form.nombrePassagers - 1));
    setArrets((prev) => {
      const next = prev.slice(0, nbArretsRequis);
      while (next.length < nbArretsRequis) {
        next.push({ nom: "", zone: form.zoneDepart, lieu: "", position: null, localisation: "inactif" });
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.nombrePassagers, form.zoneDepart, form.zoneArrivee]);

  function majArret(index, champ, valeur) {
    setArrets((prev) => prev.map((a, i) => (i === index ? { ...a, [champ]: valeur } : a)));
  }

  function localiserArret(index) {
    if (!navigator.geolocation) {
      onToast("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    majArret(index, "localisation", "en_cours");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        majArret(index, "position", { lat: pos.coords.latitude, lng: pos.coords.longitude });
        majArret(index, "localisation", "ok");
      },
      () => {
        majArret(index, "localisation", "refuse");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function connecte(nouvelleSession) {
    localStorage.setItem(CLE_SESSION_CLIENT, JSON.stringify(nouvelleSession));
    setSession(nouvelleSession);
    setAfficherAuth(false);
    setForm((f) => ({ ...f, clientNom: nouvelleSession.nom, clientTelephone: nouvelleSession.telephone }));
    onToast(`Bienvenue, ${nouvelleSession.nom}.`);
  }

  function deconnecter() {
    localStorage.removeItem(CLE_SESSION_CLIENT);
    setSession(null);
  }

  async function enregistrerAdresse() {
    if (!form.zoneArrivee) return;
    const label = window.prompt("Nom pour cette adresse (ex. Maison, Travail) :", "");
    if (!label) return;
    try {
      const maj = await api.ajouterAdresseFavorite(
        { label, zone: form.zoneArrivee, adresse: form.adresseArrivee, position: null },
        session.token
      );
      setSession((s) => ({ ...s, adressesFavorites: maj.adressesFavorites }));
      localStorage.setItem(CLE_SESSION_CLIENT, JSON.stringify({ ...session, adressesFavorites: maj.adressesFavorites }));
      onToast("Adresse enregistrée.");
    } catch (err) {
      onToast(err.message);
    }
  }

  function utiliserAdresseFavorite(adresse) {
    setForm((f) => ({ ...f, zoneArrivee: adresse.zone, adresseArrivee: adresse.adresse || "" }));
  }

  const arretsZonesCle = arrets.map((a) => a.zone).join(",");
  useEffect(() => {
    if (!form.zoneDepart || !form.zoneArrivee) return;
    if (form.zoneDepart === "Autre" && !position) { setEstimation(null); return; }
    if (form.zoneArrivee === "Autre" && !positionArrivee) { setEstimation(null); return; }
    let annule = false;
    setEstimationEnCours(true);
    const delai = setTimeout(async () => {
      try {
        const devis = await api.devis({
          zoneDepart: form.zoneDepart,
          zoneArrivee: form.zoneArrivee,
          nombrePassagers: form.nombrePassagers,
          arrets,
          positionDepart: form.zoneDepart === "Autre" ? position : null,
          positionArrivee: form.zoneArrivee === "Autre" ? positionArrivee : null,
        });
        if (!annule) setEstimation(devis);
      } catch {
        if (!annule) setEstimation(null);
      } finally {
        if (!annule) setEstimationEnCours(false);
      }
    }, 300);
    return () => {
      annule = true;
      clearTimeout(delai);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.zoneDepart, form.zoneArrivee, form.nombrePassagers, arretsZonesCle, position, positionArrivee]);

  function localiser() {
    if (!navigator.geolocation) {
      onToast("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setLocalisation("en_cours");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocalisation("ok");
      },
      () => {
        setLocalisation("refuse");
        onToast("Position non partagée — le chauffeur se basera uniquement sur la zone indiquée.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function localiserArrivee() {
    if (!navigator.geolocation) {
      onToast("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setLocalisationArrivee("en_cours");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPositionArrivee({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocalisationArrivee("ok");
      },
      () => {
        setLocalisationArrivee("refuse");
        onToast("Position d'arrivée non partagée — choisissez-la plutôt sur la carte.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.clientNom || !form.clientTelephone) {
      onToast("Indiquez votre nom et votre numéro.");
      return;
    }
    if (form.zoneDepart === "Autre" && !position) {
      onToast("Précisez votre position de départ sur la carte ou via votre position actuelle.");
      return;
    }
    if (form.zoneArrivee === "Autre" && !positionArrivee) {
      onToast("Précisez la position d'arrivée sur la carte ou via votre position actuelle.");
      return;
    }
    if (form.zoneDepart === form.zoneArrivee && form.zoneDepart !== "Autre") {
      onToast("Course locale enregistrée : départ et arrivée dans la même zone.");
    }
    setLoading(true);
    try {
      const created = await api.creerCourse(
        {
          ...form,
          position,
          positionArrivee,
          arrets: arrets.map((a) => ({ nom: a.nom, zone: a.zone, lieu: a.lieu, position: a.position })),
        },
        session?.token
      );
      setCourse(created);
      abonnerCourse(created.id)
        .then((resultat) => {
          if (!resultat.ok) {
            const raisons = {
              refuse: "Notifications refusées — vous ne recevrez pas d'alertes pour cette course.",
              non_supporte: "Notifications non disponibles sur cet appareil/navigateur.",
              erreur: "Impossible d'activer les notifications pour cette course.",
            };
            onToast(raisons[resultat.raison] || "Notifications non activées.");
          }
        })
        .catch(() => onToast("Impossible d'activer les notifications pour cette course."));
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
      onToast("Course terminée. Merci d'avoir voyagé avec Scotrans.");
    } catch (err) {
      onToast(err.message);
    }
  }

  function nouvelleCourse() {
    setCourse(null);
    setModePaiement(null);
  }

  if (afficherAuth) {
    return <ClientAuth onToast={onToast} onConnecte={connecte} onFermer={() => setAfficherAuth(false)} />;
  }

  if (afficherHistorique) {
    return (
      <ClientHistory
        token={session.token}
        onFermer={() => setAfficherHistorique(false)}
        onSuivre={async (rideId) => {
          try {
            const fresh = await api.course(rideId);
            setCourse(fresh);
            setAfficherHistorique(false);
          } catch (err) {
            onToast(err.message);
          }
        }}
      />
    );
  }

  if (carteOuverte !== null) {
    const centre =
      carteOuverte === "principale"
        ? CENTRE_ZONES[form.zoneDepart] || CENTRE_ZONES.Yaou
        : carteOuverte === "destination"
        ? CENTRE_ZONES[form.zoneArrivee] || CENTRE_ZONES.Yaou
        : CENTRE_ZONES[arrets[carteOuverte]?.zone] || CENTRE_ZONES.Yaou;
    return (
      <MapPicker
        centreInitial={centre}
        rechercheInitiale={carteOuverte === "principale" ? form.adresseDepart : carteOuverte === "destination" ? form.adresseArrivee : ""}
        onAnnuler={() => setCarteOuverte(null)}
        onValider={(pos, texteRecherche) => {
          if (carteOuverte === "principale") {
            setPosition(pos);
            setLocalisation("ok");
            if (texteRecherche) setForm((f) => ({ ...f, adresseDepart: texteRecherche }));
          } else if (carteOuverte === "destination") {
            setPositionArrivee(pos);
            setLocalisationArrivee("ok");
            if (texteRecherche) setForm((f) => ({ ...f, adresseArrivee: texteRecherche }));
          } else {
            majArret(carteOuverte, "position", pos);
            majArret(carteOuverte, "localisation", "ok");
            if (texteRecherche) majArret(carteOuverte, "lieu", texteRecherche);
          }
          setCarteOuverte(null);
          onToast("Position enregistrée.");
        }}
      />
    );
  }

  if (course) {
    return (
      <div>
        <Ticket course={course} contact={course.chauffeur} role="client" onToast={onToast} />

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

        {course.statut === "confirmee" && !course.chauffeurArriveLe && (
          <div style={{ marginTop: 16 }}>
            <p className="card__hint" style={{ textAlign: "center" }}>
              Votre chauffeur est en route vers vous.
            </p>
            <button className="btn btn--danger-outline" onClick={() => {
              if (window.confirm("Annuler cette course ? Le chauffeur est peut-être déjà en route.")) handleAnnuler();
            }}>
              Annuler la course
            </button>
          </div>
        )}

        {course.statut === "confirmee" && course.chauffeurArriveLe && (
          <div style={{ marginTop: 16 }}>
            <p className="card__hint" style={{ textAlign: "center", fontWeight: 600, color: "var(--color-primary-deep)" }}>
              {course.position && course.chauffeurPositionArrivee && distanceKmEntre(course.position, course.chauffeurPositionArrivee) <= 0.05
                ? "✅ Votre chauffeur est arrivé — position vérifiée, il est bien sur place."
                : "🚗 Votre chauffeur est arrivé — il vous attend au point de prise en charge."}
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await api.contesterArrivee(course.id);
                  onToast("Signalement envoyé — l'équipe et le chauffeur ont été notifiés.");
                } catch (err) {
                  onToast(err.message);
                }
              }}
              style={{ border: "none", background: "transparent", color: "var(--color-danger)", fontSize: 12.5, fontWeight: 600, padding: "8px 0 0", cursor: "pointer", display: "block", margin: "0 auto" }}
            >
              Il n'est pas encore là ?
            </button>
          </div>
        )}

        {course.statut === "arrivee" && (
          <div className="card" style={{ marginTop: 16 }}>
            <p className="card__title" style={{ fontSize: 15 }}>Arrivé à destination — confirmer et payer</p>
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
            <button className="btn btn--primary" onClick={handleTerminer}>Confirmer et terminer</button>
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
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
        {session ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 600 }}>👤 {session.nom}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setAfficherHistorique(true)}
                style={{ border: "none", background: "transparent", color: "var(--color-primary)", fontSize: 12.5, fontWeight: 600, padding: "6px 8px" }}
              >
                Mes courses
              </button>
              <button
                onClick={deconnecter}
                style={{ border: "none", background: "transparent", color: "var(--color-ink-soft)", fontSize: 12.5, fontWeight: 600, padding: "6px 8px" }}
              >
                Déconnexion
              </button>
            </div>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>Réservation sans compte</span>
            <button
              onClick={() => setAfficherAuth(true)}
              style={{ border: "none", background: "transparent", color: "var(--color-primary)", fontSize: 12.5, fontWeight: 600, padding: "6px 8px" }}
            >
              Se connecter
            </button>
          </>
        )}
      </div>

      <div style={{ height: 12 }} />

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
            <option value="Autre">Autre (préciser sur la carte)</option>
          </select>
        </div>
        <div className="route-row__arrow">→</div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="zoneArrivee">Arrivée</label>
          <select id="zoneArrivee" value={form.zoneArrivee} onChange={handleChange("zoneArrivee")}>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            <option value="Autre">Autre (préciser sur la carte)</option>
          </select>
        </div>
      </div>

      {form.zoneDepart === "Autre" && (
        <div className="field">
          <label htmlFor="adresseDepart">Lieu de départ (facultatif)</label>
          <input
            id="adresseDepart"
            value={form.adresseDepart}
            onChange={handleChange("adresseDepart")}
            placeholder="Ex. Devant la station-service, quartier..."
          />
        </div>
      )}

      <div className="field">
        <label htmlFor="adresseArrivee">Adresse précise d'arrivée (facultatif)</label>
        <input
          id="adresseArrivee"
          value={form.adresseArrivee}
          onChange={handleChange("adresseArrivee")}
          placeholder="Ex. Près du marché, en face de la pharmacie..."
        />
      </div>

      {session && session.adressesFavorites && session.adressesFavorites.length > 0 && (
        <div className="field">
          <label>Adresses favorites</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {session.adressesFavorites.map((a, i) => (
              <button
                key={i}
                type="button"
                className="pill"
                style={{ border: "none", cursor: "pointer" }}
                onClick={() => utiliserAdresseFavorite(a)}
              >
                📍 {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {session && form.zoneArrivee && (
        <button
          type="button"
          onClick={enregistrerAdresse}
          style={{ border: "none", background: "transparent", color: "var(--color-primary)", fontSize: 12.5, fontWeight: 600, padding: "0 0 14px", cursor: "pointer" }}
        >
          + Enregistrer cette adresse d'arrivée en favori
        </button>
      )}

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Nombre de passagers</label>
        <div className="pay-choice" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className={form.nombrePassagers === n ? "is-selected" : ""}
              onClick={() => setForm((f) => ({ ...f, nombrePassagers: n }))}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Position précise de départ {form.zoneDepart === "Autre" ? "(requise)" : "(facultatif)"}</label>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--outline"
            onClick={localiser}
            disabled={localisation === "en_cours"}
            style={{ marginTop: 2 }}
          >
            {localisation === "ok"
              ? "📍 Position partagée"
              : localisation === "en_cours"
              ? "Localisation…"
              : "📍 Ma position actuelle"}
          </button>
          <button type="button" className="btn btn--outline" onClick={() => setCarteOuverte("principale")} style={{ marginTop: 2 }}>
            🗺️ Choisir sur la carte
          </button>
        </div>
        <p className="card__hint" style={{ marginTop: 6, marginBottom: 0 }}>
          {form.zoneDepart === "Autre"
            ? "Obligatoire : sans position précise, impossible de calculer un tarif hors des 4 zones habituelles."
            : "Aide le chauffeur à vous retrouver précisément, en plus de la zone choisie ci-dessus."}
        </p>
      </div>

      {form.zoneArrivee === "Autre" && (
        <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
          <label>Position précise d'arrivée (requise)</label>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--outline"
              onClick={localiserArrivee}
              disabled={localisationArrivee === "en_cours"}
              style={{ marginTop: 2 }}
            >
              {localisationArrivee === "ok"
                ? "📍 Position partagée"
                : localisationArrivee === "en_cours"
                ? "Localisation…"
                : "📍 Ma position actuelle"}
            </button>
            <button type="button" className="btn btn--outline" onClick={() => setCarteOuverte("destination")} style={{ marginTop: 2 }}>
              🗺️ Choisir sur la carte
            </button>
          </div>
          <p className="card__hint" style={{ marginTop: 6, marginBottom: 0 }}>
            Obligatoire : sans position précise, impossible de calculer un tarif hors des 4 zones habituelles.
          </p>
        </div>
      )}

      {arrets.length > 0 && (
        <>
          <div style={{ height: 6 }} />
          <p className="section-label" style={{ margin: "4px 2px 8px" }}>
            Récupérer {arrets.length} autre{arrets.length > 1 ? "s" : ""} passager{arrets.length > 1 ? "s" : ""}
          </p>
          {arrets.map((arret, i) => (
            <div key={i} className="card" style={{ background: "var(--color-primary-tint)", boxShadow: "none", padding: 14, marginBottom: 10 }}>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Nom de la personne {i + 1} (facultatif)</label>
                <input
                  value={arret.nom}
                  onChange={(e) => majArret(i, "nom", e.target.value)}
                  placeholder="Laisser vide si vous préférez"
                />
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Zone où la récupérer</label>
                <select value={arret.zone} onChange={(e) => majArret(i, "zone", e.target.value)}>
                  {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Lieu précis (facultatif)</label>
                <input
                  value={arret.lieu || ""}
                  onChange={(e) => majArret(i, "lieu", e.target.value)}
                  placeholder="Ex. Devant la pharmacie, chez le tailleur..."
                />
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => localiserArret(i)}
                  disabled={arret.localisation === "en_cours"}
                  style={{ padding: "10px 14px", fontSize: 13.5 }}
                >
                  {arret.localisation === "ok"
                    ? "📍 Position partagée"
                    : arret.localisation === "en_cours"
                    ? "Localisation…"
                    : "📍 Je suis avec elle"}
                </button>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setCarteOuverte(i)}
                  style={{ padding: "10px 14px", fontSize: 13.5 }}
                >
                  🗺️ Sur la carte
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ height: 16 }} />

      {estimation && (
        <div className="ticket__stub" style={{ background: "var(--color-primary-tint)", borderRadius: "var(--radius-md)", padding: "14px 18px", marginBottom: 14 }}>
          <div>
            <div className="ticket__amount-label">Estimation{estimationEnCours ? "…" : ""}</div>
            <div className="ticket__amount" style={{ fontSize: 22, color: "var(--color-primary-deep)" }}>
              {estimation.montant} FCFA
            </div>
            {estimation.supplementArrets > 0 && (
              <div style={{ fontSize: 11, color: "var(--color-ink-soft)", marginTop: 2 }}>
                dont {estimation.supplementArrets} FCFA de détour
              </div>
            )}
          </div>
          {typeof estimation.distanceKm === "number" && (
            <div className="ticket__code">≈ {estimation.distanceKm} km</div>
          )}
        </div>
      )}

      <button className="btn btn--accent" type="submit" disabled={loading}>
        {loading ? "Envoi de la demande…" : "Demander une course"}
      </button>
      </form>
    </div>
  );
}
