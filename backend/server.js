import Fastify from "fastify";
import cors from "@fastify/cors";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { pool, id, initDb } from "./db.js";
import {
  clePublique,
  enregistrerAbonnement,
  notifierChauffeursActifs,
  notifierClientDeLaCourse,
  notifierChauffeur,
} from "./push.js";

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

const ZONES = ["Yaou", "Grand-Bassam", "Bonoua", "Samo"];
const COMMISSION_RATE = 0.12;

// ---------- Tarification ----------

const ZONE_COORDS = {
  Yaou: { lat: 5.2344, lng: -3.6346 },
  "Grand-Bassam": { lat: 5.2118, lng: -3.7388 },
  Bonoua: { lat: 5.2725, lng: -3.5963 },
  Samo: { lat: 5.29, lng: -3.61 }, // estimation approximative, à corriger si coordonnées précises disponibles
};

function distanceKm(zoneA, zoneB) {
  const a = ZONE_COORDS[zoneA];
  const b = ZONE_COORDS[zoneB];
  if (!a || !b) return 8;
  return distanceEntrePoints(a, b);
}

function distanceEntrePoints(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const PRIX_PAR_KM = 150;
const PRIX_PAR_KM_DETOUR = 80;
const TARIF_MINIMUM = 400;
const SEUIL_SUR_LE_CHEMIN_KM = 1.5;

function facteurPassagers(n) {
  return 1 + (n - 1) * 0.25;
}

function arrondir50(valeur) {
  return Math.round(valeur / 50) * 50;
}

const DISTANCE_LOCALE_KM = 2; // estimation moyenne pour un trajet intra-zone (pas de centres distincts)
const VITESSE_MOYENNE_KMH = 25; // moyenne prudente en zone locale (routes, arrêts, circulation)
const TEMPS_PREPARATION_MIN = 3; // délai avant que le chauffeur ne prenne réellement la route

const ZONE_AUTRE = "Autre";

// Renvoie les coordonnées d'un point : celles de la zone si elle est connue, sinon la position
// personnalisée fournie (obligatoire quand la zone vaut "Autre"). Renvoie null si indéterminable.
function pointDeZone(zone, positionPersonnalisee) {
  if (zone !== ZONE_AUTRE) return ZONE_COORDS[zone] || null;
  if (positionPersonnalisee && typeof positionPersonnalisee.lat === "number" && typeof positionPersonnalisee.lng === "number") {
    return positionPersonnalisee;
  }
  return null;
}

function estimerTempsAttente(zoneChauffeur, zoneDepart, positionDepart) {
  const pointChauffeur = pointDeZone(zoneChauffeur, null);
  const pointDepart = pointDeZone(zoneDepart, positionDepart);
  const distance =
    zoneChauffeur === zoneDepart && zoneDepart !== ZONE_AUTRE
      ? DISTANCE_LOCALE_KM
      : pointChauffeur && pointDepart
      ? distanceEntrePoints(pointChauffeur, pointDepart)
      : 8; // repli raisonnable si un point personnalisé venait à manquer
  const minutes = Math.round((distance / VITESSE_MOYENNE_KMH) * 60) + TEMPS_PREPARATION_MIN;
  return minutes;
}

function tarif(zoneDepart, zoneArrivee, nombrePassagers, positionDepart, positionArrivee) {
  const n = Math.min(4, Math.max(1, parseInt(nombrePassagers, 10) || 1));

  let distance;
  if (zoneDepart === zoneArrivee && zoneDepart !== ZONE_AUTRE) {
    distance = DISTANCE_LOCALE_KM;
  } else {
    const pointA = pointDeZone(zoneDepart, positionDepart);
    const pointB = pointDeZone(zoneArrivee, positionArrivee);
    if (!pointA || !pointB) return null; // position personnalisée manquante : impossible de tarifer
    distance = distanceEntrePoints(pointA, pointB);
  }

  const montant = arrondir50(Math.max(TARIF_MINIMUM, distance * PRIX_PAR_KM) * facteurPassagers(n));
  return { montant, distanceKm: Math.round(distance * 10) / 10 };
}

function detourExtraKm(zoneDepart, zoneArrivee, zoneArret) {
  if (zoneDepart === zoneArrivee) {
    return zoneArret === zoneDepart ? 0 : 2 * distanceKm(zoneDepart, zoneArret);
  }
  const trajetDirect = distanceKm(zoneDepart, zoneArrivee);
  const trajetViaArret = distanceKm(zoneDepart, zoneArret) + distanceKm(zoneArret, zoneArrivee);
  return Math.max(0, trajetViaArret - trajetDirect);
}

function supplementArrets(zoneDepart, zoneArrivee, arrets) {
  if (!Array.isArray(arrets)) return { total: 0, details: [] };
  const details = [];
  let total = 0;
  for (const a of arrets) {
    if (!a || !a.zone) continue;
    const extraKm = detourExtraKm(zoneDepart, zoneArrivee, a.zone);
    const surLeChemin = extraKm <= SEUIL_SUR_LE_CHEMIN_KM;
    const cout = surLeChemin ? 0 : arrondir50(extraKm * PRIX_PAR_KM_DETOUR);
    total += cout;
    details.push({ zone: a.zone, distanceKm: Math.round(extraKm * 10) / 10, surLeChemin, cout });
  }
  return { total, details };
}

// ---------- Authentification admin ----------

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
  if (!token) {
    reply.code(401).send({ erreur: "Authentification admin requise." });
    return null;
  }
  const { rows } = await pool.query("SELECT * FROM admins WHERE token = $1", [token]);
  if (!rows[0]) {
    reply.code(401).send({ erreur: "Authentification admin requise." });
    return null;
  }
  return rows[0];
}

async function requireChauffeur(req, reply) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    reply.code(401).send({ erreur: "Connexion chauffeur requise." });
    return null;
  }
  const { rows } = await pool.query("SELECT * FROM chauffeurs WHERE token = $1", [token]);
  if (!rows[0]) {
    reply.code(401).send({ erreur: "Connexion chauffeur requise." });
    return null;
  }
  return rows[0];
}

async function requireSyndicat(req, reply) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    reply.code(401).send({ erreur: "Connexion syndicat requise." });
    return null;
  }
  const { rows } = await pool.query("SELECT * FROM syndicats WHERE token = $1", [token]);
  if (!rows[0]) {
    reply.code(401).send({ erreur: "Connexion syndicat requise." });
    return null;
  }
  return rows[0];
}

async function requireClient(req, reply) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    reply.code(401).send({ erreur: "Connexion client requise." });
    return null;
  }
  const { rows } = await pool.query("SELECT * FROM clients WHERE token = $1", [token]);
  if (!rows[0]) {
    reply.code(401).send({ erreur: "Connexion client requise." });
    return null;
  }
  return rows[0];
}

// Authentification facultative : renvoie le client s'il est connecté, sinon null sans jamais bloquer la requête
async function clientOptionnel(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { rows } = await pool.query("SELECT * FROM clients WHERE token = $1", [token]);
  return rows[0] || null;
}

async function chauffeurOptionnel(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { rows } = await pool.query("SELECT * FROM chauffeurs WHERE token = $1", [token]);
  return rows[0] || null;
}

app.get("/api/admin/existe", async () => {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM admins");
  return { existe: rows[0].n > 0 };
});

app.post("/api/admin/bootstrap", async (req, reply) => {
  const { nom, telephone, motDePasse } = req.body || {};
  const { rows: existants } = await pool.query("SELECT COUNT(*)::int AS n FROM admins");
  if (existants[0].n > 0) {
    return reply.code(409).send({ erreur: "Un compte admin existe déjà. Demandez une invitation." });
  }
  if (!nom || !telephone || !motDePasse || motDePasse.length < 6) {
    return reply.code(400).send({ erreur: "nom, telephone et motDePasse (6 caractères min.) sont requis." });
  }
  const token = id("tok");
  await pool.query(
    "INSERT INTO admins (id, nom, telephone, mot_de_passe_hash, token) VALUES ($1,$2,$3,$4,$5)",
    [id("admin"), nom, telephone, hashMotDePasse(motDePasse), token]
  );
  return reply.code(201).send({ nom, telephone, token });
});

app.post("/api/admin/connexion", async (req, reply) => {
  const { telephone, motDePasse } = req.body || {};
  const { rows } = await pool.query("SELECT * FROM admins WHERE telephone = $1", [telephone]);
  const admin = rows[0];
  if (!admin || !verifierMotDePasse(motDePasse || "", admin.mot_de_passe_hash)) {
    return reply.code(401).send({ erreur: "Numéro ou mot de passe incorrect." });
  }
  const token = id("tok");
  await pool.query("UPDATE admins SET token = $1 WHERE id = $2", [token, admin.id]);
  return { nom: admin.nom, telephone: admin.telephone, token };
});

app.post("/api/admin/inviter", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;
  const { nom, telephone, motDePasse } = req.body || {};
  if (!nom || !telephone || !motDePasse || motDePasse.length < 6) {
    return reply.code(400).send({ erreur: "nom, telephone et motDePasse (6 caractères min.) sont requis." });
  }
  const { rows: existant } = await pool.query("SELECT id FROM admins WHERE telephone = $1", [telephone]);
  if (existant[0]) {
    return reply.code(409).send({ erreur: "Un admin existe déjà avec ce numéro." });
  }
  await pool.query(
    "INSERT INTO admins (id, nom, telephone, mot_de_passe_hash, token) VALUES ($1,$2,$3,$4,NULL)",
    [id("admin"), nom, telephone, hashMotDePasse(motDePasse)]
  );
  return reply.code(201).send({ nom, telephone });
});

app.get("/api/admin/liste", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;
  const { rows } = await pool.query("SELECT nom, telephone FROM admins ORDER BY cree_le");
  return rows;
});

app.get("/api/admin/statistiques", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;

  const { rows: globalRows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE statut = 'terminee')::int AS nb_terminees,
      COUNT(*)::int AS nb_total,
      COUNT(*) FILTER (WHERE statut = 'annulee')::int AS nb_annulees,
      COUNT(*) FILTER (WHERE statut IN ('demandee','confirmee'))::int AS nb_en_cours,
      COALESCE(SUM(montant) FILTER (WHERE statut = 'terminee'), 0)::int AS ca_total,
      COALESCE(SUM(commission) FILTER (WHERE statut = 'terminee'), 0)::int AS commission_totale
    FROM rides
  `);
  const g = globalRows[0];

  const { rows: parChauffeur } = await pool.query(`
    SELECT
      c.id AS chauffeur_id, c.nom, c.badge, c.zone,
      COUNT(r.id) FILTER (WHERE r.statut = 'terminee')::int AS nb_courses,
      COALESCE(SUM(r.montant) FILTER (WHERE r.statut = 'terminee'), 0)::int AS chiffre_affaires,
      COALESCE(SUM(r.commission) FILTER (WHERE r.statut = 'terminee'), 0)::int AS commission,
      COALESCE(SUM(r.part_chauffeur) FILTER (WHERE r.statut = 'terminee'), 0)::int AS part_chauffeur
    FROM chauffeurs c
    LEFT JOIN rides r ON r.chauffeur_id = c.id
    GROUP BY c.id, c.nom, c.badge, c.zone
    ORDER BY nb_courses DESC
  `);

  return {
    global: {
      nbCoursesTerminees: g.nb_terminees,
      nbCoursesTotal: g.nb_total,
      nbCoursesAnnulees: g.nb_annulees,
      nbCoursesEnCours: g.nb_en_cours,
      chiffreAffairesTotal: g.ca_total,
      commissionTotale: g.commission_totale,
    },
    parChauffeur: parChauffeur.map((c) => ({
      chauffeurId: c.chauffeur_id,
      nom: c.nom,
      badge: c.badge,
      zone: c.zone,
      nbCourses: c.nb_courses,
      chiffreAffaires: c.chiffre_affaires,
      commission: c.commission,
      partChauffeur: c.part_chauffeur,
    })),
  };
});

// ---------- Espace client ----------

function versClientDTO(row) {
  return {
    id: row.id,
    nom: row.nom,
    telephone: row.telephone,
    adressesFavorites: row.adresses_favorites,
  };
}

app.post("/api/clients/inscription", async (req, reply) => {
  const { nom, telephone, codePin } = req.body || {};
  if (!nom || !telephone) {
    return reply.code(400).send({ erreur: "nom et telephone sont requis." });
  }
  if (!/^\d{4}$/.test(codePin || "")) {
    return reply.code(400).send({ erreur: "codePin doit être composé de 4 chiffres." });
  }
  const { rows: existant } = await pool.query("SELECT id FROM clients WHERE telephone = $1", [telephone]);
  if (existant[0]) {
    return reply.code(409).send({ erreur: "Un compte existe déjà avec ce numéro. Connectez-vous plutôt." });
  }
  const clientId = id("cli");
  const token = id("tok");
  const { rows } = await pool.query(
    `INSERT INTO clients (id, nom, telephone, code_pin_hash, token) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [clientId, nom, telephone, hashMotDePasse(codePin), token]
  );
  return reply.code(201).send({ ...versClientDTO(rows[0]), token });
});

app.post("/api/clients/connexion", async (req, reply) => {
  const { telephone, codePin } = req.body || {};
  const { rows } = await pool.query("SELECT * FROM clients WHERE telephone = $1", [telephone]);
  const client = rows[0];
  if (!client || !verifierMotDePasse(codePin || "", client.code_pin_hash)) {
    return reply.code(401).send({ erreur: "Numéro ou code incorrect." });
  }
  const token = id("tok");
  const { rows: maj } = await pool.query("UPDATE clients SET token = $1 WHERE id = $2 RETURNING *", [token, client.id]);
  return { ...versClientDTO(maj[0]), token };
});

app.get("/api/clients/moi", async (req, reply) => {
  const client = await requireClient(req, reply);
  if (!client) return;
  return versClientDTO(client);
});

app.get("/api/clients/moi/courses", async (req, reply) => {
  const client = await requireClient(req, reply);
  if (!client) return;
  const { rows } = await pool.query("SELECT * FROM rides WHERE client_id = $1 ORDER BY cree_le DESC LIMIT 50", [
    client.id,
  ]);
  return rows.map((r) => versRideDTO(r));
});

app.post("/api/clients/moi/adresses", async (req, reply) => {
  const client = await requireClient(req, reply);
  if (!client) return;
  const { label, zone, adresse, position } = req.body || {};
  if (!label || !zone) {
    return reply.code(400).send({ erreur: "label et zone sont requis." });
  }
  if (!ZONES.includes(zone)) {
    return reply.code(400).send({ erreur: `Zone inconnue. Zones valides : ${ZONES.join(", ")}.` });
  }
  const nouvelleAdresse = {
    label: String(label).slice(0, 40),
    zone,
    adresse: typeof adresse === "string" ? adresse.slice(0, 150) : "",
    position: position && typeof position.lat === "number" && typeof position.lng === "number" ? position : null,
  };
  const favorites = [...client.adresses_favorites, nouvelleAdresse].slice(0, 5); // 5 adresses max
  const { rows } = await pool.query("UPDATE clients SET adresses_favorites = $1 WHERE id = $2 RETURNING *", [
    JSON.stringify(favorites),
    client.id,
  ]);
  return versClientDTO(rows[0]);
});

app.delete("/api/clients/moi/adresses/:index", async (req, reply) => {
  const client = await requireClient(req, reply);
  if (!client) return;
  const index = parseInt(req.params.index, 10);
  const favorites = client.adresses_favorites.filter((_, i) => i !== index);
  const { rows } = await pool.query("UPDATE clients SET adresses_favorites = $1 WHERE id = $2 RETURNING *", [
    JSON.stringify(favorites),
    client.id,
  ]);
  return versClientDTO(rows[0]);
});

// ---------- Syndicats (cotisation forfaitaire par axe, en remplacement des péages au passage) ----------

function versSyndicatDTO(row) {
  return {
    id: row.id,
    nom: row.nom,
    zoneA: row.zone_a,
    zoneB: row.zone_b,
    tarifJour: row.tarif_jour,
    telephone: row.telephone,
    actif: row.actif,
  };
}

// Un axe est couvert si (zoneDepart,zoneArrivee) correspond au syndicat, dans un sens ou l'autre
function axeCouvert(syndicat, zoneDepart, zoneArrivee) {
  return (
    (zoneDepart === syndicat.zone_a && zoneArrivee === syndicat.zone_b) ||
    (zoneDepart === syndicat.zone_b && zoneArrivee === syndicat.zone_a)
  );
}

app.post("/api/admin/syndicats", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;
  const { nom, zoneA, zoneB, tarifJour, telephone, codePin } = req.body || {};
  if (!nom || !zoneA || !zoneB || !tarifJour || !telephone) {
    return reply.code(400).send({ erreur: "nom, zoneA, zoneB, tarifJour et telephone sont requis." });
  }
  if (!ZONES.includes(zoneA) || !ZONES.includes(zoneB)) {
    return reply.code(400).send({ erreur: `Zones invalides. Zones valides : ${ZONES.join(", ")}.` });
  }
  if (!/^\d{4}$/.test(codePin || "")) {
    return reply.code(400).send({ erreur: "codePin doit être composé de 4 chiffres." });
  }
  const { rows: existant } = await pool.query("SELECT id FROM syndicats WHERE telephone = $1", [telephone]);
  if (existant[0]) {
    return reply.code(409).send({ erreur: "Un syndicat est déjà enregistré avec ce numéro." });
  }
  const { rows } = await pool.query(
    `INSERT INTO syndicats (id, nom, zone_a, zone_b, tarif_jour, telephone, code_pin_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id("synd"), nom, zoneA, zoneB, parseInt(tarifJour, 10), telephone, hashMotDePasse(codePin)]
  );
  return reply.code(201).send(versSyndicatDTO(rows[0]));
});

app.get("/api/admin/syndicats", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;
  const { rows } = await pool.query("SELECT * FROM syndicats ORDER BY cree_le DESC");
  return rows.map(versSyndicatDTO);
});

app.post("/api/admin/syndicats/:syndicatId/desactiver", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;
  const { rows } = await pool.query("UPDATE syndicats SET actif = NOT actif WHERE id = $1 RETURNING *", [
    req.params.syndicatId,
  ]);
  if (!rows[0]) return reply.code(404).send({ erreur: "Syndicat introuvable." });
  return versSyndicatDTO(rows[0]);
});

app.post("/api/syndicats/connexion", async (req, reply) => {
  const { telephone, codePin } = req.body || {};
  const { rows } = await pool.query("SELECT * FROM syndicats WHERE telephone = $1", [telephone]);
  const syndicat = rows[0];
  if (!syndicat || !verifierMotDePasse(codePin || "", syndicat.code_pin_hash)) {
    return reply.code(401).send({ erreur: "Numéro ou code incorrect." });
  }
  const token = id("tok");
  const { rows: maj } = await pool.query("UPDATE syndicats SET token = $1 WHERE id = $2 RETURNING *", [
    token,
    syndicat.id,
  ]);
  return { ...versSyndicatDTO(maj[0]), token };
});

app.get("/api/syndicats/moi/cotisations", async (req, reply) => {
  const syndicat = await requireSyndicat(req, reply);
  if (!syndicat) return;
  const jour = typeof req.query.jour === "string" ? req.query.jour : new Date().toISOString().slice(0, 10);

  const { rows } = await pool.query(
    `SELECT c.*, ch.nom AS chauffeur_nom, ch.badge AS chauffeur_badge, ch.telephone AS chauffeur_telephone
     FROM cotisations c
     JOIN chauffeurs ch ON ch.id = c.chauffeur_id
     WHERE c.syndicat_id = $1 AND c.jour = $2
     ORDER BY c.paye ASC, ch.nom ASC`,
    [syndicat.id, jour]
  );

  const cotisations = rows.map((r) => ({
    id: r.id,
    chauffeurId: r.chauffeur_id,
    chauffeurNom: r.chauffeur_nom,
    chauffeurBadge: r.chauffeur_badge,
    chauffeurTelephone: r.chauffeur_telephone,
    jour: r.jour,
    montant: r.montant,
    paye: r.paye,
    payeLe: r.paye_le,
  }));

  return {
    syndicat: versSyndicatDTO(syndicat),
    jour,
    cotisations,
    totalAttendu: cotisations.reduce((s, c) => s + c.montant, 0),
    totalCollecte: cotisations.filter((c) => c.paye).reduce((s, c) => s + c.montant, 0),
  };
});

app.post("/api/syndicats/cotisations/:cotisationId/marquer-paye", async (req, reply) => {
  const syndicat = await requireSyndicat(req, reply);
  if (!syndicat) return;
  const { rows } = await pool.query(
    "UPDATE cotisations SET paye = true, paye_le = now() WHERE id = $1 AND syndicat_id = $2 RETURNING *",
    [req.params.cotisationId, syndicat.id]
  );
  if (!rows[0]) return reply.code(404).send({ erreur: "Cotisation introuvable." });
  return { marque: true };
});

// ---------- Référentiel ----------

app.get("/api/zones", async () => ZONES);

function versChauffeurDTO(row) {
  return {
    id: row.id,
    role: "chauffeur",
    nom: row.nom,
    telephone: row.telephone,
    zone: row.zone,
    statut: row.statut,
    badge: row.badge,
    vehicule: {
      id: `v_${row.id}`,
      chauffeurId: row.id,
      immatriculation: row.immatriculation,
      kitGpl: row.kit_gpl,
      dernierControle: row.dernier_controle,
    },
  };
}

app.get("/api/chauffeurs", async () => {
  const { rows } = await pool.query("SELECT * FROM chauffeurs ORDER BY cree_le");
  return rows.map(versChauffeurDTO);
});

app.post("/api/chauffeurs", async (req, reply) => {
  const { nom, telephone, zone, immatriculation, codePin } = req.body || {};
  if (!nom || !telephone || !zone || !immatriculation) {
    return reply.code(400).send({ erreur: "nom, telephone, zone et immatriculation sont requis." });
  }
  if (!/^\d{4}$/.test(codePin || "")) {
    return reply.code(400).send({ erreur: "codePin doit être composé de 4 chiffres." });
  }
  if (!ZONES.includes(zone)) {
    return reply.code(400).send({ erreur: `Zone inconnue. Zones valides : ${ZONES.join(", ")}.` });
  }
  const { rows: existant } = await pool.query("SELECT id FROM chauffeurs WHERE telephone = $1", [telephone]);
  if (existant[0]) {
    return reply.code(409).send({ erreur: "Un chauffeur est déjà enregistré avec ce numéro." });
  }
  const { rows: compte } = await pool.query("SELECT COUNT(*)::int AS n FROM chauffeurs");
  const badge = `SCM-${String(compte[0].n + 1).padStart(3, "0")}`;
  const chauffeurId = id("u");
  const token = id("tok");
  const { rows } = await pool.query(
    `INSERT INTO chauffeurs (id, nom, telephone, zone, statut, badge, immatriculation, kit_gpl, dernier_controle, code_pin_hash, token)
     VALUES ($1,$2,$3,$4,'en attente de validation',$5,$6,'à diagnostiquer',NULL,$7,$8) RETURNING *`,
    [chauffeurId, nom, telephone, zone, badge, immatriculation, hashMotDePasse(codePin), token]
  );
  return reply.code(201).send({ ...versChauffeurDTO(rows[0]), token });
});

app.post("/api/chauffeurs/connexion", async (req, reply) => {
  const { telephone, codePin } = req.body || {};
  const { rows } = await pool.query("SELECT * FROM chauffeurs WHERE telephone = $1", [telephone]);
  const chauffeur = rows[0];
  if (!chauffeur || !chauffeur.code_pin_hash || !verifierMotDePasse(codePin || "", chauffeur.code_pin_hash)) {
    return reply.code(401).send({ erreur: "Numéro ou code incorrect." });
  }
  const token = id("tok");
  const { rows: maj } = await pool.query("UPDATE chauffeurs SET token = $1 WHERE id = $2 RETURNING *", [
    token,
    chauffeur.id,
  ]);
  return { ...versChauffeurDTO(maj[0]), token };
});

app.get("/api/chauffeurs/moi", async (req, reply) => {
  const chauffeur = await requireChauffeur(req, reply);
  if (!chauffeur) return;
  return versChauffeurDTO(chauffeur);
});

app.post("/api/chauffeurs/:chauffeurId/valider", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;
  const { rows } = await pool.query(
    `UPDATE chauffeurs SET statut = 'actif', kit_gpl = 'posé' WHERE id = $1 RETURNING *`,
    [req.params.chauffeurId]
  );
  if (!rows[0]) return reply.code(404).send({ erreur: "Chauffeur introuvable." });
  return versChauffeurDTO(rows[0]);
});

app.delete("/api/chauffeurs/:chauffeurId", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;

  const { rows: coursesRows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM rides WHERE chauffeur_id = $1",
    [req.params.chauffeurId]
  );
  if (coursesRows[0].n > 0) {
    return reply.code(409).send({
      erreur: `Impossible de supprimer ce chauffeur : ${coursesRows[0].n} course(s) sont rattachées à son historique. La suppression est réservée aux chauffeurs sans course associée.`,
    });
  }

  const { rows } = await pool.query("DELETE FROM chauffeurs WHERE id = $1 RETURNING id", [req.params.chauffeurId]);
  if (!rows[0]) return reply.code(404).send({ erreur: "Chauffeur introuvable." });
  return { supprime: true, chauffeurId: req.params.chauffeurId };
});

app.get("/api/chauffeurs/:chauffeurId/solde", async (req, reply) => {
  const chauffeur = await requireChauffeur(req, reply);
  if (!chauffeur) return;
  if (chauffeur.id !== req.params.chauffeurId) {
    return reply.code(403).send({ erreur: "Vous ne pouvez consulter que votre propre solde." });
  }
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(commission),0)::int AS commission_due, COUNT(*)::int AS nb
     FROM rides WHERE chauffeur_id = $1 AND statut = 'terminee' AND mode_paiement = 'especes'`,
    [req.params.chauffeurId]
  );
  return { chauffeurId: req.params.chauffeurId, commissionDueEspeces: rows[0].commission_due, nbCourses: rows[0].nb };
});

app.get("/api/chauffeurs/:chauffeurId/gains", async (req, reply) => {
  const chauffeur = await requireChauffeur(req, reply);
  if (!chauffeur) return;
  if (chauffeur.id !== req.params.chauffeurId) {
    return reply.code(403).send({ erreur: "Vous ne pouvez consulter que vos propres gains." });
  }
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS nb, COALESCE(SUM(montant),0)::int AS ca,
            COALESCE(SUM(part_chauffeur),0)::int AS gains, COALESCE(SUM(commission),0)::int AS commission
     FROM rides WHERE chauffeur_id = $1 AND statut = 'terminee'`,
    [req.params.chauffeurId]
  );
  const r = rows[0];
  return {
    chauffeurId: req.params.chauffeurId,
    nbCourses: r.nb,
    chiffreAffaires: r.ca,
    gainsChauffeur: r.gains,
    commissionPlateforme: r.commission,
  };
});

// ---------- Courses ----------

function versRideDTO(row, chauffeur) {
  return {
    id: row.id,
    clientNom: row.client_nom,
    clientTelephone: row.client_telephone,
    zoneDepart: row.zone_depart,
    zoneArrivee: row.zone_arrivee,
    adresseArrivee: row.adresse_arrivee,
    adresseDepart: row.adresse_depart,
    positionArrivee: row.position_arrivee,
    nombrePassagers: row.nombre_passagers,
    position: row.position,
    arrets: row.arrets,
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    tarifBase: row.tarif_base,
    supplementArrets: row.supplement_arrets,
    montant: row.montant,
    statut: row.statut,
    chauffeurId: row.chauffeur_id,
    clientId: row.client_id,
    modePaiement: row.mode_paiement,
    commission: row.commission,
    partChauffeur: row.part_chauffeur,
    creeLe: row.cree_le,
    historique: row.historique,
    tempsAttenteMinutes: row.temps_attente_minutes,
    chauffeurArriveLe: row.chauffeur_arrive_le,
    chauffeurPositionArrivee: row.chauffeur_position_arrivee,
    arriveeDestinationLe: row.arrivee_destination_le,
    derniereRelanceLe: row.derniere_relance_le,
    heureArriveeEstimee: row.heure_arrivee_estimee,
    ...(chauffeur ? { chauffeur: versChauffeurDTO(chauffeur) } : {}),
  };
}

// Estimation du prix avant de valider la demande — ne crée aucune course
app.get("/api/devis", async (req, reply) => {
  const { zoneDepart, zoneArrivee, nombrePassagers, arrets, positionDepart, positionArrivee } = req.query;
  if (!zoneDepart || !zoneArrivee) {
    return reply.code(400).send({ erreur: "zoneDepart et zoneArrivee sont requis." });
  }
  const zonesValides = [...ZONES, ZONE_AUTRE];
  if (!zonesValides.includes(zoneDepart) || !zonesValides.includes(zoneArrivee)) {
    return reply.code(400).send({ erreur: `Zone inconnue. Zones valides : ${zonesValides.join(", ")}.` });
  }

  const parsePosition = (brut) => {
    try {
      const p = JSON.parse(brut);
      return p && typeof p.lat === "number" && typeof p.lng === "number" ? p : null;
    } catch {
      return null;
    }
  };
  const posDepart = positionDepart ? parsePosition(positionDepart) : null;
  const posArrivee = positionArrivee ? parsePosition(positionArrivee) : null;

  if (zoneDepart === ZONE_AUTRE && !posDepart) {
    return reply.code(400).send({ erreur: "Précisez la position exacte de départ sur la carte." });
  }
  if (zoneArrivee === ZONE_AUTRE && !posArrivee) {
    return reply.code(400).send({ erreur: "Précisez la position exacte d'arrivée sur la carte." });
  }

  let arretsZones = [];
  if (arrets) {
    try {
      const parse = JSON.parse(arrets);
      if (Array.isArray(parse)) {
        arretsZones = parse.filter((a) => a && ZONES.includes(a.zone)).slice(0, 3);
      }
    } catch {
      // arrets mal formé : ignoré, l'estimation se fait sans les arrêts
    }
  }

  const resultatTarif = tarif(zoneDepart, zoneArrivee, nombrePassagers, posDepart, posArrivee);
  if (!resultatTarif) {
    return reply.code(400).send({ erreur: "Impossible de calculer un tarif avec les positions fournies." });
  }
  const { montant: tarifBase, distanceKm: distanceTrajet } = resultatTarif;
  const supplement =
    zoneDepart !== ZONE_AUTRE && zoneArrivee !== ZONE_AUTRE ? supplementArrets(zoneDepart, zoneArrivee, arretsZones) : { total: 0, details: [] };

  return {
    distanceKm: distanceTrajet,
    tarifBase,
    supplementArrets: supplement.total,
    montant: tarifBase + supplement.total,
    detailArrets: supplement.details,
  };
});

app.post("/api/rides", async (req, reply) => {
  const { clientNom, clientTelephone, zoneDepart, zoneArrivee, adresseArrivee, adresseDepart, nombrePassagers, position, positionArrivee, arrets } =
    req.body || {};
  if (!clientNom || !clientTelephone || !zoneDepart || !zoneArrivee) {
    return reply.code(400).send({ erreur: "clientNom, clientTelephone, zoneDepart et zoneArrivee sont requis." });
  }
  const zonesValides = [...ZONES, ZONE_AUTRE];
  if (!zonesValides.includes(zoneDepart) || !zonesValides.includes(zoneArrivee)) {
    return reply.code(400).send({ erreur: `Zone inconnue. Zones valides : ${zonesValides.join(", ")}.` });
  }
  const clientConnecte = await clientOptionnel(req); // rattachement facultatif à un compte client
  const passagers = Math.min(4, Math.max(1, parseInt(nombrePassagers, 10) || 1));
  const positionValide =
    position && typeof position.lat === "number" && typeof position.lng === "number" ? position : null;
  const positionArriveeValide =
    positionArrivee && typeof positionArrivee.lat === "number" && typeof positionArrivee.lng === "number"
      ? positionArrivee
      : null;

  if (zoneDepart === ZONE_AUTRE && !positionValide) {
    return reply.code(400).send({ erreur: "Précisez votre position exacte de départ sur la carte (zone \"Autre\")." });
  }
  if (zoneArrivee === ZONE_AUTRE && !positionArriveeValide) {
    return reply.code(400).send({ erreur: "Précisez la position exacte d'arrivée sur la carte (zone \"Autre\")." });
  }

  const arretsValides =
    zoneDepart !== ZONE_AUTRE && zoneArrivee !== ZONE_AUTRE && Array.isArray(arrets)
      ? arrets.slice(0, 3).map((a) => ({
          nom: typeof a?.nom === "string" ? a.nom.slice(0, 60) : "",
          zone: ZONES.includes(a?.zone) ? a.zone : zoneDepart,
          lieu: typeof a?.lieu === "string" ? a.lieu.slice(0, 100) : "",
          position:
            a?.position && typeof a.position.lat === "number" && typeof a.position.lng === "number"
              ? a.position
              : null,
        }))
      : []; // pas d'arrêts multi-passagers possibles avec une zone "Autre" (calcul de détour non applicable)

  const resultatTarif = tarif(zoneDepart, zoneArrivee, passagers, positionValide, positionArriveeValide);
  if (!resultatTarif) {
    return reply.code(400).send({ erreur: "Impossible de calculer un tarif avec les positions fournies." });
  }
  const { montant: tarifBase, distanceKm: distanceTrajet } = resultatTarif;
  const supplement =
    zoneDepart !== ZONE_AUTRE && zoneArrivee !== ZONE_AUTRE ? supplementArrets(zoneDepart, zoneArrivee, arretsValides) : { total: 0, details: [] };
  const arretsAvecDetail = arretsValides.map((a) => {
    const detail = supplement.details.find((d) => d.zone === a.zone);
    return { ...a, distanceKm: detail?.distanceKm ?? null, surLeChemin: detail?.surLeChemin ?? true };
  });

  const rideId = id("ride");
  const historique = [{ statut: "demandee", horodatage: new Date().toISOString() }];

  const { rows } = await pool.query(
    `INSERT INTO rides
      (id, client_nom, client_telephone, zone_depart, zone_arrivee, adresse_arrivee, adresse_depart, nombre_passagers,
       position, position_arrivee, arrets, distance_km, tarif_base, supplement_arrets, montant, statut, historique, client_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'demandee',$16,$17)
     RETURNING *`,
    [
      rideId,
      clientNom,
      clientTelephone,
      zoneDepart,
      zoneArrivee,
      typeof adresseArrivee === "string" ? adresseArrivee.slice(0, 150) : "",
      typeof adresseDepart === "string" ? adresseDepart.slice(0, 150) : "",
      passagers,
      positionValide ? JSON.stringify(positionValide) : null,
      positionArriveeValide ? JSON.stringify(positionArriveeValide) : null,
      JSON.stringify(arretsAvecDetail),
      distanceTrajet,
      tarifBase,
      supplement.total,
      tarifBase + supplement.total,
      JSON.stringify(historique),
      clientConnecte?.id || null,
    ]
  );

  notifierChauffeursActifs({
    titre: "Nouvelle demande de course",
    corps: `${zoneDepart} → ${zoneArrivee} · ${rows[0].montant} FCFA`,
    rideId,
    role: "chauffeur",
  }).catch(() => {});

  return reply.code(201).send(versRideDTO(rows[0]));
});

async function chargerRideAvecChauffeur(rideId) {
  const { rows } = await pool.query("SELECT * FROM rides WHERE id = $1", [rideId]);
  const ride = rows[0];
  if (!ride) return null;
  let chauffeur = null;
  if (ride.chauffeur_id) {
    const { rows: cRows } = await pool.query("SELECT * FROM chauffeurs WHERE id = $1", [ride.chauffeur_id]);
    chauffeur = cRows[0] || null;
  }
  return versRideDTO(ride, chauffeur);
}

app.get("/api/rides/:rideId", async (req, reply) => {
  const dto = await chargerRideAvecChauffeur(req.params.rideId);
  if (!dto) return reply.code(404).send({ erreur: "Course introuvable." });
  return dto;
});

app.get("/api/rides", async (req) => {
  const { statut, zone, chauffeurId } = req.query;
  const conditions = [];
  const valeurs = [];
  if (statut) {
    valeurs.push(statut);
    conditions.push(`statut = $${valeurs.length}`);
  }
  if (zone) {
    valeurs.push(zone);
    conditions.push(`zone_depart = $${valeurs.length}`);
  }
  if (chauffeurId) {
    valeurs.push(chauffeurId);
    conditions.push(`chauffeur_id = $${valeurs.length}`);
  }

  // Si un chauffeur est connecté, on lui masque les demandes qu'il a déjà libérées/refusées
  const chauffeur = await chauffeurOptionnel(req);
  if (chauffeur) {
    valeurs.push(JSON.stringify([chauffeur.id]));
    conditions.push(`NOT (chauffeurs_refuses @> $${valeurs.length}::jsonb)`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  // Limite de sécurité : en cas de pic (demande >> chauffeurs disponibles), on ne renvoie que
  // les demandes les plus récentes plutôt que la liste entière, pour rester rapide pour tous.
  const limite = statut === "demandee" && !chauffeurId ? "LIMIT 50" : "";
  const { rows } = await pool.query(`SELECT * FROM rides ${where} ORDER BY cree_le DESC ${limite}`, valeurs);
  return rows.map((r) => versRideDTO(r));
});

app.post("/api/rides/:rideId/accepter", async (req, reply) => {
  const chauffeur = await requireChauffeur(req, reply);
  if (!chauffeur) return;
  if (chauffeur.statut !== "actif") {
    return reply
      .code(403)
      .send({ erreur: "Inscription en attente de validation avant la première course." });
  }

  // Mise à jour atomique : n'accepte que si la course est encore "demandee" (évite les doubles acceptations)
  const { rows } = await pool.query(
    `UPDATE rides
     SET statut = 'confirmee', chauffeur_id = $1,
         historique = historique || $2::jsonb
     WHERE id = $3 AND statut = 'demandee'
     RETURNING *`,
    [chauffeur.id, JSON.stringify([{ statut: "confirmee", horodatage: new Date().toISOString() }]), req.params.rideId]
  );
  if (!rows[0]) {
    const { rows: check } = await pool.query("SELECT id FROM rides WHERE id = $1", [req.params.rideId]);
    if (!check[0]) return reply.code(404).send({ erreur: "Course introuvable." });
    return reply.code(409).send({ erreur: "Cette course n'est plus disponible." });
  }

  const tempsAttente = estimerTempsAttente(chauffeur.zone, rows[0].zone_depart, rows[0].position);
  const heureArrivee = new Date(Date.now() + tempsAttente * 60000);
  const { rows: rowsFinal } = await pool.query(
    `UPDATE rides SET temps_attente_minutes = $1, heure_arrivee_estimee = $2 WHERE id = $3 RETURNING *`,
    [tempsAttente, heureArrivee.toISOString(), req.params.rideId]
  );

  notifierClientDeLaCourse(req.params.rideId, {
    titre: "Chauffeur en route",
    corps: `${chauffeur.nom} arrive dans ≈${tempsAttente} min.`,
    rideId: req.params.rideId,
    role: "client",
  }).catch(() => {});

  // Cotisation syndicale forfaitaire du jour, si cet axe est couvert par un accord — une seule fois
  // par chauffeur et par jour quel que soit le nombre de trajets sur l'axe (contrainte UNIQUE en base)
  try {
    const { rows: syndicatsActifs } = await pool.query("SELECT * FROM syndicats WHERE actif = true");
    const syndicatConcerne = syndicatsActifs.find((s) => axeCouvert(s, rows[0].zone_depart, rows[0].zone_arrivee));
    if (syndicatConcerne) {
      await pool.query(
        `INSERT INTO cotisations (id, syndicat_id, chauffeur_id, jour, montant)
         VALUES ($1,$2,$3,CURRENT_DATE,$4)
         ON CONFLICT (syndicat_id, chauffeur_id, jour) DO NOTHING`,
        [id("cot"), syndicatConcerne.id, chauffeur.id, syndicatConcerne.tarif_jour]
      );
    }
  } catch {
    // Ne bloque jamais l'acceptation de la course pour un souci lié à la cotisation
  }

  return versRideDTO(rowsFinal[0], chauffeur);
});

// Le chauffeur renonce à une course déjà acceptée : elle repart dans le pool, disponible pour un autre chauffeur
app.post("/api/rides/:rideId/liberer", async (req, reply) => {
  const chauffeur = await requireChauffeur(req, reply);
  if (!chauffeur) return;

  const { rows } = await pool.query(
    `UPDATE rides
     SET statut = 'demandee', chauffeur_id = NULL, temps_attente_minutes = NULL, heure_arrivee_estimee = NULL,
         historique = historique || $1::jsonb,
         chauffeurs_refuses = chauffeurs_refuses || $4::jsonb
     WHERE id = $2 AND chauffeur_id = $3 AND statut = 'confirmee'
     RETURNING *`,
    [
      JSON.stringify([{ statut: "demandee", horodatage: new Date().toISOString(), note: "libérée par le chauffeur" }]),
      req.params.rideId,
      chauffeur.id,
      JSON.stringify([chauffeur.id]),
    ]
  );
  if (!rows[0]) {
    return reply.code(409).send({ erreur: "Cette course ne peut pas être libérée (elle ne vous est peut-être plus attribuée)." });
  }
  return versRideDTO(rows[0]);
});

// Le chauffeur ne parvient pas à joindre/trouver le client : annule directement + signalement automatique
app.post("/api/rides/:rideId/client-introuvable", async (req, reply) => {
  const chauffeur = await requireChauffeur(req, reply);
  if (!chauffeur) return;

  const { rows } = await pool.query(
    `UPDATE rides
     SET statut = 'annulee', historique = historique || $1::jsonb
     WHERE id = $2 AND chauffeur_id = $3 AND statut = 'confirmee'
     RETURNING *`,
    [
      JSON.stringify([{ statut: "annulee", horodatage: new Date().toISOString(), note: "client introuvable" }]),
      req.params.rideId,
      chauffeur.id,
    ]
  );
  if (!rows[0]) {
    return reply.code(409).send({ erreur: "Cette course ne peut pas être annulée pour ce motif dans son état actuel." });
  }

  await pool.query(
    `INSERT INTO signalements (id, ride_id, auteur, message) VALUES ($1,$2,'chauffeur',$3)`,
    [id("sig"), req.params.rideId, `Client introuvable au point de prise en charge (${rows[0].zone_depart}).`]
  );

  notifierClientDeLaCourse(req.params.rideId, {
    titre: "Course annulée",
    corps: "Notre chauffeur n'a pas réussi à vous joindre. N'hésitez pas à refaire une demande.",
    rideId: req.params.rideId,
    role: "client",
  }).catch(() => {});

  return versRideDTO(rows[0]);
});

// Le client ne confirme jamais alors que le chauffeur est arrivé à destination : sortie de secours pour le chauffeur
app.post("/api/rides/:rideId/client-ne-confirme-pas", async (req, reply) => {
  const chauffeur = await requireChauffeur(req, reply);
  if (!chauffeur) return;

  const { rows } = await pool.query(
    `UPDATE rides
     SET statut = 'annulee', historique = historique || $1::jsonb
     WHERE id = $2 AND chauffeur_id = $3 AND statut = 'arrivee'
     RETURNING *`,
    [
      JSON.stringify([{ statut: "annulee", horodatage: new Date().toISOString(), note: "client ne confirme pas" }]),
      req.params.rideId,
      chauffeur.id,
    ]
  );
  if (!rows[0]) {
    return reply.code(409).send({ erreur: "Cette course ne peut pas être annulée pour ce motif dans son état actuel." });
  }

  await pool.query(
    `INSERT INTO signalements (id, ride_id, auteur, message) VALUES ($1,$2,'chauffeur',$3)`,
    [id("sig"), req.params.rideId, `Le client n'a jamais confirmé/payé à destination (${rows[0].zone_arrivee}).`]
  );

  notifierClientDeLaCourse(req.params.rideId, {
    titre: "Course annulée",
    corps: "Course annulée faute de confirmation. Contactez-nous si besoin.",
    rideId: req.params.rideId,
    role: "client",
  }).catch(() => {});

  return versRideDTO(rows[0]);
});

// Le chauffeur signale qu'il est arrivé au point de prise en charge du client
app.post("/api/rides/:rideId/arrivee-client", async (req, reply) => {
  const chauffeur = await requireChauffeur(req, reply);
  if (!chauffeur) return;

  const { position } = req.body || {};
  const positionValide =
    position && typeof position.lat === "number" && typeof position.lng === "number" ? position : null;

  const { rows } = await pool.query(
    `UPDATE rides SET chauffeur_arrive_le = now(), chauffeur_position_arrivee = $1, historique = historique || $2::jsonb
     WHERE id = $3 AND chauffeur_id = $4 AND statut = 'confirmee' RETURNING *`,
    [
      positionValide ? JSON.stringify(positionValide) : null,
      JSON.stringify([{ statut: "chauffeur_arrive", horodatage: new Date().toISOString() }]),
      req.params.rideId,
      chauffeur.id,
    ]
  );
  if (!rows[0]) return reply.code(409).send({ erreur: "Impossible de marquer l'arrivée pour cette course." });

  // Écart suspect entre la position déclarée du chauffeur et celle partagée par le client : signalement automatique
  const positionClient = rows[0].position;
  let ecartKm = null;
  if (positionValide && positionClient) {
    ecartKm = distanceEntrePoints(positionValide, positionClient);
    if (ecartKm > 0.05) {
      const ecartLisible = ecartKm < 1 ? `${Math.round(ecartKm * 1000)} m` : `${ecartKm.toFixed(1)} km`;
      await pool.query(`INSERT INTO signalements (id, ride_id, auteur, message) VALUES ($1,$2,'systeme',$3)`, [
        id("sig"),
        req.params.rideId,
        `Écart de ${ecartLisible} entre la position déclarée du chauffeur à l'arrivée et celle partagée par le client — à vérifier.`,
      ]);
    }
  }

  const corpsClient =
    ecartKm !== null && ecartKm <= 0.05
      ? `${chauffeur.nom} est arrivé — position vérifiée, il est bien sur place.`
      : `${chauffeur.nom} vous attend au point de prise en charge.`;

  const payloadClient = {
    titre: ecartKm !== null && ecartKm <= 0.05 ? "✅ Le chauffeur est arrivé" : "Le chauffeur est arrivé",
    corps: corpsClient,
    rideId: req.params.rideId,
    role: "client",
  };
  notifierClientDeLaCourse(req.params.rideId, payloadClient).catch(() => {});
  notifierChauffeur(chauffeur.id, {
    titre: "Arrivée confirmée",
    corps: "Le client a été notifié.",
    rideId: req.params.rideId,
    role: "chauffeur",
  }).catch(() => {});

  return versRideDTO(rows[0], chauffeur);
});

// Le chauffeur signale être arrivé à destination — reste à confirmer/payer côté client
app.post("/api/rides/:rideId/arrivee-destination", async (req, reply) => {
  const chauffeur = await requireChauffeur(req, reply);
  if (!chauffeur) return;
  const { rows } = await pool.query(
    `UPDATE rides SET statut = 'arrivee', arrivee_destination_le = now(), historique = historique || $1::jsonb
     WHERE id = $2 AND chauffeur_id = $3 AND statut = 'confirmee' RETURNING *`,
    [JSON.stringify([{ statut: "arrivee", horodatage: new Date().toISOString() }]), req.params.rideId, chauffeur.id]
  );
  if (!rows[0]) return reply.code(409).send({ erreur: "Impossible de marquer l'arrivée à destination pour cette course." });

  const payloadClient = {
    titre: "Arrivée à destination",
    corps: "Merci de confirmer et de régler la course.",
    rideId: req.params.rideId,
    role: "client",
  };
  notifierClientDeLaCourse(req.params.rideId, payloadClient).catch(() => {});
  notifierChauffeur(chauffeur.id, {
    titre: "Arrivée à destination confirmée",
    corps: "En attente de la confirmation du client.",
    rideId: req.params.rideId,
    role: "chauffeur",
  }).catch(() => {});

  return versRideDTO(rows[0], chauffeur);
});

const DELAI_MIN_ENTRE_RELANCES_MS = 60_000; // 1 minute entre deux relances, pour ne pas harceler le client

// Le chauffeur relance le client qui met du temps à confirmer et payer, une fois arrivé à destination
app.post("/api/rides/:rideId/relancer-client", async (req, reply) => {
  const chauffeur = await requireChauffeur(req, reply);
  if (!chauffeur) return;

  const { rows: existant } = await pool.query(
    `SELECT * FROM rides
     WHERE id = $1 AND chauffeur_id = $2
       AND (statut = 'arrivee' OR (statut = 'confirmee' AND chauffeur_arrive_le IS NOT NULL))`,
    [req.params.rideId, chauffeur.id]
  );
  const ride = existant[0];
  if (!ride) return reply.code(409).send({ erreur: "Impossible de relancer le client pour cette course." });

  if (ride.derniere_relance_le) {
    const ecouleMs = Date.now() - new Date(ride.derniere_relance_le).getTime();
    if (ecouleMs < DELAI_MIN_ENTRE_RELANCES_MS) {
      const attenteSec = Math.ceil((DELAI_MIN_ENTRE_RELANCES_MS - ecouleMs) / 1000);
      return reply.code(429).send({ erreur: `Merci de patienter encore ${attenteSec}s avant une nouvelle relance.` });
    }
  }

  const { rows } = await pool.query(
    "UPDATE rides SET derniere_relance_le = now() WHERE id = $1 RETURNING *",
    [req.params.rideId]
  );

  const corps =
    ride.statut === "arrivee"
      ? "Votre chauffeur attend toujours votre confirmation et le règlement de la course."
      : `${chauffeur.nom} est arrivé au point de prise en charge et vous attend toujours.`;

  notifierClientDeLaCourse(req.params.rideId, {
    titre: "Rappel — course en attente",
    corps,
    rideId: req.params.rideId,
    role: "client",
  }).catch(() => {});

  return versRideDTO(rows[0], chauffeur);
});

app.post("/api/rides/:rideId/terminer", async (req, reply) => {
  const { modePaiement } = req.body || {};
  if (!["mobile_money", "especes"].includes(modePaiement)) {
    return reply.code(400).send({ erreur: "modePaiement doit être 'mobile_money' ou 'especes'." });
  }
  const { rows: existant } = await pool.query("SELECT * FROM rides WHERE id = $1", [req.params.rideId]);
  const ride = existant[0];
  if (!ride) return reply.code(404).send({ erreur: "Course introuvable." });
  if (!["confirmee", "arrivee"].includes(ride.statut)) {
    return reply.code(409).send({ erreur: "Cette course ne peut pas être terminée depuis son statut actuel." });
  }

  const commission = Math.round(ride.montant * COMMISSION_RATE);
  const partChauffeur = ride.montant - commission;

  const { rows } = await pool.query(
    `UPDATE rides
     SET statut = 'terminee', mode_paiement = $1, commission = $2, part_chauffeur = $3,
         historique = historique || $4::jsonb
     WHERE id = $5
     RETURNING *`,
    [
      modePaiement,
      commission,
      partChauffeur,
      JSON.stringify([{ statut: "terminee", horodatage: new Date().toISOString() }]),
      req.params.rideId,
    ]
  );

  const corpsCommun = `Paiement (${modePaiement === "especes" ? "espèces" : "Mobile Money"}) confirmé — ${ride.montant} FCFA.`;
  notifierClientDeLaCourse(req.params.rideId, {
    titre: "Course terminée",
    corps: corpsCommun,
    rideId: req.params.rideId,
    role: "client",
  }).catch(() => {});
  if (ride.chauffeur_id) {
    notifierChauffeur(ride.chauffeur_id, {
      titre: "Course terminée",
      corps: corpsCommun,
      rideId: req.params.rideId,
      role: "chauffeur",
    }).catch(() => {});
  }

  return versRideDTO(rows[0]);
});

app.post("/api/rides/:rideId/annuler", async (req, reply) => {
  const { rows: existant } = await pool.query("SELECT * FROM rides WHERE id = $1", [req.params.rideId]);
  const ride = existant[0];
  if (!ride) return reply.code(404).send({ erreur: "Course introuvable." });
  if (["terminee", "annulee"].includes(ride.statut)) {
    return reply.code(409).send({ erreur: "Cette course ne peut plus être annulée." });
  }
  const { rows } = await pool.query(
    `UPDATE rides SET statut = 'annulee', historique = historique || $1::jsonb WHERE id = $2 RETURNING *`,
    [JSON.stringify([{ statut: "annulee", horodatage: new Date().toISOString() }]), req.params.rideId]
  );
  return versRideDTO(rows[0]);
});

app.post("/api/rides/:rideId/signaler", async (req, reply) => {
  const { auteur, message } = req.body || {};
  if (!["client", "chauffeur"].includes(auteur) || !message || !message.trim()) {
    return reply.code(400).send({ erreur: "auteur ('client' ou 'chauffeur') et message sont requis." });
  }
  const { rows: existant } = await pool.query("SELECT id FROM rides WHERE id = $1", [req.params.rideId]);
  if (!existant[0]) return reply.code(404).send({ erreur: "Course introuvable." });

  await pool.query(
    `INSERT INTO signalements (id, ride_id, auteur, message) VALUES ($1,$2,$3,$4)`,
    [id("sig"), req.params.rideId, auteur, message.trim().slice(0, 500)]
  );
  return reply.code(201).send({ enregistre: true });
});

// Le client conteste l'arrivée annoncée par le chauffeur ("il n'est pas encore là")
app.post("/api/rides/:rideId/contester-arrivee", async (req, reply) => {
  const { rows: existant } = await pool.query("SELECT * FROM rides WHERE id = $1", [req.params.rideId]);
  const ride = existant[0];
  if (!ride) return reply.code(404).send({ erreur: "Course introuvable." });
  if (!ride.chauffeur_arrive_le) {
    return reply.code(409).send({ erreur: "Aucune arrivée déclarée à contester pour cette course." });
  }

  await pool.query(
    `INSERT INTO signalements (id, ride_id, auteur, message) VALUES ($1,$2,'client',$3)`,
    [id("sig"), req.params.rideId, "Le client conteste l'arrivée annoncée par le chauffeur : il ne serait pas encore sur place."]
  );

  if (ride.chauffeur_id) {
    notifierChauffeur(ride.chauffeur_id, {
      titre: "Le client conteste votre arrivée",
      corps: "Le client indique que vous n'êtes pas encore sur place.",
      rideId: req.params.rideId,
      role: "chauffeur",
    }).catch(() => {});
  }

  return { enregistre: true };
});

app.get("/api/admin/signalements", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;
  const { rows } = await pool.query(
    `SELECT s.*, r.zone_depart, r.zone_arrivee, r.client_nom
     FROM signalements s LEFT JOIN rides r ON r.id = s.ride_id
     ORDER BY s.cree_le DESC LIMIT 50`
  );
  return rows.map((s) => ({
    id: s.id,
    rideId: s.ride_id,
    auteur: s.auteur,
    message: s.message,
    traite: s.traite,
    creeLe: s.cree_le,
    zoneDepart: s.zone_depart,
    zoneArrivee: s.zone_arrivee,
    clientNom: s.client_nom,
  }));
});

app.post("/api/admin/signalements/:signalementId/traiter", async (req, reply) => {
  const demandeur = await requireAdmin(req, reply);
  if (!demandeur) return;
  await pool.query("UPDATE signalements SET traite = true WHERE id = $1", [req.params.signalementId]);
  return { traite: true };
});

// ---------- Notifications push (fonctionnent même appli fermée) ----------

app.get("/api/push/cle-publique", async () => ({ clePublique: clePublique() }));

app.post("/api/push/abonner-chauffeur", async (req, reply) => {
  const chauffeur = await requireChauffeur(req, reply);
  if (!chauffeur) return;
  const { subscription } = req.body || {};
  if (!subscription?.endpoint || !subscription?.keys) {
    return reply.code(400).send({ erreur: "subscription invalide." });
  }
  await enregistrerAbonnement({ chauffeurId: chauffeur.id, subscription });
  return { abonne: true };
});

app.post("/api/push/abonner-course/:rideId", async (req, reply) => {
  const { subscription } = req.body || {};
  if (!subscription?.endpoint || !subscription?.keys) {
    return reply.code(400).send({ erreur: "subscription invalide." });
  }
  const { rows } = await pool.query("SELECT id FROM rides WHERE id = $1", [req.params.rideId]);
  if (!rows[0]) return reply.code(404).send({ erreur: "Course introuvable." });
  await enregistrerAbonnement({ rideId: req.params.rideId, subscription });
  return { abonne: true };
});

app.get("/api/health", async () => ({ ok: true }));

const port = process.env.PORT || 8787;

initDb()
  .then(() => {
    app.listen({ port, host: "0.0.0.0" }).then(() => {
      console.log(`Scotrans API (PostgreSQL) sur http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("Échec de l'initialisation de la base de données :", err);
    process.exit(1);
  });
