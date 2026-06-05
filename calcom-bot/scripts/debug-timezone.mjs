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
console.log("after login:", page.url());

await page.goto("https://app.cal.com/settings/my-account/general");
await page.waitForTimeout(4000);
console.log("general page:", page.url(), await page.title());

const labels = await page.locator("label, button, [role='combobox'], [role='listbox']").allTextContents();
console.log("labels:", [...new Set(labels.map((t) => t.trim()).filter(Boolean))].slice(0, 30));

const combos = await page.locator("[role='combobox']").evaluateAll((els) =>
  els.map((el) => ({ text: el.textContent?.trim(), id: el.id, name: el.getAttribute("name") }))
);
console.log("combos:", combos);

await page.locator("[role='combobox']").nth(1).click();
await page.waitForTimeout(800);
await page.locator('input[placeholder="Timezone"]').fill("Maceio");
await page.waitForTimeout(1000);
const opts = await page.locator('[role="option"]').allTextContents();
console.log("maceio options:", opts.slice(0, 15));

await page.locator("[role='combobox']").nth(0).click();
await page.waitForTimeout(500);
const langOpts = await page.locator('[role="option"]').allTextContents();
console.log("lang options sample:", langOpts.filter((t) => /portug/i.test(t)).slice(0, 5));

await page.keyboard.press("Escape");
await page.locator("[role='combobox']").nth(2).click();
await page.waitForTimeout(500);
const tfOpts = await page.locator('[role="option"]').allTextContents();
console.log("time format:", tfOpts);

const testids = await page.locator("[data-testid*='select-option']").evaluateAll((els) =>
  els.slice(0, 15).map((el) => el.getAttribute("data-testid"))
);
console.log("testids:", testids);
await browser.close();
