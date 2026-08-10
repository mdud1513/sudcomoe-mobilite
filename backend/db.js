import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { nanoid } from "nanoid";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "data.json");
const adapter = new JSONFile(file);
const defaultData = {
  users: [
    { id: "u_driver1", role: "chauffeur", nom: "Kouassi Yao", telephone: "0707000001", zone: "Yaou", statut: "actif", badge: "SCM-001" },
    { id: "u_driver2", role: "chauffeur", nom: "Aka Brou", telephone: "0707000002", zone: "Bonoua", statut: "actif", badge: "SCM-002" },
    { id: "u_driver3", role: "chauffeur", nom: "Diomande Sekou", telephone: "0707000003", zone: "Grand-Bassam", statut: "actif", badge: "SCM-003" },
  ],
  vehicles: [
    { id: "v_1", chauffeurId: "u_driver1", immatriculation: "CI-1234-AB", kitGpl: "posé", dernierControle: "2026-06-01" },
    { id: "v_2", chauffeurId: "u_driver2", immatriculation: "CI-5678-CD", kitGpl: "posé", dernierControle: "2026-05-15" },
    { id: "v_3", chauffeurId: "u_driver3", immatriculation: "CI-9012-EF", kitGpl: "non posé", dernierControle: null },
  ],
  rides: [],
  admins: [],
};

export const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;
await db.write();

export function id(prefix) {
  return `${prefix}_${nanoid(8)}`;
}
