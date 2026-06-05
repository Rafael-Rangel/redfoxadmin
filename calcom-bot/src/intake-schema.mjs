const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

const CITY_TIMEZONE = {
  "sao jose do rio preto": "America/Sao_Paulo",
  "são josé do rio preto": "America/Sao_Paulo",
  "sao paulo": "America/Sao_Paulo",
  "rio de janeiro": "America/Sao_Paulo",
  maceio: "America/Maceio",
  maceió: "America/Maceio",
  manaus: "America/Manaus",
  recife: "America/Recife",
  salvador: "America/Bahia",
  fortaleza: "America/Fortaleza",
  brasilia: "America/Sao_Paulo",
  brasília: "America/Sao_Paulo",
};

export const REQUIRED_FIELDS = [
  "doctor_name",
  "clinic_name",
  "duration_min",
  "timezone",
  "availability",
];

export function normalizeWeekdays(weekdays) {
  if (!Array.isArray(weekdays) || !weekdays.length) return [1, 2, 3, 4, 5];
  const flat = weekdays.flatMap((d) => {
    const n = Number(d);
    if (n >= 1 && n <= 7) return [n];
    if (typeof d === "string" && /seg|mon/i.test(d)) return [1];
    if (typeof d === "string" && /ter|tue/i.test(d)) return [2];
    if (typeof d === "string" && /qua|wed/i.test(d)) return [3];
    if (typeof d === "string" && /qui|thu/i.test(d)) return [4];
    if (typeof d === "string" && /sex|fri/i.test(d)) return [5];
    return [];
  });
  return flat.length ? [...new Set(flat)].sort() : [1, 2, 3, 4, 5];
}

export function normalizeTime(value) {
  if (!value) return null;
  const s = String(value).trim().replace(/\./g, ":");
  const m = s.match(/(\d{1,2})[:hH]?(\d{2})?/);
  if (!m) return null;
  const h = String(m[1]).padStart(2, "0");
  const min = m[2] ? String(m[2]).padStart(2, "0") : "00";
  const out = `${h}:${min}`;
  return TIME_RE.test(out) ? out : null;
}

export function normalizeTimezone(tz, address = "") {
  if (tz && /^America\//.test(tz)) return tz;
  const lower = `${tz || ""} ${address}`.toLowerCase();
  for (const [city, zone] of Object.entries(CITY_TIMEZONE)) {
    if (lower.includes(city)) return zone;
  }
  if (/\/sp\b|sao paulo|são paulo/i.test(lower)) return "America/Sao_Paulo";
  if (/mg\b|minas/i.test(lower)) return "America/Sao_Paulo";
  return tz || "America/Sao_Paulo";
}

export function normalizeDoctorName(name) {
  if (!name) return "";
  const trimmed = name.trim();
  if (/^dr\.?\s/i.test(trimmed)) return trimmed;
  return `Dr. ${trimmed.replace(/^dr\.?\s*/i, "")}`;
}

export function normalizeSlots(slots) {
  if (!Array.isArray(slots)) return [];
  return slots
    .map((s) => ({
      start: normalizeTime(s.start),
      end: normalizeTime(s.end),
    }))
    .filter((s) => s.start && s.end);
}

export function defaultSlotsFromText(text) {
  const lower = (text || "").toLowerCase();
  const morningEnd = normalizeTime(lower.match(/12[:.]?00/) ? "12:00" : "12:00");
  const afternoonStart = normalizeTime(lower.match(/14[:.]?00/) ? "14:00" : "14:00");
  const start = normalizeTime(lower.match(/7[:.]?45|07[:.]?45/) ? "07:45" : "07:45");
  const end = normalizeTime(lower.match(/18[:.]?00/) ? "18:00" : "18:00");

  if (lower.includes("almoço") || lower.includes("almoco") || /12.*14/.test(lower)) {
    return [
      { start: start || "07:45", end: morningEnd || "12:00" },
      { start: afternoonStart || "14:00", end: end || "18:00" },
    ];
  }
  return [{ start: start || "09:00", end: end || "18:00" }];
}

export function normalizeConfig(raw = {}) {
  const config = {
    doctor_name: normalizeDoctorName(raw.doctor_name || raw.client_name || ""),
    clinic_name: (raw.clinic_name || "").trim(),
    event_title: (raw.event_title || "Consulta").trim(),
    duration_min: Number(raw.duration_min) || null,
    timezone: normalizeTimezone(raw.timezone, raw.location_address || raw.address || ""),
    location_address: (raw.location_address || raw.address || "").trim(),
    availability: {
      weekdays: normalizeWeekdays(raw.availability?.weekdays),
      slots: normalizeSlots(raw.availability?.slots),
      saturday_enabled: Boolean(raw.availability?.saturday_enabled),
    },
    extras: raw.extras || {},
  };

  if (!config.availability.slots.length && raw._sourceText) {
    config.availability.slots = defaultSlotsFromText(raw._sourceText);
  }

  if (
    raw._sourceText &&
    /somente pós|somente pos|emergência|emergencia|pós-operat/i.test(raw._sourceText) &&
    !raw.availability?.saturday_enabled
  ) {
    config.availability.saturday_enabled = false;
  }

  return config;
}

export function validateConfig(config) {
  const missing = [];
  if (!config.doctor_name) missing.push("doctor_name");
  if (!config.clinic_name) missing.push("clinic_name");
  if (!config.duration_min || config.duration_min < 5) missing.push("duration_min");
  if (!config.timezone) missing.push("timezone");
  if (!config.availability?.slots?.length) missing.push("availability");

  const errors = [];
  for (const slot of config.availability?.slots || []) {
    if (!TIME_RE.test(slot.start) || !TIME_RE.test(slot.end)) {
      errors.push(`Horário inválido: ${slot.start}-${slot.end}`);
    }
  }

  return {
    valid: missing.length === 0 && errors.length === 0,
    missing_fields: missing,
    errors,
  };
}

export function buildSummary(config) {
  const slots = (config.availability?.slots || [])
    .map((s) => `${s.start}–${s.end}`)
    .join(", ");
  return [
    `Médico: ${config.doctor_name}`,
    `Clínica: ${config.clinic_name}`,
    `Evento: ${config.event_title} (${config.duration_min} min)`,
    `Fuso: ${config.timezone}`,
    `Horários seg–sex: ${slots}`,
    `Sábado: ${config.availability?.saturday_enabled ? "sim" : "não"}`,
    config.location_address ? `Endereço: ${config.location_address}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function mergeGroqResult(groqOutput, sourceText = "") {
  const base = groqOutput?.config || groqOutput || {};
  const normalized = normalizeConfig({ ...base, _sourceText: sourceText });
  const validation = validateConfig(normalized);

  let status = groqOutput?.status || "needs_questions";
  if (validation.valid && status !== "needs_questions") status = "ready";
  if (!validation.valid) status = "needs_questions";

  const questions = [...(groqOutput?.questions || [])];
  if (validation.missing_fields.includes("duration_min") && !questions.some((q) => /duração|minutos/i.test(q))) {
    questions.push("Qual a duração padrão da consulta em minutos? (ex.: 40)");
  }
  if (validation.missing_fields.includes("doctor_name") && !questions.some((q) => /médico|doutor/i.test(q))) {
    questions.push("Qual o nome completo do profissional responsável?");
  }
  if (validation.missing_fields.includes("clinic_name") && !questions.some((q) => /clínica|consultório/i.test(q))) {
    questions.push("Qual o nome da clínica ou consultório?");
  }

  return {
    status: validation.valid ? "ready" : "needs_questions",
    config: normalized,
    missing_fields: validation.missing_fields,
    errors: validation.errors,
    questions: validation.valid ? [] : questions.slice(0, 3),
    summary_pt: groqOutput?.summary_pt || buildSummary(normalized),
    extras: base.extras || {},
  };
}
