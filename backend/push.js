import webpush from "web-push";
import { pool, id } from "./db.js";

let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  const cles = webpush.generateVAPIDKeys();
  VAPID_PUBLIC_KEY = cles.publicKey;
  VAPID_PRIVATE_KEY = cles.privateKey;
  console.warn(
    "VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY absents des variables d'environnement — clés temporaires générées. " +
      "Définissez-les sur Render pour que les abonnements aux notifications survivent aux redéploiements."
  );
}

webpush.setVapidDetails("mailto:contact@sudcomoe-mobilite.example", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export function clePublique() {
  return VAPID_PUBLIC_KEY;
}

export async function enregistrerAbonnement({ chauffeurId, rideId, adminId, subscription }) {
  await pool.query(
    `INSERT INTO push_subscriptions (id, chauffeur_id, ride_id, admin_id, endpoint, p256dh, auth)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (endpoint) DO UPDATE SET chauffeur_id = $2, ride_id = $3, admin_id = $4, p256dh = $6, auth = $7`,
    [id("push"), chauffeurId || null, rideId || null, adminId || null, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
  );
  console.log(`[push] Abonnement enregistré (chauffeurId=${chauffeurId || "n/a"}, rideId=${rideId || "n/a"}, adminId=${adminId || "n/a"}).`);
}

async function envoyerA(rows, payload) {
  if (rows.length === 0) {
    console.warn(`[push] Aucun abonnement trouvé pour la notification "${payload.titre}" (rideId=${payload.rideId || "n/a"}).`);
    return;
  }
  const texte = JSON.stringify(payload);
  await Promise.all(
    rows.map(async (r) => {
      const subscription = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
      try {
        await webpush.sendNotification(subscription, texte);
        console.log(`[push] Notification "${payload.titre}" envoyée avec succès à ${r.endpoint.slice(0, 60)}...`);
      } catch (err) {
        console.error(
          `[push] Échec d'envoi vers ${r.endpoint.slice(0, 60)}... — code ${err.statusCode || "?"} : ${err.body || err.message}`
        );
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [r.endpoint]);
          console.warn("[push] Abonnement expiré supprimé de la base.");
        }
      }
    })
  );
}

export async function notifierChauffeursActifs(payload) {
  const { rows } = await pool.query(
    `SELECT ps.* FROM push_subscriptions ps
     JOIN chauffeurs c ON c.id = ps.chauffeur_id
     WHERE c.statut = 'actif'`
  );
  await envoyerA(rows, payload);
}

export async function notifierClientDeLaCourse(rideId, payload) {
  const { rows } = await pool.query("SELECT * FROM push_subscriptions WHERE ride_id = $1", [rideId]);
  await envoyerA(rows, payload);
}

export async function notifierChauffeur(chauffeurId, payload) {
  const { rows } = await pool.query("SELECT * FROM push_subscriptions WHERE chauffeur_id = $1", [chauffeurId]);
  await envoyerA(rows, payload);
}

export async function notifierAdmins(payload) {
  const { rows } = await pool.query("SELECT * FROM push_subscriptions WHERE admin_id IS NOT NULL");
  await envoyerA(rows, payload);
}
