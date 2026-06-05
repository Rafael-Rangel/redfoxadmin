import { loadEnv } from "./env.mjs";

loadEnv();

function baseUrl() {
  const url = process.env.ServerURLUazapi || process.env.UAZAPI_URL;
  if (!url) throw new Error("ServerURLUazapi (UAZAPI_URL) não definido no .env");
  return url.replace(/\/+$/, "");
}

function adminToken() {
  const token = process.env.AdminTokenUazapi || process.env.UAZAPI_ADMIN_TOKEN;
  if (!token) throw new Error("AdminTokenUazapi (UAZAPI_ADMIN_TOKEN) não definido no .env");
  return token;
}

async function request(path, { method = "GET", tokenType = "instance", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (tokenType === "admin") headers.admintoken = adminToken();
  if (tokenType === "instance") headers.token = token;

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`UazAPI ${method} ${path} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

export async function listAllInstances() {
  return request("/instance/all", { method: "GET", tokenType: "admin" });
}

export async function initInstance(name) {
  // endpoint observado em integrações n8n / SDKs: POST /instance/init
  return request("/instance/init", { method: "POST", tokenType: "admin", body: { name } });
}

export async function connectInstance(instanceToken, phone = null) {
  // POST /instance/connect { phone? }
  return request("/instance/connect", {
    method: "POST",
    tokenType: "instance",
    token: instanceToken,
    body: phone ? { phone } : {},
  });
}

export async function getInstanceStatus(instanceToken) {
  return request("/instance/status", { method: "GET", tokenType: "instance", token: instanceToken });
}

export async function disconnectInstance(instanceToken) {
  return request("/instance/disconnect", { method: "POST", tokenType: "instance", token: instanceToken, body: {} });
}

export async function configureWebhook(instanceToken, { url }) {
  // POST /webhook
  // Requisito: escutar exclusivamente mensagens e desconsiderar wasSentByApi/isGroup.
  return request("/webhook", {
    method: "POST",
    tokenType: "instance",
    token: instanceToken,
    body: {
      url,
      events: ["messages"],
      enabled: true,
      excludeMessages: ["wasSentByApi", "isGroupYes"],
      addUrlEvents: false,
      addUrlTypesMessages: false,
    },
  });
}

export async function getWebhook(instanceToken) {
  return request("/webhook", { method: "GET", tokenType: "instance", token: instanceToken });
}

