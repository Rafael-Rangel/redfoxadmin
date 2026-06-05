import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://app.cal.com/signup", { waitUntil: "networkidle", timeout: 90000 });
await page.getByRole("button", { name: /continue with email/i }).click();
await page.waitForTimeout(1500);

const username = `redfoxtest${Date.now().toString().slice(-6)}`;
const email = `test${Date.now()}@wshu.net`;

const userInput = page.locator('input[name="username"]');
await userInput.click();
await userInput.pressSequentially(username, { delay: 30 });
await page.locator("#signup-email").click();
await page.locator("#signup-email").pressSequentially(email, { delay: 20 });
await page.locator("#signup-password").click();
await page.locator("#signup-password").pressSequentially("Rf@Test123A1!", { delay: 20 });

const values = await page.locator("input").evaluateAll((els) =>
  els.map((el) => ({ name: el.name, type: el.type, value: el.value }))
);

await page.waitForTimeout(5000);
const disabled = await page.getByTestId("signup-submit-button").isDisabled();
console.log({ values, disabled });
await browser.close();
