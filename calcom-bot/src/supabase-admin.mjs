import { loadEnv } from "./env.mjs";

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export const PROFILE_LIST_COLUMNS = [
  "id",
  "name",
  "clinic_name",
  "clientePrimeiroNome",
  "evo",
  "numero",
  "numero2",
  "ativa_geral",
  "gestor",
  "fluxo_UAZAPI",
  "novo_fluxo",
  "eventTypeId",
  "duracao_consulta",
  "nomeSecretaria",
  "relatorio_automatico",
  "relatorio_IA",
  "ferramentaPacienteAtivo",
  "created_at",
];

export const PROFILE_EDITABLE_FIELDS = [
  "name",
  "clinic_name",
  "clientePrimeiroNome",
  "evo",
  "numero",
  "numero2",
  "ativa_geral",
  "gestor",
  "fluxo_UAZAPI",
  "novo_fluxo",
  "eventTypeId",
  "duracao_consulta",
  "nomeSecretaria",
  "relatorio_automatico",
  "relatorio_IA",
  "ferramentaPacienteAtivo",
  "notas",
  "script",
  "script_reativacao",
  "faq",
  "tokenUazapi",
  "tempmail",
];

const PROFILE_LIST_SELECT = PROFILE_LIST_COLUMNS.join(",");

function adminHeaders(prefer, range) {
  const h = {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) h.Prefer = prefer;
  if (range) h.Range = range;
  return h;
}

async function parseResponse(res) {
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      body?.message ||
      body?.error_description ||
      body?.msg ||
      body?.error ||
      (typeof body === "string" ? body : JSON.stringify(body));
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return body;
}

function sanitizeSearchTerm(q) {
  return String(q || "")
    .trim()
    .replace(/[*%,()]/g, " ")
    .slice(0, 80);
}

function slugifyEvo(text) {
  return String(text || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "cliente";
}

function pickEditable(data) {
  const out = {};
  for (const key of PROFILE_EDITABLE_FIELDS) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}

export async function listProfiles({
  q = "",
  sort = "created_at",
  order = "desc",
  limit = 50,
  offset = 0,
  ativaOnly = null,
} = {}) {
  const safeSort = PROFILE_LIST_COLUMNS.includes(sort) ? sort : "created_at";
  const safeOrder = order === "asc" ? "asc" : "desc";
  const params = new URLSearchParams();
  params.set("select", PROFILE_LIST_SELECT);
  params.set("order", `${safeSort}.${safeOrder}`);

  const term = sanitizeSearchTerm(q);
  if (term) {
    const enc = encodeURIComponent(`*${term}*`);
    params.set(
      "or",
      `(name.ilike.${enc},clinic_name.ilike.${enc},clientePrimeiroNome.ilike.${enc},evo.ilike.${enc},numero.ilike.${enc},gestor.ilike.${enc})`
    );
  }
  if (ativaOnly === true) params.set("ativa_geral", "eq.true");
  if (ativaOnly === false) params.set("ativa_geral", "eq.false");

  const range = `${offset}-${offset + Math.max(1, limit) - 1}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${params}`, {
    headers: adminHeaders("count=exact", range),
  });
  const rows = await parseResponse(res);
  const total = Number(res.headers.get("content-range")?.split("/")?.[1] || rows.length);
  return { rows, total, limit, offset };
}

export async function getProfile(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: adminHeaders() }
  );
  const rows = await parseResponse(res);
  if (!rows?.length) throw new Error("Perfil não encontrado");
  return rows[0];
}

export async function updateProfile(id, data) {
  const patch = pickEditable(data);
  if (!Object.keys(patch).length) throw new Error("Nenhum campo para atualizar");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: adminHeaders("return=representation"),
      body: JSON.stringify(patch),
    }
  );
  const rows = await parseResponse(res);
  if (!rows?.length) throw new Error("Perfil não encontrado (talvez tenha sido deletado)");
  return rows[0];
}

export async function createProfileRecord(data) {
  const payload = {
    ativa_geral: true,
    novo_fluxo: true,
    fluxo_UAZAPI: true,
    relatorio_automatico: true,
    relatorio_IA: true,
    ferramentaPacienteAtivo: false,
    ...pickEditable(data),
  };
  if (!payload.evo && payload.name) payload.evo = slugifyEvo(payload.name);
  if (!payload.name && payload.clinic_name) payload.name = payload.clinic_name;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: adminHeaders("return=representation"),
    body: JSON.stringify(payload),
  });
  const rows = await parseResponse(res);
  return rows[0];
}

export async function createProfileWithId(id, data) {
  const payload = {
    id,
    ativa_geral: true,
    novo_fluxo: true,
    fluxo_UAZAPI: true,
    relatorio_automatico: true,
    relatorio_IA: true,
    ferramentaPacienteAtivo: false,
    ...pickEditable(data),
  };
  if (!payload.evo && payload.name) payload.evo = slugifyEvo(payload.name);
  if (!payload.name && payload.clinic_name) payload.name = payload.clinic_name;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: adminHeaders("return=representation"),
    body: JSON.stringify(payload),
  });
  const rows = await parseResponse(res);
  return rows[0];
}

export async function listAuthUsers({ page = 1, perPage = 50 } = {}) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
    { headers: adminHeaders() }
  );
  const body = await parseResponse(res);
  return { users: body.users || [], aud: body.aud };
}

export async function getAuthUser(id) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    headers: adminHeaders(),
  });
  return parseResponse(res);
}

export async function linkAuthUserToProfile(userId, profileId, extraMetadata = {}) {
  const user = await getAuthUser(userId);
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "PUT",
      headers: adminHeaders(),
      body: JSON.stringify({
        user_metadata: {
          ...(user.user_metadata || {}),
          ...extraMetadata,
          profile_id: profileId,
        },
      }),
    }
  );
  return parseResponse(res);
}

export async function createAuthUserWithProfile({
  email,
  password,
  name,
  clinic_name,
  clientePrimeiroNome,
  profileId,
  profileFields = {},
  email_confirm = true,
}) {
  if (!email?.trim()) throw new Error("E-mail é obrigatório");
  if (!password || password.length < 6) throw new Error("Senha deve ter pelo menos 6 caracteres");

  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      email: email.trim(),
      password,
      email_confirm,
      user_metadata: {
        name: name || clinic_name || email,
        clinic_name: clinic_name || null,
        email_verified: true,
      },
    }),
  });
  const authUser = await parseResponse(createRes);
  const userId = authUser.id;

  let profile;
  const profileData = {
    name: name || clinic_name || email,
    clinic_name,
    clientePrimeiroNome,
    ...profileFields,
  };

  if (profileId) {
    try {
      profile = await getProfile(profileId);
      profile = await updateProfile(profileId, {
        ...profileData,
        name: profileData.name || profile.name,
      });
    } catch {
      profile = await createProfileWithId(profileId, profileData);
    }
    await linkAuthUserToProfile(userId, profile.id, {
      name: profile.name || name,
      clinic_name: profile.clinic_name || clinic_name,
    });
  } else {
    try {
      profile = await createProfileWithId(userId, profileData);
    } catch (err) {
      if (/duplicate|already exists|23505/i.test(err.message)) {
        profile = await getProfile(userId);
        profile = await updateProfile(userId, profileData);
      } else {
        throw err;
      }
    }
    await linkAuthUserToProfile(userId, profile.id, {
      name: profile.name || name,
      clinic_name: profile.clinic_name || clinic_name,
    });
  }

  const linkedUser = await getAuthUser(userId);
  return { user: linkedUser, profile, linked: true };
}

export async function updateAuthUser(id, { email, password, user_metadata, ban_duration }) {
  const payload = {};
  if (email !== undefined) payload.email = email;
  if (password) payload.password = password;
  if (user_metadata) payload.user_metadata = user_metadata;
  if (ban_duration !== undefined) payload.ban_duration = ban_duration;
  if (!Object.keys(payload).length) throw new Error("Nenhum campo para atualizar");

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function deactivateAuthUser(id) {
  return updateAuthUser(id, { ban_duration: "876000h" });
}

export async function activateAuthUser(id) {
  return updateAuthUser(id, { ban_duration: "none" });
}

export function filterAuthUsers(users, q) {
  const term = sanitizeSearchTerm(q).toLowerCase();
  if (!term) return users;
  return users.filter((u) => {
    const meta = u.user_metadata || {};
    const hay = [
      u.id,
      u.email,
      u.phone,
      meta.name,
      meta.clinic_name,
      meta.profile_id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(term);
  });
}
