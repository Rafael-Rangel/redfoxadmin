import { chromium } from "playwright";
import { loadEnv } from "../src/env.mjs";
import { listAccounts } from "../src/supabase.mjs";

loadEnv();

const rows = await listAccounts(1);
const acc = rows[0];
if (!acc?.temp_email) throw new Error("Nenhuma conta encontrada");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto("https://app.cal.com/auth/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const emailBtn = page.getByRole("button", { name: /continue with email|continuar com e-mail/i }).first();
if (await emailBtn.isVisible().catch(() => false)) await emailBtn.click();

await page.locator('input[name="email"], input[type="email"]').first().fill(acc.temp_email);
await page.locator('input[name="password"], input[type="password"]').first().fill(acc.cal_password);

const submit = page.getByRole("button", { name: /continue|sign in|entrar|log in/i }).first();
await submit.click();
await page.waitForURL(/app\.cal\.com\/(event-types|bookings|dashboard|availability)/, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3000);
console.log("logged in:", page.url(), acc.temp_email);

const urls = [
  "https://app.cal.com/settings/my-account/general",
  "https://app.cal.com/settings/my-account/profile",
  "https://app.cal.com/settings",
  "https://app.cal.com/event-types",
  "https://app.cal.com/availability",
];

for (const url of urls) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  console.log("\n===", url, "===");
  console.log("title:", await page.title());
  console.log("final:", page.url());
  const labels = await page.locator("label, h1, h2, button").allTextContents();
  console.log("text sample:", [...new Set(labels.map((t) => t.trim()).filter(Boolean))].slice(0, 40));
}

await browser.close();
