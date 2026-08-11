import Fastify from "fastify";
import cors from "@fastify/cors";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { db, id } from "./db.js";

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

const ZONES = ["Yaou", "Grand-Bassam", "Bonoua", "Samo"];
const COMMISSION_RATE = 0.12;

function hashMotDePasse(motDePasse) {
  const sel = randomBytes(16).toString("hex");
  const hash = scryptSync(motDePasse, sel, 64).toString("hex");
  return `${sel}:${hash}`;
}

function verifierMotDePasse(motDePasse, stocke) {
  const [sel, hash] = stocke.split(":");
  const hashEssai = scryptSync(motDePasse, sel, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(hashEssai, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function requireAdmin(req, reply) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  await db.read();
  const admin = token ? db.data.admins.find((a) => a.token === token) : null;
  if (!admin) {
    reply.code(401).send({ erreur: "Authentification admin requise." });
    return null;
  }
  return admin;
}

// ---------- Authentification admin ----------

// Indique s'il faut créer le tout premier compte admin (aucun admin existant)
app.get("/api/admin/existe", async () => {
  await db.read();
  return { existe: db.data.admins.length > 0 };
});

// Création du tout premier admin — accessible uniquement si aucun admin n'existe encore
app.post("/api/admin/bootstrap", async (req, reply) => {
  const { nom, telephone, motDePasse } = req.body || {};
  await db.read();
  if (db.data.admins.length > 0) {
    return reply.code(409).send({ erreur: "Un compte admin existe déjà. Demandez une invitation." });
  }
  if (!nom || !telephone || !motDePasse || motDePasse.length < 6) {
    return reply.code(400).send({ erreur: "nom, telephone et motDePasse (6 caractères min.) sont requis." });
  }
  const token = id("tok");
  const admin = { id: id("admin"), nom, telephone, motDePasseHash: hashMotDePasse(motDePasse), token };
  db.data.admins.push(admin);
  await db.write();
  return reply.code(201).send({ nom: admin.nom, telephone: admin.telephone, token });
});

// Connexion d'un admin existant
app.post("/api/admin/connexion", async (req, reply) => {
  const { telephone, motDePasse } = req.body || {};
  await db.read();
  const admin = db.data.admins.find((a) => a.telephone === telephone);
  if (!admin || !verifierMotDePasse(motDePasse || "", admin.motDePasseHash)) {
    return reply.code(401).send({ erreur: "Numéro ou mot de passe incorrect." });
  }
  admin.token = id("tok"); // un seul token actif à la fois, suffisant pour le prototype
  await db.write();
  return { nom: admin.nom, telephone: admin.telephone, token: admin.token };
});

// Invitation d'un nouvel admin — nécessite d'être déjà connecté
app.post("/api/admin/inviter", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;
  const { nom, telephone, motDePasse } = req.body || {};
  if (!nom || !telephone || !motDePasse || motDePasse.length < 6) {
    return reply.code(400).send({ erreur: "nom, telephone et motDePasse (6 caractères min.) sont requis." });
  }
  await db.read();
  if (db.data.admins.some((a) => a.telephone === telephone)) {
    return reply.code(409).send({ erreur: "Un admin existe déjà avec ce numéro." });
  }
  const admin = { id: id("admin"), nom, telephone, motDePasseHash: hashMotDePasse(motDePasse), token: null };
  db.data.admins.push(admin);
  await db.write();
  return reply.code(201).send({ nom: admin.nom, telephone: admin.telephone });
});

app.get("/api/admin/liste", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;
  await db.read();
  return db.data.admins.map((a) => ({ nom: a.nom, telephone: a.telephone }));
});

const FOURCHETTES_LOCALE = { 1: [500, 800], 2: [800, 1000], 3: [1000, 1200], 4: [1200, 1400] };
const FOURCHETTES_INTER_ZONE = { 1: [800, 1400], 2: [1400, 1700], 3: [1700, 2000], 4: [2000, 2300] };

function tarif(zoneDepart, zoneArrivee, nombrePassagers) {
  const n = Math.min(4, Math.max(1, parseInt(nombrePassagers, 10) || 1));
  const [min, max] = zoneDepart === zoneArrivee ? FOURCHETTES_LOCALE[n] : FOURCHETTES_INTER_ZONE[n];
  const pas = Math.floor((max - min) / 100) + 1;
  return min + Math.floor(Math.random() * pas) * 100;
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

// Inscription d'un nouveau chauffeur affilié
app.post("/api/chauffeurs", async (req, reply) => {
  const { nom, telephone, zone, immatriculation } = req.body || {};
  if (!nom || !telephone || !zone || !immatriculation) {
    return reply.code(400).send({ erreur: "nom, telephone, zone et immatriculation sont requis." });
  }
  if (!ZONES.includes(zone)) {
    return reply.code(400).send({ erreur: `Zone inconnue. Zones valides : ${ZONES.join(", ")}.` });
  }
  await db.read();
  const telephoneExiste = db.data.users.some((u) => u.telephone === telephone);
  if (telephoneExiste) {
    return reply.code(409).send({ erreur: "Un chauffeur est déjà enregistré avec ce numéro." });
  }

  const chauffeurId = id("u");
  const nbChauffeurs = db.data.users.filter((u) => u.role === "chauffeur").length;
  const badge = `SCM-${String(nbChauffeurs + 1).padStart(3, "0")}`;

  const chauffeur = {
    id: chauffeurId,
    role: "chauffeur",
    nom,
    telephone,
    zone,
    statut: "en attente de validation", // à valider par l'équipe avant première course (diagnostic gaz, contrat)
    badge,
  };
  const vehicule = {
    id: id("v"),
    chauffeurId,
    immatriculation,
    kitGpl: "à diagnostiquer",
    dernierControle: null,
  };
  db.data.users.push(chauffeur);
  db.data.vehicles.push(vehicule);
  await db.write();
  return reply.code(201).send({ ...chauffeur, vehicule });
});

// ---------- Courses ----------

// Client crée une demande de course
app.post("/api/rides", async (req, reply) => {
  const { clientNom, clientTelephone, zoneDepart, zoneArrivee, nombrePassagers, position } = req.body || {};
  if (!clientNom || !clientTelephone || !zoneDepart || !zoneArrivee) {
    return reply.code(400).send({ erreur: "clientNom, clientTelephone, zoneDepart et zoneArrivee sont requis." });
  }
  const passagers = Math.min(4, Math.max(1, parseInt(nombrePassagers, 10) || 1));
  const positionValide =
    position && typeof position.lat === "number" && typeof position.lng === "number" ? position : null;
  await db.read();
  const ride = {
    id: id("ride"),
    clientNom,
    clientTelephone,
    zoneDepart,
    zoneArrivee,
    nombrePassagers: passagers,
    position: positionValide, // { lat, lng } ou null si non partagée / refusée
    montant: tarif(zoneDepart, zoneArrivee, passagers),
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
  if (chauffeur.statut !== "actif") {
    return reply.code(403).send({ erreur: "Inscription en attente de validation (diagnostic gaz et signature du contrat requis avant la première course)." });
  }

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

// Validation d'un chauffeur par l'équipe (après diagnostic gaz + signature du contrat)
app.post("/api/chauffeurs/:chauffeurId/valider", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;
  await db.read();
  const chauffeur = db.data.users.find((u) => u.id === req.params.chauffeurId && u.role === "chauffeur");
  if (!chauffeur) return reply.code(404).send({ erreur: "Chauffeur introuvable." });
  chauffeur.statut = "actif";
  const vehicule = db.data.vehicles.find((v) => v.chauffeurId === chauffeur.id);
  if (vehicule) vehicule.kitGpl = "posé";
  await db.write();
  return { ...chauffeur, vehicule };
});

app.get("/api/health", async () => ({ ok: true }));

const port = process.env.PORT || 8787;
app.listen({ port, host: "0.0.0.0" }).then(() => {
  console.log(`Sud-Comoé Mobilité API sur http://localhost:${port}`);
});
