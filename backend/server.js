import Fastify from "fastify";
import cors from "@fastify/cors";
import { db, id } from "./db.js";

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

const ZONES = ["Yaou", "Grand-Bassam", "Bonoua", "Samo"];
const COMMISSION_RATE = 0.12;

function tarif(zoneDepart, zoneArrivee) {
  if (zoneDepart === zoneArrivee) {
    // course locale : 500 à 1000 FCFA
    return 500 + Math.floor(Math.random() * 6) * 100;
  }
  // course périphérique : au-delà de 1000 FCFA
  return 1200 + Math.floor(Math.random() * 9) * 100;
}

// ---------- Référentiel ----------
app.get("/api/zones", async () => ZONES);

app.get("/api/chauffeurs", async () => {
  await db.read();
  return db.data.users
    .filter((u) => u.role === "chauffeur")
    .map((u) => ({
      ...u,
      vehicule: db.data.vehicles.find((v) => v.chauffeurId === u.id) || null,
    }));
});

// ---------- Courses ----------

// Client crée une demande de course
app.post("/api/rides", async (req, reply) => {
  const { clientNom, clientTelephone, zoneDepart, zoneArrivee } = req.body || {};
  if (!clientNom || !clientTelephone || !zoneDepart || !zoneArrivee) {
    return reply.code(400).send({ erreur: "clientNom, clientTelephone, zoneDepart et zoneArrivee sont requis." });
  }
  await db.read();
  const ride = {
    id: id("ride"),
    clientNom,
    clientTelephone,
    zoneDepart,
    zoneArrivee,
    montant: tarif(zoneDepart, zoneArrivee),
    statut: "demandee", // demandee -> confirmee -> terminee | annulee
    chauffeurId: null,
    modePaiement: null,
    creeLe: new Date().toISOString(),
    historique: [{ statut: "demandee", horodatage: new Date().toISOString() }],
  };
  db.data.rides.push(ride);
  await db.write();
  return reply.code(201).send(ride);
});

// Suivi d'une course par le client (polling)
app.get("/api/rides/:rideId", async (req, reply) => {
  await db.read();
  const ride = db.data.rides.find((r) => r.id === req.params.rideId);
  if (!ride) return reply.code(404).send({ erreur: "Course introuvable." });
  const chauffeur = ride.chauffeurId ? db.data.users.find((u) => u.id === ride.chauffeurId) : null;
  return { ...ride, chauffeur };
});

// Liste des demandes disponibles pour un chauffeur (par zone de départ)
app.get("/api/rides", async (req) => {
  await db.read();
  const { statut, zone, chauffeurId } = req.query;
  let rides = db.data.rides;
  if (statut) rides = rides.filter((r) => r.statut === statut);
  if (zone) rides = rides.filter((r) => r.zoneDepart === zone);
  if (chauffeurId) rides = rides.filter((r) => r.chauffeurId === chauffeurId);
  return rides.slice().reverse();
});

// Chauffeur accepte une course
app.post("/api/rides/:rideId/accepter", async (req, reply) => {
  const { chauffeurId } = req.body || {};
  await db.read();
  const ride = db.data.rides.find((r) => r.id === req.params.rideId);
  if (!ride) return reply.code(404).send({ erreur: "Course introuvable." });
  if (ride.statut !== "demandee") return reply.code(409).send({ erreur: "Cette course n'est plus disponible." });
  const chauffeur = db.data.users.find((u) => u.id === chauffeurId && u.role === "chauffeur");
  if (!chauffeur) return reply.code(400).send({ erreur: "Chauffeur inconnu." });

  ride.statut = "confirmee";
  ride.chauffeurId = chauffeurId;
  ride.historique.push({ statut: "confirmee", horodatage: new Date().toISOString() });
  await db.write();
  return { ...ride, chauffeur };
});

// Client confirme la fin de course + choix du mode de paiement (préalable obligatoire au règlement)
app.post("/api/rides/:rideId/terminer", async (req, reply) => {
  const { modePaiement } = req.body || {}; // "mobile_money" | "especes"
  if (!["mobile_money", "especes"].includes(modePaiement)) {
    return reply.code(400).send({ erreur: "modePaiement doit être 'mobile_money' ou 'especes'." });
  }
  await db.read();
  const ride = db.data.rides.find((r) => r.id === req.params.rideId);
  if (!ride) return reply.code(404).send({ erreur: "Course introuvable." });
  if (ride.statut !== "confirmee") return reply.code(409).send({ erreur: "Cette course ne peut pas être terminée depuis son statut actuel." });

  const commission = Math.round(ride.montant * COMMISSION_RATE);
  ride.statut = "terminee";
  ride.modePaiement = modePaiement;
  ride.commission = commission;
  ride.partChauffeur = ride.montant - commission;
  ride.historique.push({ statut: "terminee", horodatage: new Date().toISOString() });
  await db.write();
  return ride;
});

// Annulation (client ou chauffeur)
app.post("/api/rides/:rideId/annuler", async (req, reply) => {
  await db.read();
  const ride = db.data.rides.find((r) => r.id === req.params.rideId);
  if (!ride) return reply.code(404).send({ erreur: "Course introuvable." });
  if (["terminee", "annulee"].includes(ride.statut)) {
    return reply.code(409).send({ erreur: "Cette course ne peut plus être annulée." });
  }
  ride.statut = "annulee";
  ride.historique.push({ statut: "annulee", horodatage: new Date().toISOString() });
  await db.write();
  return ride;
});

// Tableau de bord chauffeur : solde des commissions dues sur courses payées en espèces
app.get("/api/chauffeurs/:chauffeurId/solde", async (req, reply) => {
  await db.read();
  const rides = db.data.rides.filter(
    (r) => r.chauffeurId === req.params.chauffeurId && r.statut === "terminee" && r.modePaiement === "especes"
  );
  const commissionDue = rides.reduce((sum, r) => sum + (r.commission || 0), 0);
  return { chauffeurId: req.params.chauffeurId, commissionDueEspeces: commissionDue, nbCourses: rides.length };
});

app.get("/api/health", async () => ({ ok: true }));

const port = process.env.PORT || 8787;
app.listen({ port, host: "0.0.0.0" }).then(() => {
  console.log(`Sud-Comoé Mobilité API sur http://localhost:${port}`);
});
