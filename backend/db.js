import pg from "pg";
import { customAlphabet } from "nanoid";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquant — définissez cette variable d'environnement avant de démarrer le serveur.");
  process.exit(1);
}

// Render (et la plupart des hébergeurs Postgres managés) exigent SSL, mais avec un certificat
// auto-signé côté interne : on désactive la vérification stricte plutôt que de gérer un CA custom.
const utiliseSSL = /render\.com|amazonaws\.com|neon\.tech|supabase\.co/.test(process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: utiliseSSL ? { rejectUnauthorized: false } : false,
});

const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 8);
export function id(prefix) {
  return `${prefix}_${nanoid()}`;
}

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chauffeurs (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      telephone TEXT UNIQUE NOT NULL,
      zone TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'en attente de validation',
      badge TEXT NOT NULL,
      immatriculation TEXT,
      kit_gpl TEXT,
      dernier_controle TEXT,
      code_pin_hash TEXT,
      token TEXT,
      cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Ajoute les colonnes si la table existait déjà avant cette mise à jour (migration douce, sans perte de données)
  await pool.query(`ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS code_pin_hash TEXT;`);
  await pool.query(`ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS token TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rides (
      id TEXT PRIMARY KEY,
      client_nom TEXT NOT NULL,
      client_telephone TEXT NOT NULL,
      zone_depart TEXT NOT NULL,
      zone_arrivee TEXT NOT NULL,
      adresse_arrivee TEXT DEFAULT '',
      nombre_passagers INT NOT NULL DEFAULT 1,
      position JSONB,
      arrets JSONB NOT NULL DEFAULT '[]',
      distance_km NUMERIC,
      tarif_base INT,
      supplement_arrets INT DEFAULT 0,
      montant INT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'demandee',
      chauffeur_id TEXT REFERENCES chauffeurs(id),
      mode_paiement TEXT,
      commission INT,
      part_chauffeur INT,
      cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
      historique JSONB NOT NULL DEFAULT '[]',
      temps_attente_minutes INT,
      heure_arrivee_estimee TIMESTAMPTZ
    );
  `);

  await pool.query(`ALTER TABLE rides ADD COLUMN IF NOT EXISTS temps_attente_minutes INT;`);
  await pool.query(`ALTER TABLE rides ADD COLUMN IF NOT EXISTS heure_arrivee_estimee TIMESTAMPTZ;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      telephone TEXT UNIQUE NOT NULL,
      mot_de_passe_hash TEXT NOT NULL,
      token TEXT,
      cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL,
      telephone TEXT UNIQUE NOT NULL,
      code_pin_hash TEXT NOT NULL,
      token TEXT,
      adresses_favorites JSONB NOT NULL DEFAULT '[]',
      cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`ALTER TABLE rides ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES clients(id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS signalements (
      id TEXT PRIMARY KEY,
      ride_id TEXT REFERENCES rides(id),
      auteur TEXT NOT NULL,
      message TEXT NOT NULL,
      traite BOOLEAN NOT NULL DEFAULT false,
      cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Semis des 3 chauffeurs de démonstration, uniquement si la table est vide (premier démarrage)
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM chauffeurs");
  if (rows[0].n === 0) {
    const demo = [
      ["u_driver1", "Kouassi Yao", "0707000001", "Yaou", "actif", "SCM-001", "CI-1234-AB", "posé", "2026-06-01"],
      ["u_driver2", "Aka Brou", "0707000002", "Bonoua", "actif", "SCM-002", "CI-5678-CD", "posé", "2026-05-15"],
      ["u_driver3", "Diomande Sekou", "0707000003", "Grand-Bassam", "actif", "SCM-003", "CI-9012-EF", "non posé", null],
    ];
    for (const d of demo) {
      await pool.query(
        `INSERT INTO chauffeurs (id, nom, telephone, zone, statut, badge, immatriculation, kit_gpl, dernier_controle)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        d
      );
    }
    console.log("Chauffeurs de démonstration insérés (premier démarrage).");
  }
}
