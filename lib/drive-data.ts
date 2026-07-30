export type DrivePoint = {
  lat: number;
  lng: number;
  t: number;
  trip: number;
  recovered?: boolean;
};

export type DriveDetails = {
  id: number;
  startDate: number;
  endDate: number;
  distanceKm: number;
  startCity: string;
  endCity: string;
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  score: number;
  note: string;
  weather: string;
  temperatureC: number;
  consumptionUnits: number;
  consumptionCost: number;
  co2Kg: number;
  odometerStart: number;
  odometerEnd: number;
  startPlace: string;
  endPlace: string;
  tags: string[];
};

export type SavedPlace = {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export type FuelEntry = {
  id: number;
  amount: number;
  cost: number;
  pricePerUnit: number;
};

export type OdometerEntry = { date: number; value: number };

export type DriveData = {
  points: DrivePoint[];
  drives: DriveDetails[];
  trips: number;
  distanceKm: number;
  firstDate: number;
  lastDate: number;
  totalPoints: number;
  recoveredPoints: number;
  ignoredPoints: number;
  places: SavedPlace[];
  fuelEntries: FuelEntry[];
  odometerEntries: OdometerEntry[];
};

export type PersistedDriveData = Partial<DriveData> &
  Pick<DriveData, "points" | "drives" | "places" | "fuelEntries" | "odometerEntries">;

export type DriveFilters = {
  search: string;
  weather: string;
  place: string;
  minimumDistance: string;
  minimumScore: string;
  dateFrom: string;
  dateTo: string;
};

const MAX_POINT_GAP_MS = 60 * 60 * 1000;
const MAX_POINT_DISTANCE_KM = 20;

export function formatDuration(startDate: number, endDate: number) {
  const minutes = Math.max(0, Math.round((endDate - startDate) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function scorePercent(score: number) {
  return score <= 1 ? score * 100 : score;
}

export function formatScore(score: number) {
  if (!Number.isFinite(score) || score <= 0) return "—";
  return score <= 1 ? `${Math.round(score * 100)}%` : Math.round(score).toString();
}

export function haversine(a: DrivePoint, b: DrivePoint) {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.lat - a.lat) * radians;
  const longitudeDelta = (b.lng - a.lng) * radians;
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function shouldTraceSegment(previous: DrivePoint, point: DrivePoint) {
  const gap = point.t - previous.t;
  return (
    previous.trip === point.trip &&
    gap >= 0 &&
    gap < MAX_POINT_GAP_MS &&
    haversine(previous, point) < MAX_POINT_DISTANCE_KM
  );
}

export function normalizePersistedData(saved: PersistedDriveData): DriveData | null {
  const points = [...(saved.points ?? [])].sort((a, b) => a.trip - b.trip || a.t - b.t);
  if (points.length === 0) return null;

  const drives = [...(saved.drives ?? [])].sort((a, b) => b.startDate - a.startDate);
  let distanceKm = 0;
  let previous: DrivePoint | null = null;
  for (const point of points) {
    if (previous && shouldTraceSegment(previous, point)) {
      distanceKm += haversine(previous, point);
    }
    previous = point;
  }

  const timestamps = points.map((point) => point.t).filter(Number.isFinite);
  if (timestamps.length === 0) return null;
  const ignoredCandidate = Number(saved.ignoredPoints ?? 0);
  const ignoredPoints = Number.isFinite(ignoredCandidate) ? Math.max(0, ignoredCandidate) : 0;

  return {
    ...saved,
    points,
    drives,
    places: [...(saved.places ?? [])],
    fuelEntries: [...(saved.fuelEntries ?? [])],
    odometerEntries: [...(saved.odometerEntries ?? [])],
    trips: new Set(points.map((point) => point.trip)).size,
    distanceKm,
    firstDate: Math.min(...timestamps),
    lastDate: Math.max(...timestamps),
    totalPoints: points.length + ignoredPoints,
    recoveredPoints: points.filter((point) => point.recovered).length,
    ignoredPoints,
  };
}

function startOfDay(date: string) {
  return new Date(`${date}T00:00:00`).getTime();
}

function startOfNextDay(date: string) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + 1);
  return value.getTime();
}

export function filterDrives(drives: DriveDetails[], filters: DriveFilters) {
  const from = filters.dateFrom ? startOfDay(filters.dateFrom) : -Infinity;
  const toExclusive = filters.dateTo ? startOfNextDay(filters.dateTo) : Infinity;
  const query = filters.search.trim().toLowerCase();
  const minimumDistance = Number(filters.minimumDistance || 0);
  const minimumScore = Number(filters.minimumScore || 0);

  return drives.filter((drive) => {
    const haystack = [
      drive.startCity,
      drive.endCity,
      drive.startPlace,
      drive.endPlace,
      drive.weather,
      ...drive.tags,
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!query || haystack.includes(query)) &&
      (!filters.weather || drive.weather === filters.weather) &&
      (!filters.place || drive.startPlace === filters.place || drive.endPlace === filters.place) &&
      drive.distanceKm >= minimumDistance &&
      scorePercent(drive.score) >= minimumScore &&
      drive.startDate >= from &&
      drive.startDate < toExclusive
    );
  });
}
