import { chromium } from "playwright";
import { loadEnv } from "../src/env.mjs";
import { listAccounts, updateAccountRecord } from "../src/supabase.mjs";
import { configureAccountAfterLogin, dismissWelcomeModal } from "../src/calcom-setup.mjs";

loadEnv();

const id = process.argv[2];
const rows = await listAccounts(20);
const acc = id ? rows.find((r) => r.id === id) : rows.find((r) => r.status === "completed" || r.status === "onboarding_done");

if (!acc) {
  console.log("Uso: node scripts/configure-account.mjs [uuid-da-conta]");
  process.exit(1);
}

const headless = process.env.HEADLESS === "true";
const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 80 });
const page = await browser.newPage();

try {
  await page.goto("https://app.cal.com/auth/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const emailBtn = page.getByRole("button", { name: /continue with email|continuar com e-mail/i }).first();
  if (await emailBtn.isVisible().catch(() => false)) await emailBtn.click();

  const form = page.locator("[data-testid=login-form]");
  await form.locator("#email, input[name='email']").first().fill(acc.temp_email);
  await form.locator("#password, input[name='password']").first().fill(acc.cal_password);
  await form.locator('[type="submit"]').click();
  await page.waitForURL(/app\.cal\.com\/(event-types|bookings|availability|settings)/, { timeout: 90000 });

  await dismissWelcomeModal(page);
  console.log(`Configurando conta: ${acc.client_name} (${acc.temp_email})`);
  const meta = acc.metadata || {};
  const setup = await configureAccountAfterLogin(page, {
    durationMin: meta.event_duration_min || 40,
    eventTitle: meta.event_title || "Consulta",
    timezone: acc.timezone || "America/Sao_Paulo",
    locationAddress: meta.location_address || "",
    availability: {
      slots: meta.intake_parsed?.config?.availability?.slots || [
        { start: "07:45", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
      saturday_enabled: meta.intake_parsed?.config?.availability?.saturday_enabled ?? false,
    },
  });

  await updateAccountRecord(acc.id, {
    status: setup.eventTypeId ? "completed" : "onboarding_done",
    event_type_id: setup.eventTypeId,
    timezone: "America/Maceio",
    metadata: {
      ...(acc.metadata || {}),
      setup_completed: true,
      dashboard_url: setup.dashboardUrl,
      booking_url: setup.eventTypeId ? `https://cal.com/${acc.cal_username}/consulta` : null,
      event_title: "Consulta",
      event_duration_min: 40,
      availability: "seg-sex 07:45-12:00, 14:00-18:00",
      language: "pt-BR",
      time_format: "24h",
    },
    error_message: setup.eventTypeId ? null : "Configuração parcial",
  });

  console.log("Configuração concluída.", setup);
  if (process.env.KEEP_BROWSER_OPEN !== "false") await page.waitForTimeout(15000);
} catch (error) {
  console.error("Erro:", error.message);
  process.exit(1);
} finally {
  await browser.close();
}
