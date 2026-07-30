import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createBackupWithoutLocationData, createFantasyMagicaBackup } from "./magica-fixture";

const EMPTY_DATA = {
  points: [],
  drives: [],
  places: [],
  fuelEntries: [],
  odometerEntries: [],
};

const FANTASY_DATA = {
  points: [
    { lat: 12.1, lng: 34.1, t: Date.parse("2025-01-15T12:00:00Z"), trip: 101 },
    { lat: 12.2, lng: 34.2, t: Date.parse("2025-01-15T12:45:00Z"), trip: 101 },
    { lat: 12.3, lng: 34.3, t: Date.parse("2025-02-20T09:00:00Z"), trip: 202, recovered: true },
    { lat: 12.4, lng: 34.4, t: Date.parse("2025-02-20T10:20:00Z"), trip: 202 },
  ],
  drives: [
    {
      id: 101,
      startDate: Date.parse("2025-01-15T12:00:00Z"),
      endDate: Date.parse("2025-01-15T12:45:00Z"),
      distanceKm: 42.5,
      startCity: "Moonhaven",
      endCity: "Starfall Keep",
      averageSpeedKmh: 56,
      maxSpeedKmh: 82,
      score: 0.92,
      note: "A quiet road beneath two moons.",
      weather: "Clear",
      temperatureC: 18,
      consumptionUnits: 4.2,
      consumptionCost: 18.4,
      co2Kg: 8.6,
      odometerStart: 120_000,
      odometerEnd: 120_042.5,
      startPlace: "Moon Gate",
      endPlace: "Starfall Keep",
      tags: ["starlight", "scenic"],
    },
    {
      id: 202,
      startDate: Date.parse("2025-02-20T09:00:00Z"),
      endDate: Date.parse("2025-02-20T10:20:00Z"),
      distanceKm: 73.2,
      startCity: "Cloudspire",
      endCity: "Dragon Roost",
      averageSpeedKmh: 61,
      maxSpeedKmh: 96,
      score: 84,
      note: "Snow crystals over the northern pass.",
      weather: "Snow",
      temperatureC: -3,
      consumptionUnits: 7.1,
      consumptionCost: 29.6,
      co2Kg: 14.2,
      odometerStart: 120_100,
      odometerEnd: 120_173.2,
      startPlace: "Cloud Dock",
      endPlace: "Dragon Roost",
      tags: ["mountain"],
    },
  ],
  places: [
    { id: 1, name: "Moon Gate", address: "1 Crescent Way", lat: 12.1, lng: 34.1 },
    { id: 2, name: "Dragon Roost", address: "8 Ember Lane", lat: 12.4, lng: 34.4 },
  ],
  fuelEntries: [
    { id: 1, amount: 20, cost: 46.2, pricePerUnit: 2.31 },
    { id: 2, amount: 16, cost: 35.8, pricePerUnit: 2.2375 },
  ],
  odometerEntries: [
    { date: Date.parse("2025-01-15T12:00:00Z"), value: 120_000 },
    { date: Date.parse("2025-02-20T10:20:00Z"), value: 120_173.2 },
  ],
  ignoredPoints: 2,
};

async function stubMapTiles(page: Page) {
  await page.route(/^https:\/\/[a-d]\.basemaps\.cartocdn\.com\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2f5"/><path d="M0 64h256M0 128h256M0 192h256M64 0v256M128 0v256M192 0v256" stroke="#dfe7ec" stroke-width="1"/><path d="M-16 224L224 -16M32 272L272 32" stroke="#fff" stroke-width="5" opacity=".8"/></svg>',
      ),
    }),
  );
}

async function mockDataGet(page: Page, data: unknown) {
  await page.route("**/api/data", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}

async function openViewerWith(page: Page, data: unknown) {
  if (process.env.UPDATE_README_SCREENSHOTS) {
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await stubMapTiles(page);
  await mockDataGet(page, data);
  await page.goto("/");
}

async function expectLoadedViewer(page: Page) {
  await expect(page.getByText("Persistent SQLite history", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "List" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Statistics" })).toBeEnabled();
}

async function captureReadmeScreenshot(page: Page, name: string) {
  if (!process.env.UPDATE_README_SCREENSHOTS) return;
  const directory = join(process.cwd(), "docs", "screenshots");
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true });
}

test.describe("drive viewer", () => {
  test("shows the empty drive viewer", async ({ page }) => {
    await openViewerWith(page, EMPTY_DATA);

    await expect(page).toHaveTitle(/Magica Viewer/);
    await expect(page.getByRole("heading", { name: "Drive history" })).toBeVisible();
    await expect(
      page.getByText("Additional backups merge into the persistent history."),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "List" })).toBeDisabled();
    await expect(page.getByRole("tab", { name: "Statistics" })).toBeDisabled();
    await expect(page.getByText("No drive data loaded")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose file" })).toBeVisible();
  });

  test("filters drives and opens selected drive details", async ({ page }) => {
    await openViewerWith(page, FANTASY_DATA);
    await expectLoadedViewer(page);
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.locator(".leaflet-control-zoom")).toBeVisible();
    await captureReadmeScreenshot(page, "map");

    await page.getByRole("tab", { name: "List" }).click();
    await expect(page.getByText("2 of 2 drives", { exact: true })).toBeVisible();

    await page.getByLabel("Search drives").fill("starlight");
    await expect(page.getByText("1 of 2 drives", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Moonhaven.*Starfall Keep/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Cloudspire.*Dragon Roost/ })).toBeHidden();

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByLabel("Weather").selectOption({ label: "Snow" });
    await expect(page.getByText("1 of 2 drives", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Cloudspire.*Dragon Roost/ })).toBeVisible();

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("button", { name: /Moonhaven.*Starfall Keep/ }).click();

    await expect(page.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true");
    const details = page.getByLabel("Selected drive details");
    await expect(details).toBeVisible();
    await expect(details.getByRole("heading", { name: /Moon Gate.*Starfall Keep/ })).toBeVisible();
    await expect(details).toContainText("42.5 km");
    await expect(details).toContainText("A quiet road beneath two moons.");

    await page.getByRole("button", { name: "Close drive details" }).click();
    await expect(details).toBeHidden();
  });

  test("summarizes loaded drive statistics", async ({ page }) => {
    await openViewerWith(page, FANTASY_DATA);
    await expectLoadedViewer(page);

    await page.getByRole("tab", { name: "Statistics" }).click();
    await expect(page.getByRole("tab", { name: "Statistics" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("heading", { name: "Monthly driving" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Weather insights" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Refuelling ledger" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Odometer history" })).toBeVisible();

    await expect(
      page.locator(".stat-cards article").filter({ hasText: "Total distance" }),
    ).toContainText("116 km");
    await expect(
      page.locator(".stat-cards article").filter({ hasText: "Average score" }),
    ).toContainText("88%");
    await expect(
      page.locator(".analytics-card").filter({ hasText: "Weather insights" }),
    ).toContainText("Snow");
    await expect(
      page.locator(".analytics-card").filter({ hasText: "Refuelling ledger" }),
    ).toContainText("CHF 82.00");
    await expect(
      page.locator(".analytics-card").filter({ hasText: "Odometer history" }),
    ).toContainText("120,173 km");
    await captureReadmeScreenshot(page, "statistics");
  });

  test("reports a readable error for a backup without location data", async ({
    page,
  }, testInfo) => {
    const backupPath = testInfo.outputPath("missing-location.magica");
    createBackupWithoutLocationData(backupPath);
    await openViewerWith(page, EMPTY_DATA);

    await page.getByLabel("Magica backup file").setInputFiles(backupPath);

    await expect(page.locator(".dropzone").getByRole("alert")).toHaveText(
      "This database does not contain Magica location data.",
    );
    await expect(page.getByRole("tab", { name: "List" })).toBeDisabled();
    await expect(page.getByRole("tab", { name: "Statistics" })).toBeDisabled();
  });
});

test.describe("SQLite-backed flows", () => {
  test.describe.configure({ mode: "serial" });

  test("imports a real Magica backup and reloads persisted data", async ({ page }, testInfo) => {
    const backupPath = testInfo.outputPath("enchanted-route.magica");
    createFantasyMagicaBackup(backupPath);
    await stubMapTiles(page);
    await page.goto("/");

    await page.getByLabel("Magica backup file").setInputFiles(backupPath);

    await expect(page.getByRole("button", { name: "Sync another backup" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("enchanted-route.magica", { exact: true })).toBeVisible();
    await expect(page.locator(".toolbar-summary")).toHaveText(/\d+ recorded drives/);
    await page.getByRole("tab", { name: "List" }).click();
    await expect(page.getByRole("button", { name: /Moonhaven.*Starfall Keep/ })).toBeVisible();

    await page.reload();
    await expectLoadedViewer(page);
    await expect(page.locator(".toolbar-summary")).toHaveText(/\d+ recorded drives/);
  });

  test("upserts a unique record through the data API", async ({ request }) => {
    const uniqueId = randomUUID();
    const uniqueNumber = Number.parseInt(uniqueId.slice(0, 8), 16);
    const key = `e2e-point-${uniqueId}`;
    const originalPoint = {
      lat: 10.1234,
      lng: 20.5678,
      t: 1_735_732_800_000 + uniqueNumber,
      trip: uniqueNumber,
    };
    const updatedPoint = { ...originalPoint, recovered: true };

    const saveResponse = await request.post("/api/data", {
      data: { kind: "points", records: [{ key, value: originalPoint }] },
    });
    expect(saveResponse.ok()).toBeTruthy();
    await expect(saveResponse.json()).resolves.toEqual({ synced: 1 });

    const updateResponse = await request.post("/api/data", {
      data: { kind: "points", records: [{ key, value: updatedPoint }] },
    });
    expect(updateResponse.ok()).toBeTruthy();

    const loadResponse = await request.get("/api/data");
    expect(loadResponse.ok()).toBeTruthy();
    const data = (await loadResponse.json()) as { points: unknown[] };
    expect(
      data.points.filter((point) => JSON.stringify(point) === JSON.stringify(updatedPoint)),
    ).toHaveLength(1);
    expect(data.points).not.toContainEqual(originalPoint);
  });

  test("rejects malformed, invalid, and oversized data batches", async ({ page, request }) => {
    await stubMapTiles(page);
    await page.goto("/");
    const malformedJson = await page.evaluate(async () => {
      const response = await fetch("/api/data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      return { status: response.status, body: await response.json() };
    });
    expect(malformedJson).toEqual({ status: 400, body: { error: "Invalid sync batch." } });

    const invalidKind = await request.post("/api/data", {
      data: { kind: "unknown", records: [] },
    });
    expect(invalidKind.status()).toBe(400);
    await expect(invalidKind.json()).resolves.toEqual({ error: "Invalid sync batch." });

    const missingValue = await request.post("/api/data", {
      data: { kind: "points", records: [{ key: "missing-value" }] },
    });
    expect(missingValue.status()).toBe(400);
    await expect(missingValue.json()).resolves.toEqual({ error: "Invalid sync batch." });

    const invalidDrive = await request.post("/api/data", {
      data: { kind: "drives", records: [{ key: "missing-fields", value: {} }] },
    });
    expect(invalidDrive.status()).toBe(400);
    await expect(invalidDrive.json()).resolves.toEqual({ error: "Invalid sync batch." });

    const oversized = await request.post("/api/data", {
      data: {
        kind: "points",
        records: Array.from({ length: 76 }, (_, index) => ({
          key: `oversized-${index}`,
          value: { index },
        })),
      },
    });
    expect(oversized.status()).toBe(400);
    await expect(oversized.json()).resolves.toEqual({ error: "Invalid sync batch." });
  });
});
