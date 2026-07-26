import { expect, test } from "@playwright/test";

test("shows the empty drive viewer", async ({ page }) => {
  await page.route("**/api/data", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      points: [], drives: [], places: [], fuelEntries: [], odometerEntries: [],
    }),
  }));
  await page.goto("/");

  await expect(page).toHaveTitle(/Magica Viewer/);
  await expect(page.getByRole("heading", { name: "Drive history" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "List" })).toBeDisabled();
  await expect(page.getByRole("tab", { name: "Statistics" })).toBeDisabled();
  await expect(page.getByText("No drive data loaded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose file" })).toBeVisible();
});

test("persists records through the data API", async ({ request }) => {
  const point = { lat: 47.3769, lng: 8.5417, t: 1_700_000_000_000, trip: 42 };
  const saveResponse = await request.post("/api/data", {
    data: {
      kind: "points",
      records: [{ key: "e2e-point", value: point }],
    },
  });

  expect(saveResponse.ok()).toBeTruthy();
  await expect(saveResponse.json()).resolves.toEqual({ synced: 1 });

  const loadResponse = await request.get("/api/data");
  expect(loadResponse.ok()).toBeTruthy();
  const data = await loadResponse.json();
  expect(data.points).toContainEqual(point);
});

test("rejects invalid data batches", async ({ request }) => {
  const response = await request.post("/api/data", {
    data: { kind: "unknown", records: [] },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "Invalid sync batch." });
});
