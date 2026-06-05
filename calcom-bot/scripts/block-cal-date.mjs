/**
 * Bloqueia um dia inteiro no Cal.com (date override indisponível).
 *
 * Uso:
 *   node scripts/block-cal-date.mjs --date 2026-06-05 --email ronedo2592@bncinema.com --password "SENHA"
 *   node scripts/block-cal-date.mjs --date 2026-06-05 --profile-id a4a9bc4f-21ea-489f-a3e3-017444ca1b37 --password "SENHA"
 *   CALCOM_API_KEY=cal_live_... node scripts/block-cal-date.mjs --date 2026-06-05
 */
import { chromium } from "playwright";
import { loadEnv } from "../src/env.mjs";
import { dismissWelcomeModal } from "../src/calcom-setup.mjs";

loadEnv();

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

async function fetchProfileTempmail(profileId) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}&select=tempmail,name,eventTypeId&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
    },
  });
  const rows = await res.json();
  if (!res.ok) throw new Error(rows.message || JSON.stringify(rows));
  if (!rows[0]?.tempmail) throw new Error(`Profile ${profileId} sem tempmail`);
  return rows[0];
}

async function loginCalcom(page, email, password) {
  await page.goto("https://app.cal.com/auth/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  const emailBtn = page.getByRole("button", { name: /continue with email|continuar com e-mail/i }).first();
  if (await emailBtn.isVisible().catch(() => false)) await emailBtn.click();

  const form = page.locator("[data-testid=login-form]");
  await form.locator("#email, input[name='email']").first().fill(email);
  await form.locator("#password, input[name='password']").first().fill(password);
  await form.locator('[type="submit"]').click();

  await page.waitForURL(/app\.cal\.com\/(event-types|bookings|availability|dashboard|apps)/, {
    timeout: 90000,
  });
  await dismissWelcomeModal(page);
}

async function getDefaultSchedule(apiKey) {
  const res = await fetch("https://api.cal.com/v2/schedules/default", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "cal-api-version": "2024-06-11",
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || JSON.stringify(body));
  return body.data;
}

async function blockDateViaApi(apiKey, date) {
  const schedule = await getDefaultSchedule(apiKey);
  const existing = Array.isArray(schedule.overrides) ? schedule.overrides : [];
  const withoutDate = existing.filter((o) => o.date !== date);
  const overrides = [
    ...withoutDate,
    { date, startTime: "00:00", endTime: "00:00" },
  ];

  const res = await fetch(`https://api.cal.com/v2/schedules/${schedule.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "cal-api-version": "2024-06-11",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ overrides }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || JSON.stringify(body));
  return body.data;
}

async function blockDateViaUi(page, date) {
  await page.goto("https://app.cal.com/availability", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="schedules"]', { timeout: 30000 });
  await page.getByTestId("schedules").first().click();
  await page.waitForTimeout(2000);

  const addOverride = page
    .getByRole("button", { name: /add.*override|adicionar.*exce|nova exce|date override/i })
    .or(page.getByTestId("add-override"))
    .first();

  if (await addOverride.isVisible().catch(() => false)) {
    await addOverride.click();
  } else {
    await page.getByText(/date overrides|exceções de data|substituições de data/i).first().click().catch(() => {});
    await page.getByRole("button", { name: /add|adicionar|\+/i }).last().click();
  }
  await page.waitForTimeout(1000);

  const dateInput = page.locator('input[type="date"], input[name*="date" i]').last();
  if (await dateInput.isVisible().catch(() => false)) {
    await dateInput.fill(date);
  } else {
    await page.getByRole("button", { name: new RegExp(date.replace(/-/g, "[/-]")) }).click().catch(async () => {
      await page.keyboard.type(date);
    });
  }
  await page.waitForTimeout(800);

  const unavailable = page
    .getByRole("switch", { name: /unavailable|indispon|mark.*unavailable|dia inteiro/i })
    .or(page.getByLabel(/unavailable|indispon/i))
    .first();

  if (await unavailable.isVisible().catch(() => false)) {
    const checked = await unavailable.isChecked().catch(() => false);
    if (!checked) await unavailable.click();
  } else {
    const markUnavailable = page.getByRole("button", { name: /unavailable|indispon/i }).first();
    if (await markUnavailable.isVisible().catch(() => false)) await markUnavailable.click();
  }

  const saveBtn = page
    .locator('[form="availability-form"][type="submit"]')
    .or(page.getByRole("button", { name: /^save$|^salvar$|^update$|^atualizar$/i }))
    .first();
  await saveBtn.click();
  await page.waitForTimeout(2500);
}

async function verifyBlocked(eventTypeId, date) {
  const url = new URL("https://api.cal.com/v2/slots");
  url.searchParams.set("eventTypeId", String(eventTypeId));
  url.searchParams.set("start", date);
  url.searchParams.set("end", date);
  url.searchParams.set("timeZone", "America/Sao_Paulo");

  const res = await fetch(url, { headers: { "cal-api-version": "2024-09-04" } });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  const slots = body.data?.[date] || [];
  return { slots, empty: slots.length === 0 };
}

const args = parseArgs(process.argv);
const date = args.date || "2026-06-05";
const apiKey = args["api-key"] || process.env.CALCOM_API_KEY;
let email = args.email || process.env.CALCOM_EMAIL;
let password = args.password || process.env.CALCOM_PASSWORD;
let eventTypeId = args["event-type-id"] || process.env.CALCOM_EVENT_TYPE_ID || "5900233";

if (args["profile-id"]) {
  const profile = await fetchProfileTempmail(args["profile-id"]);
  email = email || profile.tempmail;
  eventTypeId = eventTypeId || profile.eventTypeId;
  console.log(`Perfil: ${profile.name} (${profile.tempmail})`);
}

if (apiKey) {
  console.log(`Bloqueando ${date} via API...`);
  const schedule = await blockDateViaApi(apiKey, date);
  console.log(`Schedule ${schedule.id} atualizado (${schedule.overrides?.length || 0} overrides).`);
} else {
  if (!email || !password) {
    console.error(
      "Informe CALCOM_API_KEY ou email+senha do Cal.com.\n" +
        "Ex.: node scripts/block-cal-date.mjs --profile-id a4a9bc4f-21ea-489f-a3e3-017444ca1b37 --password \"...\""
    );
    process.exit(1);
  }

  const headless = process.env.HEADLESS !== "false";
  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 60 });
  const page = await browser.newPage();
  try {
    console.log(`Login Cal.com (${email})...`);
    await loginCalcom(page, email, password);
    console.log(`Bloqueando ${date} via UI...`);
    await blockDateViaUi(page, date);
  } finally {
    await browser.close();
  }
}

console.log(`Verificando slots para eventTypeId ${eventTypeId}...`);
const check = await verifyBlocked(eventTypeId, date);
if (check.empty) {
  console.log(`OK: ${date} sem horários disponíveis.`);
} else {
  console.warn(`Atenção: ainda há ${check.slots.length} slot(s) em ${date}.`);
  console.warn(JSON.stringify(check.slots.slice(0, 5), null, 2));
  process.exit(2);
}
