import { expect, test } from "@playwright/test";

test("keeps the empty map controls and callout inside an iPhone viewport", async ({ page }) => {
  await page.route("**/api/data", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        points: [],
        drives: [],
        places: [],
        fuelEntries: [],
        odometerEntries: [],
        ignoredPoints: 0,
      }),
    });
  });
  await page.route("https://*.basemaps.cartocdn.com/**", (route) => route.abort());

  await page.goto("/");
  await expect(page.getByText("No drive data loaded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose file" })).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator(".map-loading")).toBeHidden();
  await expect(page.locator(".leaflet-control-container")).toBeHidden();

  const callout = page.locator(".map-empty");
  await callout.scrollIntoViewIfNeeded();
  await expect(callout).toBeInViewport();

  const layout = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>(".map-frame");
    const callout = document.querySelector<HTMLElement>(".map-empty");
    const tabs = document.querySelector<HTMLElement>(".view-tabs");
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      frame: frame?.getBoundingClientRect().toJSON(),
      callout: callout?.getBoundingClientRect().toJSON(),
      tabs: tabs?.getBoundingClientRect().toJSON(),
    };
  });

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  for (const bounds of [layout.frame, layout.tabs]) {
    expect(bounds).toBeTruthy();
    expect(bounds?.left).toBeGreaterThanOrEqual(0);
    expect(bounds?.right).toBeLessThanOrEqual(layout.viewportWidth);
  }
  expect(layout.callout).toBeTruthy();
  expect(layout.callout?.left).toBeGreaterThanOrEqual(layout.frame?.left ?? 0);
  expect(layout.callout?.right).toBeLessThanOrEqual(layout.frame?.right ?? layout.viewportWidth);
  expect(layout.callout?.top).toBeGreaterThanOrEqual(layout.frame?.top ?? 0);
  expect(layout.callout?.bottom).toBeLessThanOrEqual(layout.frame?.bottom ?? 0);
  expect(layout.callout?.top).toBeGreaterThanOrEqual(0);
  expect(layout.callout?.bottom).toBeLessThanOrEqual(layout.viewportHeight);
});
