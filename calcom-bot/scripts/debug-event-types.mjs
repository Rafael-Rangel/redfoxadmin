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
const html = await page.content();
const ids = [...html.matchAll(/event-types\/(\d+)/g)].map((m) => m[1]);
console.log("ids in html:", [...new Set(ids)]);
const items = await page.locator('[data-testid="event-types"] > li').count();
console.log("event count:", items);
const allText = await page.locator("main").textContent();
console.log("main text sample:", allText?.slice(0, 400));

const consultaLink = page.getByRole("link", { name: /consulta/i }).first();
console.log("consulta href:", await consultaLink.getAttribute("href").catch(() => null));
const row = consultaLink.locator("xpath=ancestor::*[contains(@class,'group') or contains(@class,'flex')][1]");
await consultaLink.locator("xpath=..").locator("button").last().click().catch(async () => {
  await page.locator('a[href*="5911672"]').locator("..").locator("button").last().click();
});
await page.waitForTimeout(1000);
const menu = await page.getByRole("menuitem").allTextContents();
console.log("menu:", menu);

await page.goto("https://app.cal.com/event-types?dialog=new&title=Consulta&length=30");
await page.waitForTimeout(2000);
const fields = await page.locator("input, button[type='submit']").evaluateAll((els) =>
  els.map((el) => ({ name: el.name, type: el.type, testid: el.getAttribute("data-testid"), visible: el.offsetParent !== null }))
);
console.log("create form:", fields);
const dialogText = await page.locator('[role="dialog"]').textContent();
console.log("dialog:", dialogText?.slice(0, 500));

await page.getByLabel(/^título$/i).fill("Consulta");
await page.getByTestId("event-type-duration-input").fill("30");

const resp = page.waitForResponse((r) => r.url().includes("eventTypes") && r.request().method() === "POST");
await page.getByRole("button", { name: /^continuar$/i }).click();
try {
  const r = await resp;
  console.log("api:", r.status(), await r.text());
} catch (e) {
  console.log("no api response");
}
await page.waitForTimeout(5000);
console.log("after create:", page.url());

await browser.close();
