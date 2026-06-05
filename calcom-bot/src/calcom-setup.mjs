const WEEKDAYS_EN = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WEEKEND_EN = ["saturday", "sunday"];
const WEEKDAYS_PT = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira"];
const WEEKEND_PT = ["sábado", "domingo"];

async function resolveDayIds(page) {
  if ((await page.getByTestId("segunda-feira").count()) > 0) {
    return { weekdays: WEEKDAYS_PT, weekend: WEEKEND_PT };
  }
  return { weekdays: WEEKDAYS_EN, weekend: WEEKEND_EN };
}

async function waitMs(page, ms = 1500) {
  await page.waitForTimeout(ms);
}

async function clickIfVisible(page, locator) {
  if (await locator.isVisible().catch(() => false)) {
    await locator.click();
    return true;
  }
  return false;
}

async function selectCombobox(page, index, { search, optionPattern }) {
  await page.locator("[role='combobox']").nth(index).click();
  await waitMs(page, 500);
  if (search) {
    const searchInput = page
      .locator('input[placeholder="Timezone"], input[placeholder="Fuso horário"], input[placeholder*="Fuso"]')
      .last();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill(search);
      await waitMs(page, 800);
    }
  }
  await page.getByRole("option", { name: optionPattern }).first().click();
  await waitMs(page, 500);
}

async function setComboboxValue(page, index, { search, optionPattern, skipIfMatches }) {
  const combo = page.locator("[role='combobox']").nth(index);
  const current = (await combo.textContent()) || "";
  if (skipIfMatches?.test(current)) return;
  await selectCombobox(page, index, { search, optionPattern });
}

async function saveGeneralSettings(page) {
  const saveBtn = page.getByRole("button", { name: /^update$|^atualizar$/i }).first();
  if (await saveBtn.isEnabled().catch(() => false)) {
    await saveBtn.click();
    await waitMs(page, 2500);
  }
}

function timezoneSearchTerm(timezone) {
  const city = (timezone || "America/Sao_Paulo").split("/").pop().replace(/_/g, " ");
  return city.slice(0, 20);
}

export async function configureGeneralSettings(page, { timezone = "America/Sao_Paulo" } = {}) {
  console.log("   Configurações > Geral...");
  await page.goto("https://app.cal.com/settings/my-account/general", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitMs(page, 2500);

  const combos = page.locator("[role='combobox']");
  const count = await combos.count();
  const tzSearch = timezoneSearchTerm(timezone);
  const tzPattern = new RegExp(timezone.replace(/\//g, "\\/"), "i");

  for (let i = 0; i < count; i++) {
    const text = ((await combos.nth(i).textContent()) || "").trim();
    if (tzPattern.test(text)) continue;
    if (/\/|America|Europa|Europe|GMT/i.test(text)) {
      await setComboboxValue(page, i, {
        search: tzSearch,
        optionPattern: tzPattern,
        skipIfMatches: tzPattern,
      });
      break;
    }
  }

  for (let i = 0; i < count; i++) {
    const text = ((await combos.nth(i).textContent()) || "").trim();
    if (/24/.test(text)) continue;
    if (/hour|hora|12/i.test(text)) {
      await setComboboxValue(page, i, {
        optionPattern: /24.hour|24.h|24 horas/i,
        skipIfMatches: /24/,
      });
      break;
    }
  }

  const localeSelect = page.getByTestId("locale-select");
  if (await localeSelect.isVisible().catch(() => false)) {
    await localeSelect.click();
    await waitMs(page, 500);
    await page.getByTestId("select-option-pt-BR").click();
  } else {
    for (let i = 0; i < count; i++) {
      const text = ((await combos.nth(i).textContent()) || "").trim();
      if (/português.*brasil/i.test(text)) break;
      if (/english|português|español|français|deutsch/i.test(text) || i === 0) {
        await setComboboxValue(page, i, {
          optionPattern: /português \(Brasil\)/i,
          skipIfMatches: /português.*brasil/i,
        });
        break;
      }
    }
  }
  await waitMs(page, 1500);

  await saveGeneralSettings(page);
  console.log(`   Geral: pt-BR, ${timezone}, 24h`);
}

async function getEventTypeIds(page) {
  const html = await page.content();
  return [
    ...new Set([...html.matchAll(/event-type-options-(\d+)/g)].map((m) => m[1])),
  ];
}

export async function dismissWelcomeModal(page) {
  const welcome = page.locator('[role="dialog"], [data-state="open"]').filter({
    hasText: /bem vindo ao cal\.com|welcome to cal\.com/i,
  });
  if (!(await welcome.first().isVisible().catch(() => false))) return false;

  const continuar = welcome
    .first()
    .getByRole("button", { name: /^continuar$|^continue$/i })
    .or(page.getByRole("button", { name: /^continuar$|^continue$/i }));

  if (await continuar.first().isVisible().catch(() => false)) {
    await continuar.first().click();
    await waitMs(page, 2000);
    console.log('   Popup "Bem vindo ao Cal.com" fechado.');
    return true;
  }
  return false;
}

async function dismissOverlays(page) {
  await dismissWelcomeModal(page);
  await page.keyboard.press("Escape");
  await waitMs(page, 400);
  await dismissWelcomeModal(page);
  const closeBtn = page.getByRole("button", { name: /^fechar$|^close$|^dismiss$/i });
  if (await closeBtn.first().isVisible().catch(() => false)) {
    await closeBtn.first().click();
    await waitMs(page, 400);
  }
}

async function deleteEventTypeById(page, id) {
  await dismissOverlays(page);
  await page.getByTestId(`event-type-options-${id}`).first().click({ force: true });
  await waitMs(page, 600);
  await page.getByRole("menuitem", { name: /delete|excluir|apagar|remover/i }).first().click();
  await waitMs(page, 500);
  await page.getByTestId("dialog-confirmation").click();
  await waitMs(page, 2000);
}

async function deleteAllEventTypes(page) {
  await page.goto("https://app.cal.com/event-types", { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitMs(page, 2500);
  await dismissOverlays(page);

  for (let attempt = 0; attempt < 15; attempt++) {
    const ids = await getEventTypeIds(page);
    if (ids.length === 0) break;
    await deleteEventTypeById(page, ids[0]);
  }
}

async function configureEventTypeLocation(page, { locationAddress = "" } = {}) {
  const locationTab = page
    .getByTestId("vertical-tab-event_location_tab_title")
    .or(page.getByRole("tab", { name: /location|local|localização/i }).first());

  if (await locationTab.isVisible().catch(() => false)) {
    await locationTab.click();
    await waitMs(page, 1500);
  }

  for (let i = 0; i < 5; i++) {
    const removeBtn = page
      .getByRole("button", { name: /remove|remover|delete|excluir/i })
      .or(page.locator('[data-testid*="delete-location"], [data-testid*="remove-location"]'))
      .first();
    if (!(await removeBtn.isVisible().catch(() => false))) break;
    await removeBtn.click();
    await waitMs(page, 800);
  }

  const addLocation = page.getByRole("button", { name: /add.*location|adicionar.*local|add location/i }).first();
  if (await addLocation.isVisible().catch(() => false)) {
    await addLocation.click();
    await waitMs(page, 800);
    const inPerson = page
      .getByRole("option", { name: /in.?person|presencial|pessoa/i })
      .or(page.getByText(/in.?person|presencial|in person/i).first());
    await inPerson.click();
    await waitMs(page, 800);

    if (locationAddress) {
      const addrInput = page
        .locator('input[name*="address"], input[placeholder*="address" i], input[placeholder*="endereço" i]')
        .first();
      if (await addrInput.isVisible().catch(() => false)) {
        await addrInput.fill(locationAddress);
        await waitMs(page, 500);
      }
    }
  }

  const meetToggle = page.locator('[data-testid*="google"], [data-testid*="meet"], label').filter({
    hasText: /google meet|meet|vídeo|video/i,
  });
  if (await meetToggle.first().isVisible().catch(() => false)) {
    const switchEl = meetToggle.first().locator('[role="switch"]').first();
    if (await switchEl.isChecked().catch(() => false)) await switchEl.click();
  }

  const saveBtn = page.getByTestId("update-eventtype").or(page.getByRole("button", { name: /^save$|^salvar$/i }));
  if (await saveBtn.first().isVisible().catch(() => false)) {
    await saveBtn.first().click();
    await waitMs(page, 2500);
  }
}

export async function configureEventTypes(page, { durationMin = 40, eventTitle = "Consulta", locationAddress = "" } = {}) {
  console.log("   Tipos de Evento...");
  await deleteAllEventTypes(page);

  await page.getByTestId("new-event-type").click();
  await waitMs(page, 1500);
  await page.getByLabel(/^título$/i).fill(eventTitle);
  await page.getByTestId("event-type-duration-input").fill(String(durationMin));
  await page.getByRole("button", { name: /^continuar$|^continue$/i }).click();

  await page.waitForURL(/\/event-types\/\d+/, { timeout: 90000 });
  await waitMs(page, 2000);

  const eventTypeId = page.url().match(/\/event-types\/(\d+)/)?.[1] || null;
  await configureEventTypeLocation(page, { locationAddress });

  console.log(`   Evento "${eventTitle}" criado — ${durationMin} min (id: ${eventTypeId})`);
  return eventTypeId;
}

async function setDaySwitch(page, dayId, enabled) {
  const sw = page.getByTestId(`${dayId}-switch`);
  const checked = await sw.isChecked().catch(() => false);
  if (checked !== enabled) {
    await sw.click();
    await waitMs(page, 400);
  }
}

async function configureDaySlots(page, dayId, slots) {
  const dayRow = page.getByTestId(dayId);
  await dayRow.scrollIntoViewIfNeeded();
  await setDaySwitch(page, dayId, true);

  const combos = dayRow.locator('[role="combobox"]');
  while ((await combos.count()) < slots.length * 2) {
    await dayRow.getByTestId("add-time-availability").first().click();
    await waitMs(page, 600);
  }

  for (let s = 0; s < slots.length; s++) {
    await combos.nth(s * 2).click();
    await page.getByRole("option", { name: slots[s].start, exact: true }).click();
    await waitMs(page, 300);
    await combos.nth(s * 2 + 1).click();
    await page.getByRole("option", { name: slots[s].end, exact: true }).click();
    await waitMs(page, 300);
  }
}

async function copyMondayToWeekdays(page, weekdays) {
  const mondayId = weekdays[0];
  const mondayRow = page.getByTestId(mondayId);
  const copyBtn = mondayRow.getByTestId("copy-button").first();
  if (!(await copyBtn.isVisible().catch(() => false))) return;

  await copyBtn.click();
  await waitMs(page, 800);

  for (const day of weekdays.slice(1)) {
    const checkbox = page.getByRole("checkbox", { name: new RegExp(day, "i") });
    if (await checkbox.isVisible().catch(() => false)) await checkbox.check();
  }

  const applyBtn = page.getByRole("button", { name: /apply|aplicar/i }).first();
  if (await applyBtn.isVisible().catch(() => false)) {
    await applyBtn.click();
    await waitMs(page, 1000);
  }
}

export async function configureAvailability(page, { slots, saturdayEnabled = false } = {}) {
  console.log("   Disponibilidade...");
  await page.goto("https://app.cal.com/availability", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-testid="schedules"]', { timeout: 30000 });
  await page.getByTestId("schedules").first().click();
  await waitMs(page, 2500);

  const { weekdays, weekend } = await resolveDayIds(page);

  const defaultSlots = [
    { start: "07:45", end: "12:00" },
    { start: "14:00", end: "18:00" },
  ];
  const activeSlots = slots?.length ? slots : defaultSlots;

  for (const day of weekend) {
    const isSaturday = /sábado|sabado|saturday/i.test(day);
    await setDaySwitch(page, day, isSaturday && saturdayEnabled);
  }

  await configureDaySlots(page, weekdays[0], activeSlots);
  await copyMondayToWeekdays(page, weekdays);

  const saveBtn = page.locator('[form="availability-form"][type="submit"]');
  await saveBtn.click();
  await waitMs(page, 3000);

  const slotText = activeSlots.map((s) => `${s.start}-${s.end}`).join(", ");
  console.log(`   Disponibilidade: seg-sex ${slotText}`);
}

export async function configureAccountAfterLogin(page, setupConfig = {}) {
  const {
    durationMin = 40,
    eventTitle = "Consulta",
    timezone = "America/Sao_Paulo",
    locationAddress = "",
    availability = {},
  } = setupConfig;

  const slots = availability.slots;
  const saturdayEnabled = availability.saturday_enabled ?? false;

  await dismissWelcomeModal(page);
  await configureGeneralSettings(page, { timezone });
  const eventTypeId = await configureEventTypes(page, { durationMin, eventTitle, locationAddress });
  await configureAvailability(page, { slots, saturdayEnabled });

  await page.goto("https://app.cal.com/event-types", { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitMs(page, 2000);

  return {
    eventTypeId,
    dashboardUrl: page.url(),
    bookingUrl: null,
  };
}
