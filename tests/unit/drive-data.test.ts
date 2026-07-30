import { describe, expect, it } from "vitest";
import {
  filterDrives,
  formatDuration,
  formatScore,
  haversine,
  normalizePersistedData,
  shouldTraceSegment,
  type DriveDetails,
  type DrivePoint,
} from "../../lib/drive-data";

const baseDrive: DriveDetails = {
  id: 1,
  startDate: new Date("2026-03-14T23:59:59.999").getTime(),
  endDate: new Date("2026-03-15T00:45:00.000").getTime(),
  distanceKm: 24,
  startCity: "Aurora Bay",
  endCity: "Moonridge",
  averageSpeedKmh: 48,
  maxSpeedKmh: 82,
  score: 0.91,
  note: "Starlight run",
  weather: "Clear",
  temperatureC: 18,
  consumptionUnits: 1.8,
  consumptionCost: 4.2,
  co2Kg: 2.1,
  odometerStart: 1200,
  odometerEnd: 1224,
  startPlace: "Comet House",
  endPlace: "Lunar Library",
  tags: ["Night", "Scenic"],
};

describe("drive formatting", () => {
  it("formats short, long, negative, and mixed-scale scores", () => {
    expect(formatDuration(0, 59 * 60_000)).toBe("59 min");
    expect(formatDuration(0, 125 * 60_000)).toBe("2h 5m");
    expect(formatDuration(10_000, 0)).toBe("0 min");
    expect(formatScore(0.874)).toBe("87%");
    expect(formatScore(92.6)).toBe("93");
    expect(formatScore(Number.NaN)).toBe("—");
  });
});

describe("route normalization", () => {
  it("sorts data and derives distance, trip, recovery, and history summaries", () => {
    const points: DrivePoint[] = [
      { lat: 47.01, lng: 8.01, t: 600_000, trip: 7, recovered: true },
      { lat: 46, lng: 7, t: 300_000, trip: 9 },
      { lat: 47, lng: 8, t: 0, trip: 7 },
    ];

    const normalized = normalizePersistedData({
      points,
      drives: [baseDrive, { ...baseDrive, id: 2, startDate: baseDrive.startDate + 1 }],
      places: [],
      fuelEntries: [],
      odometerEntries: [],
      ignoredPoints: 3,
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.points.map((point) => point.trip)).toEqual([7, 7, 9]);
    expect(normalized?.drives.map((drive) => drive.id)).toEqual([2, 1]);
    expect(normalized?.distanceKm).toBeCloseTo(haversine(points[2], points[0]), 5);
    expect(normalized).toMatchObject({
      trips: 2,
      firstDate: 0,
      lastDate: 600_000,
      totalPoints: 6,
      recoveredPoints: 1,
      ignoredPoints: 3,
    });
    expect(points.map((point) => point.trip)).toEqual([7, 9, 7]);
  });

  it("rejects empty or timestamp-less persisted histories", () => {
    expect(
      normalizePersistedData({
        points: [],
        drives: [],
        places: [],
        fuelEntries: [],
        odometerEntries: [],
      }),
    ).toBeNull();
    expect(
      normalizePersistedData({
        points: [{ lat: 1, lng: 1, t: Number.NaN, trip: 1 }],
        drives: [],
        places: [],
        fuelEntries: [],
        odometerEntries: [],
      }),
    ).toBeNull();

    expect(
      normalizePersistedData({
        points: [{ lat: 1, lng: 1, t: 1, trip: 1 }],
        drives: [],
        places: [],
        fuelEntries: [],
        odometerEntries: [],
        ignoredPoints: Number.NaN,
      })?.ignoredPoints,
    ).toBe(0);
  });

  it("excludes cross-trip, one-hour, and twenty-kilometre segments", () => {
    const origin = { lat: 47, lng: 8, t: 0, trip: 1 };
    expect(shouldTraceSegment(origin, { ...origin, lat: 47.01, t: 3_599_999 })).toBe(true);
    expect(shouldTraceSegment(origin, { ...origin, lat: 47.01, t: 3_600_000 })).toBe(false);
    expect(shouldTraceSegment(origin, { ...origin, lat: 47.2, t: 10_000 })).toBe(false);
    expect(shouldTraceSegment(origin, { ...origin, lat: 47.01, t: 10_000, trip: 2 })).toBe(false);
  });
});

describe("drive filtering", () => {
  it("combines semantic, numeric, score, place, weather, and inclusive date filters", () => {
    const other = {
      ...baseDrive,
      id: 2,
      startCity: "Sunfall",
      endCity: "Cloudspire",
      startPlace: "Solar Farm",
      endPlace: "Cloud Café",
      weather: "Rain",
      score: 62,
      distanceKm: 8,
      tags: ["Commute"],
      startDate: new Date("2026-03-15T12:00:00.000").getTime(),
    };
    const filters = {
      search: "  scenic ",
      weather: "Clear",
      place: "Comet House",
      minimumDistance: "20",
      minimumScore: "90",
      dateFrom: "2026-03-14",
      dateTo: "2026-03-14",
    };

    expect(filterDrives([other, baseDrive], filters)).toEqual([baseDrive]);
    expect(filterDrives([other, baseDrive], { ...filters, search: "commute" })).toEqual([]);
    expect(
      filterDrives([other], {
        ...filters,
        search: "",
        weather: "",
        place: "",
        minimumDistance: "",
        minimumScore: "",
        dateFrom: "2026-03-15",
        dateTo: "2026-03-15",
      }),
    ).toEqual([other]);
  });
});
