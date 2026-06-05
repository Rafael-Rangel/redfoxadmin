import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { loadEnv } from "./env.mjs";
import { analyzeIntake, answerFollowUp } from "./groq-agent.mjs";
import { buildSummary } from "./intake-schema.mjs";
import {
  initInstance,
  listAllInstances,
  connectInstance,
  getInstanceStatus,
  configureWebhook,
} from "./uazapi.mjs";
import { listWebhookEnvironments, resolveWebhookUrl } from "./webhook-config.mjs";
import {
  listProfiles,
  getProfile,
  updateProfile,
  listAuthUsers,
  getAuthUser,
  createAuthUserWithProfile,
  updateAuthUser,
  deactivateAuthUser,
  activateAuthUser,
  linkAuthUserToProfile,
  filterAuthUsers,
  PROFILE_LIST_COLUMNS,
} from "./supabase-admin.mjs";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PUBLIC = join(ROOT, "public");
const INTAKE_DIR = process.env.VERCEL ? join("/tmp", ".intake") : join(ROOT, ".intake");
const UAZ_DIR = process.env.VERCEL ? join("/tmp", ".uaz") : join(ROOT, ".uaz");
const PORT = Number(process.env.INTAKE_PORT) || 3781;

const sessions = new Map();

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
  });
}

function getSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, { questionnaire: "", result: null });
  }
  return sessions.get(id);
}

function saveIntakeJson(sessionId, session) {
  ensureDir(INTAKE_DIR);
  const path = join(INTAKE_DIR, `${sessionId}.json`);
  const payload = {
    config: session.result.config,
    intake_raw: session.questionnaire,
    intake_parsed: session.result,
    extras: session.result.config?.extras || {},
  };
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
  return path;
}

function instancesPath() {
  ensureDir(UAZ_DIR);
  return join(UAZ_DIR, "instances.json");
}

function normalizeUazInstance(inst) {
  return {
    id: inst?.id || inst?.instanceId || inst?.name,
    name: inst?.name,
    displayName: inst?.displayName || inst?.profileName,
    token: inst?.token || inst?.instanceToken,
    status: inst?.status || inst?.instance?.status,
    profileName: inst?.profileName,
    owner: inst?.owner,
    profileId: inst?.profileId || null,
    status_raw: inst?.status_raw || inst,
  };
}

function loadInstances() {
  try {
    const p = instancesPath();
    if (!existsSync(p)) return [];
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return [];
  }
}

async function loadInstancesRemote() {
  const raw = await listAllInstances();
  const list = Array.isArray(raw) ? raw : raw?.instances || [];
  return list.map((inst) => normalizeUazInstance(inst));
}

function saveInstances(list) {
  const p = instancesPath();
  writeFileSync(p, JSON.stringify(list, null, 2), "utf8");
}

function upsertInstance(inst) {
  const list = loadInstances();
  const idx = list.findIndex((i) => i.id === inst.id || i.name === inst.name);
  const merged = { ...list[idx], ...inst, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = merged;
  else list.unshift({ ...merged, createdAt: new Date().toISOString() });
  saveInstances(list);
  return merged;
}

function removeInstance(where = {}) {
  const { id, name, token } = where;
  const list = loadInstances();
  const next = list.filter((i) => {
    if (id && (i.id === id || i.name === id)) return false;
    if (name && (i.name === name || i.id === name)) return false;
    if (token && i.token === token) return false;
    return true;
  });
  if (next.length !== list.length) saveInstances(next);
  return { removed: list.length - next.length, remaining: next.length };
}

function isUazNotFoundError(err) {
  const msg = String(err?.message || err || "");
  return /->\s*404\b/i.test(msg) || /not\s*found/i.test(msg);
}

function isMessageEvent(reqUrl, payload) {
  const url = reqUrl || "";
  if (/\/messages\b/i.test(url)) return true;
  const ev = payload?.event || payload?.type || payload?.eventType;
  if (typeof ev === "string" && /messages/i.test(ev)) return true;
  return Boolean(payload?.message || payload?.messages || payload?.data?.message);
}

function shouldIgnoreMessage(payload) {
  const msg = payload?.message || payload?.data?.message || payload?.data || payload;
  const wasSentByApi = Boolean(msg?.wasSentByApi || msg?.was_sent_by_api);
  const isGroup = Boolean(msg?.isGroup || msg?.is_group);
  return wasSentByApi || isGroup;
}

function logWebhook(instanceId, payload) {
  ensureDir(UAZ_DIR);
  const p = join(UAZ_DIR, "webhook-messages.log");
  appendFileSync(p, `${new Date().toISOString()} ${instanceId} ${JSON.stringify(payload)}\n`, "utf8");
}

function launchCreateWindow(configPath) {
  const nodeDir = join(ROOT, ".tools", "node");
  const psCommand =
    `Write-Host '=== Robo Cal.com REDFOX (Intake) ===' -ForegroundColor Cyan; ` +
    `Write-Host 'Resolva o captcha no Chrome' -ForegroundColor Yellow; ` +
    `$env:Path = '${nodeDir};' + $env:Path; ` +
    `$env:HEADLESS = 'false'; $env:KEEP_BROWSER_OPEN = 'true'; ` +
    `Set-Location '${ROOT}'; ` +
    `node src/create-account.mjs --config '${configPath.replace(/'/g, "''")}'; ` +
    `Write-Host ''; Write-Host 'Concluido. Enter para fechar.' -ForegroundColor Green; Read-Host`;

  spawn("powershell", ["-NoExit", "-Command", psCommand], {
    detached: true,
    stdio: "ignore",
    shell: false,
  }).unref();
}

async function handleRequest(req, res) {
  const path = req.url?.split("?")[0] || "/";

  try {
    if (req.method === "GET" && (path === "/" || path === "/app" || path === "/app.html")) {
      const html = readFileSync(join(PUBLIC, "app.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && path.match(/\.(js|svg|png|ico|webp)$/i)) {
      const filePath = join(PUBLIC, path.replace(/^\//, ""));
      if (existsSync(filePath)) {
        const ext = filePath.split(".").pop()?.toLowerCase();
        const types = {
          js: "application/javascript; charset=utf-8",
          svg: "image/svg+xml",
          png: "image/png",
          ico: "image/x-icon",
          webp: "image/webp",
        };
        res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
        if (req.method === "HEAD") res.end();
        else res.end(readFileSync(filePath));
        return;
      }
    }

    // Webhook receiver (UazAPI)
    // Configure o webhook para apontar para: http(s)://<host>/webhook/uaz/<instanceId>
    if (req.method === "POST" && path.startsWith("/webhook/uaz/")) {
      const instanceId = path.split("/").pop() || "unknown";
      const payload = await readBody(req);

      if (!isMessageEvent(path, payload)) {
        return json(res, 200, { ok: true, ignored: "not_messages" });
      }
      if (shouldIgnoreMessage(payload)) {
        return json(res, 200, { ok: true, ignored: "wasSentByApi_or_isGroup" });
      }

      logWebhook(instanceId, payload);
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && path === "/api/analyze") {
      const { sessionId, text } = await readBody(req);
      if (!text?.trim()) return json(res, 400, { error: "Texto vazio" });
      const session = getSession(sessionId);
      session.questionnaire = text.trim();
      session.result = await analyzeIntake(session.questionnaire);
      if (!session.result.summary_pt) {
        session.result.summary_pt = buildSummary(session.result.config);
      }
      return json(res, 200, session.result);
    }

    if (req.method === "POST" && path === "/api/followup") {
      const { sessionId, answer } = await readBody(req);
      const session = getSession(sessionId);
      if (!session.questionnaire) return json(res, 400, { error: "Analise o questionário primeiro" });
      session.result = await answerFollowUp(session.questionnaire, session.result, answer);
      if (!session.result.summary_pt) {
        session.result.summary_pt = buildSummary(session.result.config);
      }
      return json(res, 200, session.result);
    }

    if (req.method === "POST" && path === "/api/create") {
      if (process.env.VERCEL) {
        return json(res, 503, {
          error: "O robô Cal.com (Playwright) só funciona no ambiente local. Rode npm run create na sua máquina.",
        });
      }
      const { sessionId } = await readBody(req);
      const session = getSession(sessionId);
      if (!session.result || session.result.status !== "ready") {
        return json(res, 400, { error: "Configuração ainda não está pronta" });
      }
      const configPath = saveIntakeJson(sessionId, session);
      launchCreateWindow(configPath);
      return json(res, 200, {
        message: "Janela PowerShell aberta. Resolva o captcha no Chrome.",
        configPath,
      });
    }

    // UazAPI instance management
    if (req.method === "POST" && path === "/api/uaz/create") {
      const { name } = await readBody(req);
      if (!name?.trim()) return json(res, 400, { error: "Informe um nome" });
      const created = await initInstance(name.trim());
      // Esperado: { instance: { id, name, token, ... } } ou { id, token, name }
      const inst = created?.instance || created;
      const saved = upsertInstance({
        id: inst?.id || inst?.instanceId || inst?.name || name.trim(),
        name: inst?.name || name.trim(),
        token: inst?.token || inst?.instanceToken,
        status: inst?.status || "created",
        raw: created,
      });
      return json(res, 200, saved);
    }

    if (req.method === "POST" && path === "/api/uaz/list") {
      let list = loadInstances();
      if (process.env.VERCEL && list.length === 0) {
        try {
          list = await loadInstancesRemote();
        } catch {
          /* mantém lista vazia */
        }
      }
      // best effort: atualizar status do topo (não bloquear)
      const out = [];
      for (const inst of list.slice(0, 50)) {
        try {
          if (inst.token) {
            const st = await getInstanceStatus(inst.token);
            out.push(upsertInstance({ ...inst, status: st?.instance?.status || st?.status || inst.status, status_raw: st }));
          } else {
            out.push(inst);
          }
        } catch (e) {
          // Se a instância foi deletada fora do painel (UazAPI), removemos do cache local
          if (isUazNotFoundError(e)) {
            removeInstance({ id: inst.id, name: inst.name, token: inst.token });
            continue;
          }
          out.push(inst);
        }
      }
      return json(res, 200, { instances: out });
    }

    if (req.method === "POST" && path === "/api/uaz/remove") {
      const { id, name, token } = await readBody(req);
      const r = removeInstance({ id, name, token });
      return json(res, 200, { ok: true, ...r });
    }

    if (req.method === "POST" && path === "/api/uaz/status") {
      const { token } = await readBody(req);
      if (!token) return json(res, 400, { error: "token é obrigatório" });
      const st = await getInstanceStatus(token);
      return json(res, 200, st);
    }

    if (req.method === "POST" && path === "/api/uaz/connect-qr") {
      const { token } = await readBody(req);
      if (!token) return json(res, 400, { error: "token é obrigatório" });
      const r = await connectInstance(token);
      return json(res, 200, r);
    }

    if (req.method === "POST" && path === "/api/uaz/connect-pair") {
      const { token, phone } = await readBody(req);
      if (!token) return json(res, 400, { error: "token é obrigatório" });
      if (!phone) return json(res, 400, { error: "phone é obrigatório (ex: 5517999999999)" });
      const r = await connectInstance(token, String(phone).replace(/\D/g, ""));
      return json(res, 200, r);
    }

    if (req.method === "POST" && path === "/api/uaz/webhook") {
      const { token, url, environment } = await readBody(req);
      if (!token) return json(res, 400, { error: "token é obrigatório" });
      const webhookUrl = resolveWebhookUrl(environment, url);
      if (!webhookUrl) return json(res, 400, { error: "Informe o ambiente (test/production) ou uma URL" });
      const r = await configureWebhook(token, { url: webhookUrl });
      return json(res, 200, { ...r, webhookUrl, environment: environment || "custom" });
    }

    if (req.method === "GET" && path === "/api/config/webhooks") {
      return json(res, 200, { environments: listWebhookEnvironments() });
    }

    if (req.method === "POST" && path === "/api/admin/profiles/list") {
      const body = await readBody(req);
      const data = await listProfiles(body);
      return json(res, 200, { ...data, columns: PROFILE_LIST_COLUMNS });
    }

    if (req.method === "POST" && path === "/api/admin/profiles/get") {
      const { id } = await readBody(req);
      if (!id) return json(res, 400, { error: "id é obrigatório" });
      const profile = await getProfile(id);
      return json(res, 200, { profile });
    }

    if (req.method === "POST" && path === "/api/admin/profiles/update") {
      const { id, data } = await readBody(req);
      if (!id) return json(res, 400, { error: "id é obrigatório" });
      const profile = await updateProfile(id, data || {});
      return json(res, 200, { profile });
    }

    if (req.method === "POST" && path === "/api/admin/auth/list") {
      const { page = 1, perPage = 100, q = "" } = await readBody(req);
      const data = await listAuthUsers({ page, perPage });
      const users = filterAuthUsers(data.users, q);
      return json(res, 200, { users, total: users.length, page, perPage });
    }

    if (req.method === "POST" && path === "/api/admin/auth/get") {
      const { id } = await readBody(req);
      if (!id) return json(res, 400, { error: "id é obrigatório" });
      const user = await getAuthUser(id);
      return json(res, 200, { user });
    }

    if (req.method === "POST" && path === "/api/admin/auth/create") {
      const body = await readBody(req);
      const result = await createAuthUserWithProfile(body);
      return json(res, 200, result);
    }

    if (req.method === "POST" && path === "/api/admin/auth/update") {
      const { id, email, password, user_metadata } = await readBody(req);
      if (!id) return json(res, 400, { error: "id é obrigatório" });
      const user = await updateAuthUser(id, { email, password, user_metadata });
      return json(res, 200, { user });
    }

    if (req.method === "POST" && path === "/api/admin/auth/deactivate") {
      const { id } = await readBody(req);
      if (!id) return json(res, 400, { error: "id é obrigatório" });
      const user = await deactivateAuthUser(id);
      return json(res, 200, { user });
    }

    if (req.method === "POST" && path === "/api/admin/auth/activate") {
      const { id } = await readBody(req);
      if (!id) return json(res, 400, { error: "id é obrigatório" });
      const user = await activateAuthUser(id);
      return json(res, 200, { user });
    }

    if (req.method === "POST" && path === "/api/admin/auth/link") {
      const { userId, profileId } = await readBody(req);
      if (!userId || !profileId) {
        return json(res, 400, { error: "userId e profileId são obrigatórios" });
      }
      await getProfile(profileId);
      const user = await linkAuthUserToProfile(userId, profileId);
      return json(res, 200, { user, linked: true });
    }

    if (path.startsWith("/api/")) {
      return json(res, 404, { error: "Not found" });
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (error) {
    json(res, 500, { error: error.message });
  }
}

const server = createServer(handleRequest);

export default handleRequest;

if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`App: http://localhost:${PORT}/`);
    if (!process.env.GROQ_API_KEY) {
      console.warn("AVISO: GROQ_API_KEY não definida no .env");
    }
    if (!process.env.ServerURLUazapi || !process.env.AdminTokenUazapi) {
      console.warn("AVISO: ServerURLUazapi/AdminTokenUazapi não definidos no .env");
    }
  });
}
