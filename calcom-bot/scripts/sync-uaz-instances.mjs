/**
 * Importa instâncias UazAPI para .uaz/instances.json (painel WhatsApp).
 *
 * Uso:
 *   node scripts/sync-uaz-instances.mjs
 *   node scripts/sync-uaz-instances.mjs --names ludmyla,monique_castro
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { loadEnv } from "../src/env.mjs";

loadEnv();

const DEFAULT_TARGETS = [
  { label: "Ludmyla Altieri", evo: "ludmyla" },
  { label: "Anderson (Gonçalves & Pardini)", evo: "gonçalves_&_pardini_odontologia_ltda" },
  { label: "Juliana Teixeira", evo: "juliana_teixeira" },
  { label: "Juliana Teixeira 2", evo: "juliana_teixeira_2" },
  { label: "Dr Leonardo Beraldo", evo: "leo_beraldo" },
  { label: "Dr Rosley Silva", evo: "dr_rosley_silva" },
  { label: "Gustavo Faria", evo: "gustavo_faria" },
  { label: "Clifferson Santos", evo: "medical_home_oikos" },
  { label: "Monique Castro", evo: "monique_castro" },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--")) {
      args[key.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function fetchUazInstances() {
  const base = (process.env.ServerURLUazapi || process.env.UAZAPI_URL || "").replace(/\/+$/, "");
  const admin = process.env.AdminTokenUazapi || process.env.UAZAPI_ADMIN_TOKEN;
  if (!base || !admin) throw new Error("ServerURLUazapi e AdminTokenUazapi são obrigatórios no .env");

  const res = await fetch(`${base}/instance/all`, {
    headers: { admintoken: admin, "Content-Type": "application/json" },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

function loadExisting() {
  const path = join(process.cwd(), ".uaz", "instances.json");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

const args = parseArgs(process.argv);
let targets = DEFAULT_TARGETS;

if (args.names) {
  const names = args.names.split(",").map((s) => s.trim()).filter(Boolean);
  targets = names.map((evo) => ({ label: evo, evo }));
}

const uazAll = await fetchUazInstances();
const existing = loadExisting();
const now = new Date().toISOString();
const imported = [];
const missing = [];

for (const t of targets) {
  const match = uazAll.find((i) => i.name === t.evo);
  if (!match?.token) {
    missing.push(`${t.label} (${t.evo})`);
    continue;
  }
  const prev = existing.find((i) => i.name === match.name || i.token === match.token);
  imported.push({
    id: match.id,
    name: match.name,
    displayName: t.label !== t.evo ? t.label : prev?.displayName || match.profileName || match.name,
    token: match.token,
    status: match.status,
    profileName: match.profileName || null,
    owner: match.owner || null,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  });
}

const dir = join(process.cwd(), ".uaz");
mkdirSync(dir, { recursive: true });
const outPath = join(dir, "instances.json");
writeFileSync(outPath, JSON.stringify(imported, null, 2), "utf8");

console.log(`Salvo em ${outPath}`);
console.log(`Importadas: ${imported.length}`);
imported.forEach((i) => console.log(`  • ${i.displayName} — ${i.status} (${i.name})`));
if (missing.length) {
  console.log(`Não encontradas na UazAPI: ${missing.join(", ")}`);
  process.exitCode = 1;
}
