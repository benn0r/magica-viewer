import { describe, expect, it } from "vitest";
import type { DriveData, DriveDetails } from "../../lib/drive-data";
import { aggregateStatistics, averageFuelPrice } from "../../lib/statistics";

function drive(month: number, overrides: Partial<DriveDetails> = {}): DriveDetails {
  return {
    id: month,
    startDate: new Date(2025, month, 10).getTime(),
    endDate: new Date(2025, month, 10, 1).getTime(),
    distanceKm: 10,
    startCity: "Aurora Bay",
    endCity: "Moonridge",
    averageSpeedKmh: 50,
    maxSpeedKmh: 80,
    score: 0.8,
    note: "",
    weather: "Clear",
    temperatureC: 20,
    consumptionUnits: 2,
    consumptionCost: 5,
    co2Kg: 1,
    odometerStart: 100,
    odometerEnd: 110,
    startPlace: "Comet House",
    endPlace: "Lunar Library",
    tags: [],
    ...overrides,
  };
}

function data(drives: DriveDetails[]): DriveData {
  return {
    drives,
    points: [],
    trips: drives.length,
    distanceKm: 0,
    firstDate: 0,
    lastDate: 0,
    totalPoints: 0,
    recoveredPoints: 0,
    ignoredPoints: 0,
    places: [],
    fuelEntries: [
      { id: 1, amount: 0.25, cost: 0.5, pricePerUnit: 2 },
      { id: 2, amount: 0.25, cost: 0.75, pricePerUnit: 3 },
    ],
    odometerEntries: [],
  };
}

describe("statistics aggregation", () => {
  it("keeps the latest twelve months and averages mixed score scales", () => {
    const drives = Array.from({ length: 13 }, (_, index) =>
      drive(index, {
        weather: index < 2 ? "Rain" : "Clear",
        score: index === 0 ? 90 : 0.8,
      }),
    );
    const analytics = aggregateStatistics(data(drives));

    expect(analytics.monthly).toHaveLength(12);
    expect(analytics.monthly[0]?.order).toBeLessThan(analytics.monthly.at(-1)?.order ?? 0);
    expect(analytics.weather[0]).toMatchObject({ name: "Clear", drives: 11, score: 80 });
    expect(analytics.totals).toMatchObject({
      distance: 130,
      cost: 65,
      consumption: 26,
      co2: 13,
    });
    expect(analytics.fuel).toEqual({ amount: 0.5, cost: 1.25 });
  });

  it("calculates fractional and empty fuel averages correctly", () => {
    expect(averageFuelPrice(0.5, 1.25)).toBe(2.5);
    expect(averageFuelPrice(0, 12)).toBe(0);
  });
});
