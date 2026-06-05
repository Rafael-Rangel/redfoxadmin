import { chromium } from "playwright";
import { loadEnv } from "../src/env.mjs";
import { listAccounts } from "../src/supabase.mjs";

loadEnv();
const acc = (await listAccounts(5)).find((r) => r.client_name === "Dr Config Teste");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto("https://app.cal.com/auth/login");
await page.waitForTimeout(1500);
const emailBtn = page.getByRole("button", { name: /continue with email/i }).first();
if (await emailBtn.isVisible().catch(() => false)) await emailBtn.click();
const form = page.locator("[data-testid=login-form]");
await form.locator("#email").fill(acc.temp_email);
await form.locator("#password").fill(acc.cal_password);
await form.locator('[type="submit"]').click();
await page.waitForTimeout(5000);

await page.goto("https://app.cal.com/event-types");
await page.waitForTimeout(3000);

const links = await page.locator('a[href*="/event-types/"]').evaluateAll((els) =>
  els.map((el) => ({ href: el.getAttribute("href"), text: el.textContent?.trim().slice(0, 50) }))
);
console.log("links:", links);

for (const link of links.slice(0, 1)) {
  const card = page.locator(`a[href="${link.href}"]`).first();
  const parent = card.locator("xpath=ancestor::div[contains(@class,'relative') or contains(@class,'group')][1]");
  const buttons = await parent.locator("button").count();
  console.log("buttons near card:", buttons);
  await parent.locator("button").last().click();
  await page.waitForTimeout(1000);
  console.log("menu:", await page.getByRole("menuitem").allTextContents());
}

await browser.close();
