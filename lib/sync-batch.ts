export const recordKinds = [
  "points",
  "drives",
  "places",
  "fuelEntries",
  "odometerEntries",
  "summary",
] as const;

export type RecordKind = (typeof recordKinds)[number];
export type SyncRecord = { key: string; value: unknown };
export type SyncBatch = { kind: RecordKind; records: SyncRecord[] };

const recordKindSet = new Set<string>(recordKinds);
const driveNumberFields = [
  "id",
  "startDate",
  "endDate",
  "distanceKm",
  "averageSpeedKmh",
  "maxSpeedKmh",
  "score",
  "temperatureC",
  "consumptionUnits",
  "consumptionCost",
  "co2Kg",
  "odometerStart",
  "odometerEnd",
] as const;
const driveStringFields = [
  "startCity",
  "endCity",
  "note",
  "weather",
  "startPlace",
  "endPlace",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasFiniteNumbers(value: Record<string, unknown>, fields: readonly string[]) {
  return fields.every((field) => typeof value[field] === "number" && Number.isFinite(value[field]));
}

function hasStrings(value: Record<string, unknown>, fields: readonly string[]) {
  return fields.every((field) => typeof value[field] === "string");
}

export function isRecordValue(kind: string, value: unknown) {
  if (!isObject(value)) return false;

  switch (kind) {
    case "points":
      return (
        hasFiniteNumbers(value, ["lat", "lng", "t", "trip"]) &&
        (value.lat as number) >= -90 &&
        (value.lat as number) <= 90 &&
        (value.lng as number) >= -180 &&
        (value.lng as number) <= 180 &&
        (value.recovered === undefined || typeof value.recovered === "boolean")
      );
    case "drives":
      return (
        hasFiniteNumbers(value, driveNumberFields) &&
        hasStrings(value, driveStringFields) &&
        Array.isArray(value.tags) &&
        value.tags.every((tag) => typeof tag === "string")
      );
    case "places":
      return (
        hasFiniteNumbers(value, ["id", "lat", "lng"]) &&
        hasStrings(value, ["name", "address"]) &&
        (value.lat as number) >= -90 &&
        (value.lat as number) <= 90 &&
        (value.lng as number) >= -180 &&
        (value.lng as number) <= 180
      );
    case "fuelEntries":
      return hasFiniteNumbers(value, ["id", "amount", "cost", "pricePerUnit"]);
    case "odometerEntries":
      return hasFiniteNumbers(value, ["date", "value"]);
    case "summary":
      return (
        typeof value.ignoredPoints === "number" &&
        Number.isFinite(value.ignoredPoints) &&
        value.ignoredPoints >= 0
      );
    default:
      return false;
  }
}

export function isSyncBatch(value: unknown): value is SyncBatch {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { kind?: unknown; records?: unknown };
  if (typeof candidate.kind !== "string" || !recordKindSet.has(candidate.kind)) return false;
  if (!Array.isArray(candidate.records) || candidate.records.length > 75) return false;

  return candidate.records.every((record) => {
    if (!record || typeof record !== "object") return false;
    const candidateRecord = record as { key?: unknown; value?: unknown };
    return (
      typeof candidateRecord.key === "string" &&
      candidateRecord.key.trim().length > 0 &&
      Object.hasOwn(candidateRecord, "value") &&
      isRecordValue(candidate.kind as string, candidateRecord.value)
    );
  });
}
