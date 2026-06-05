import { chromium } from "playwright";
import { dismissWelcomeModal } from "./calcom-setup.mjs";

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || `clinica-${Date.now()}`;
}

async function clickFirstVisible(page, labels) {
  for (const label of labels) {
    const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      return true;
    }
  }
  return false;
}

async function waitForTurnstile(page, timeoutMs = 180000) {
  console.log("   Aguardando captcha Cloudflare — resolva na janela do Chrome se aparecer...");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const token = await page
      .locator('input[name="cf-turnstile-response"]')
      .inputValue()
      .catch(() => "");
    const enabled = await page
      .getByTestId("signup-submit-button")
      .isEnabled()
      .catch(() => false);
    if (token || enabled) return;
    await page.waitForTimeout(1000);
  }
  throw new Error("Captcha Cloudflare Turnstile não foi resolvido a tempo");
}

async function fillIfVisible(page, selectors, value) {
  for (const selector of selectors) {
    const el = page.locator(selector).first();
    if (await el.isVisible().catch(() => false)) {
      // Alguns inputs re-renderizam e "descolam" do DOM (detached). Retentativas evitam falhas.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await el.waitFor({ state: "visible", timeout: 5000 });
          await el.click({ timeout: 5000 }).catch(() => {});
          await el.fill(value, { timeout: 15000 });
          return true;
        } catch (e) {
          const msg = (e && typeof e.message === "string") ? e.message : String(e);
          if (!/detached|not attached|Target closed/i.test(msg) || attempt === 4) throw e;
          await page.waitForTimeout(600);
        }
      }
      return true;
    }
  }
  return false;
}

async function launchBrowser(headless) {
  const launchOptions = {
    headless,
    slowMo: headless ? 0 : 80,
    args: ["--disable-blink-features=AutomationControlled"],
  };

  if (!headless) {
    for (const channel of ["chrome", "msedge"]) {
      try {
        return await chromium.launch({ ...launchOptions, channel });
      } catch {
        /* tenta próximo canal */
      }
    }
  }

  return chromium.launch(launchOptions);
}

async function runSignupFlow(browser, { email, password, finalUsername, onStatus }) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    onStatus?.("signup_started");
    await page.goto("https://app.cal.com/signup", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2000);

    const usedEmailFlow = await clickFirstVisible(page, ["continue with email", "continuar com e-mail"]);

    if (usedEmailFlow) {
      await page.waitForTimeout(1500);

      const userInput = page.locator('input[name="username"]');
      await userInput.click();
      await userInput.pressSequentially(finalUsername, { delay: 25 });

      const emailInput = page.locator("#signup-email, input[name='email']").first();
      await emailInput.click();
      await emailInput.pressSequentially(email, { delay: 20 });

      const passInput = page.locator("#signup-password, input[name='password']").first();
      await passInput.click();
      await passInput.pressSequentially(password, { delay: 20 });

      await waitForTurnstile(page);

      const submitBtn = page.getByTestId("signup-submit-button");
      await submitBtn.waitFor({ state: "visible", timeout: 15000 });
      await submitBtn.click({ timeout: 120000 });
    } else {
      await fillIfVisible(page, ['input[name="email"]', 'input[type="email"]'], email);
      await fillIfVisible(page, ['input[name="password"]', 'input[type="password"]'], password);
      await fillIfVisible(page, ['input[name="username"]'], finalUsername);

      const submitted =
        (await clickFirstVisible(page, ["sign up", "create account", "criar conta", "get started"])) ||
        (await page.locator('button[type="submit"]').first().click().then(() => true).catch(() => false));

      if (!submitted) {
        throw new Error("Não encontrou botão de cadastro no Cal.com");
      }
    }

    await page.waitForTimeout(5000);
    return { browser, page, username: finalUsername };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export async function createCalcomAccount({
  email,
  password,
  fullName,
  username,
  timezone = "America/Manaus",
  headless = false,
  onStatus,
}) {
  const finalUsername = username || slugify(fullName);
  const browser = await launchBrowser(headless);
  return runSignupFlow(browser, { email, password, finalUsername, onStatus });
}

const ONBOARDING_BUTTONS = [
  "personal",
  "individual",
  "pessoal",
  "continue",
  "continuar",
  "next",
  "próximo",
  "save",
  "salvar",
  "connect my calendar later",
  "i'll connect my calendar later",
  "conectar depois",
  "skip",
  "pular",
  "finish",
  "concluir",
  "done",
  "get started",
  "começar",
];

async function advanceOnboarding(page, { fullName, username, timezone }, maxSteps = 15) {
  for (let step = 0; step < maxSteps; step++) {
    const url = page.url();
    if (/app\.cal\.com\/(event-types|bookings|availability|dashboard)/i.test(url)) break;

    await fillIfVisible(page, ['input[name="name"]', 'input[placeholder*="name" i]'], fullName);

    const tzSelect = page.locator('select, [role="combobox"]').first();
    if (await tzSelect.isVisible().catch(() => false)) {
      await tzSelect.click().catch(() => {});
      await page.getByText(new RegExp(timezone.split("/").pop(), "i")).first().click().catch(() => {});
    }

    await fillIfVisible(page, ['input[name="username"]', 'input[placeholder*="username" i]'], username);
    const clicked = await clickFirstVisible(page, ONBOARDING_BUTTONS);
    if (!clicked) await page.waitForTimeout(2000);
    else await page.waitForTimeout(1500);
  }
}

async function captureEventTypeId(page) {
  await page.goto("https://app.cal.com/event-types", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);

  const href = await page.locator('a[href*="/event-types/"]').first().getAttribute("href").catch(() => null);
  const hrefMatch = href?.match(/event-types\/(\d+)/i);
  if (hrefMatch) return hrefMatch[1];

  const html = await page.content();
  const idMatch =
    html.match(/event-types\/(\d+)/i) ||
    html.match(/"eventTypeId":(\d+)/i) ||
    html.match(/eventTypeId[=:](\d+)/i);
  return idMatch?.[1] || null;
}

export async function verifyEmailAndFinishOnboarding(page, verificationUrl, { fullName, username, timezone, onStatus }) {
  console.log("   Abrindo link de verificação do e-mail...");
  onStatus?.("email_verified");
  await page.goto(verificationUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);

  console.log("   Concluindo onboarding (nome, timezone, calendário)...");
  await advanceOnboarding(page, { fullName, username, timezone });
  onStatus?.("onboarding_done");

  console.log("   Entrando no painel (event-types)...");
  await dismissWelcomeModal(page);
  const eventTypeId = await captureEventTypeId(page);
  const finalUrl = page.url();
  const calUsername = username;

  return {
    eventTypeId,
    calUsername,
    bookingUrl: eventTypeId ? `https://cal.com/${calUsername}` : null,
    dashboardUrl: finalUrl,
  };
}

export function generatePassword() {
  const base = Math.random().toString(36).slice(2, 10);
  return `Rf@${base}A1!`;
}

export function generateUsername(name, clinic) {
  const base = slugify(clinic || name);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`.slice(0, 30);
}
