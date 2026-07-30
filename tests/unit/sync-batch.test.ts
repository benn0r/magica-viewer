import { describe, expect, it } from "vitest";
import { isSyncBatch } from "../../lib/sync-batch";

describe("sync batch validation", () => {
  it("accepts supported batches up to 75 records", () => {
    expect(isSyncBatch({ kind: "points", records: [] })).toBe(true);
    expect(
      isSyncBatch({
        kind: "summary",
        records: Array.from({ length: 75 }, (_, index) => ({
          key: String(index),
          value: { ignoredPoints: index },
        })),
      }),
    ).toBe(true);
  });

  it.each([
    ["points", { lat: 12, lng: 34, t: 1, trip: 2, recovered: true }],
    [
      "drives",
      {
        id: 1,
        startDate: 1,
        endDate: 2,
        distanceKm: 3,
        startCity: "Moonhaven",
        endCity: "Starfall Keep",
        averageSpeedKmh: 4,
        maxSpeedKmh: 5,
        score: 0.9,
        note: "",
        weather: "Clear",
        temperatureC: 6,
        consumptionUnits: 7,
        consumptionCost: 8,
        co2Kg: 9,
        odometerStart: 10,
        odometerEnd: 11,
        startPlace: "Moon Gate",
        endPlace: "Starfall Keep",
        tags: ["scenic"],
      },
    ],
    ["places", { id: 1, name: "Moon Gate", address: "1 Crescent Way", lat: 12, lng: 34 }],
    ["fuelEntries", { id: 1, amount: 2, cost: 3, pricePerUnit: 1.5 }],
    ["odometerEntries", { date: 1, value: 2 }],
    ["summary", { ignoredPoints: 3 }],
  ])("accepts a valid %s record", (kind, value) => {
    expect(isSyncBatch({ kind, records: [{ key: "valid", value }] })).toBe(true);
  });

  it.each([
    null,
    {},
    { kind: "unknown", records: [] },
    { kind: "points", records: "nope" },
    { kind: "points", records: Array.from({ length: 76 }, () => ({ key: "x", value: 1 })) },
    { kind: "points", records: [null] },
    { kind: "points", records: [{ key: "", value: 1 }] },
    { kind: "points", records: [{ key: "missing-value" }] },
    {
      kind: "points",
      records: [{ key: "bad-coordinate", value: { lat: 91, lng: 0, t: 1, trip: 1 } }],
    },
    { kind: "drives", records: [{ key: "missing-fields", value: {} }] },
    { kind: "summary", records: [{ key: "negative", value: { ignoredPoints: -1 } }] },
  ])("rejects malformed input %#", (value) => {
    expect(isSyncBatch(value)).toBe(false);
  });
});
