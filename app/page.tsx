"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import StatisticsView from "./StatisticsView";

const DriveMap = dynamic(() => import("./DriveMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});

export type DrivePoint = { lat: number; lng: number; t: number; trip: number };
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
export type SavedPlace = { id: number; name: string; address: string; lat: number; lng: number };
export type FuelEntry = { id: number; amount: number; cost: number; pricePerUnit: number };
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

type Status = "idle" | "reading" | "ready" | "error";
type ActiveView = "map" | "list" | "statistics";

const driveDateFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short", day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});

function formatDuration(startDate: number, endDate: number) {
  const minutes = Math.max(0, Math.round((endDate - startDate) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatScore(score: number) {
  if (!Number.isFinite(score) || score <= 0) return "—";
  return score <= 1 ? `${Math.round(score * 100)}%` : Math.round(score).toString();
}

function displayFileName(file: File) {
  const name = file.name;
  return typeof name === "string" && name.trim() && !name.includes("[object Object]")
    ? name.trim()
    : "Magica backup";
}

function haversine(a: DrivePoint, b: DrivePoint) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const driveListRef = useRef<HTMLDivElement>(null);
  const driveListScrollTopRef = useRef(0);
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<DriveData | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>("map");
  const [selectedTrip, setSelectedTrip] = useState<number | null>(null);
  const [showPlaces, setShowPlaces] = useState(true);
  const [search, setSearch] = useState("");
  const [weatherFilter, setWeatherFilter] = useState("");
  const [placeFilter, setPlaceFilter] = useState("");
  const [minimumDistance, setMinimumDistance] = useState("");
  const [minimumScore, setMinimumScore] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (activeView === "list" && driveListRef.current) {
      driveListRef.current.scrollTop = driveListScrollTopRef.current;
    }
  }, [activeView]);

  const importFile = useCallback(async (file?: File) => {
    if (!file) return;
    setStatus("reading");
    setFileName(displayFileName(file));
    setError("");
    try {
      const initSqlJs = (await import("sql.js")).default;
      const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
      const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='ZLOCATION'");
      if (!tables[0]?.values.length) throw new Error("This database does not contain Magica location data.");
      const totalResult = db.exec("SELECT COUNT(*) FROM ZLOCATION");
      const totalPoints = Number(totalResult[0]?.values[0]?.[0] ?? 0);
      const driveResult = db.exec(`
        SELECT performance.Z_PK, performance.ZSTARTDATE, performance.ZENDDATE,
          performance.ZTOTALDISTANCE, performance.ZSTARTADDRESSCITY,
          performance.ZENDADDRESSCITY, performance.ZAVERAGESPEED,
          performance.ZMAXSPEED, performance.ZDRIVINGSCORE, performance.ZNOTE,
          performance.ZFORECASTSTATE, performance.ZFORECASTTEMPERATURE,
          performance.ZTRIPCONSUMPTIONUNITS, performance.ZTRIPCONSUMPTIONCOST,
          performance.ZCO2, performance.ZODOMETERSTART, performance.ZODOMETEREND,
          COALESCE(start_place.ZNAME, ''), COALESCE(end_place.ZNAME, ''),
          COALESCE((
            SELECT GROUP_CONCAT(tag.ZTITLE, '|')
            FROM Z_13TAGS link
            JOIN ZTAG tag ON tag.Z_PK = link.Z_15TAGS1
            WHERE link.Z_13PERFORMANCES = performance.Z_PK
          ), '')
        FROM ZPERFORMANCE AS performance
        LEFT JOIN ZPLACE start_place ON start_place.Z_PK = performance.ZSTARTPLACE
        LEFT JOIN ZPLACE end_place ON end_place.Z_PK = performance.ZENDPLACE
        ORDER BY performance.ZSTARTDATE DESC
      `);
      const placeResult = db.exec("SELECT Z_PK, ZNAME, ZADDRESS, ZLATITUDE, ZLONGITUDE FROM ZPLACE ORDER BY ZNAME");
      const fuelResult = db.exec(`
        SELECT object.Z_PK, object.ZFUELAMOUNT, object.ZFUELAMOUNTCOST,
          CASE WHEN object.ZFUELAMOUNT > 0 THEN object.ZFUELAMOUNTCOST / object.ZFUELAMOUNT ELSE 0 END
        FROM ZBASECOREDATAOBJECT object
        JOIN Z_PRIMARYKEY entity ON entity.Z_ENT = object.Z_ENT
        WHERE entity.Z_NAME = 'Supply' AND object.ZFUELAMOUNT > 0
        ORDER BY object.Z_PK DESC
      `);
      const odometerResult = db.exec("SELECT ZDATE, ZVALUE FROM ZODOMETERLOG WHERE ZDATE IS NOT NULL AND ZVALUE IS NOT NULL ORDER BY ZDATE");
      const result = db.exec(`
        WITH resolved_locations AS (
          SELECT
            Z_PK, ZLATITUDE, ZLONGITUDE, ZTIMESTAMP,
            ZPERFORMANCE AS ZRESOLVEDPERFORMANCE, 0 AS ZRECOVERED
          FROM ZLOCATION
          WHERE ZPERFORMANCE IS NOT NULL

          UNION ALL

          SELECT
            location.Z_PK, location.ZLATITUDE, location.ZLONGITUDE,
            location.ZTIMESTAMP, performance.Z_PK AS ZRESOLVEDPERFORMANCE,
            1 AS ZRECOVERED
          FROM ZLOCATION AS location
          JOIN ZPERFORMANCE AS performance
            ON location.ZTIMESTAMP BETWEEN performance.ZSTARTDATE AND performance.ZENDDATE
          WHERE location.ZPERFORMANCE IS NULL
        )
        SELECT ZLATITUDE, ZLONGITUDE, ZTIMESTAMP, ZRESOLVEDPERFORMANCE, ZRECOVERED
        FROM resolved_locations
        WHERE ZLATITUDE BETWEEN -90 AND 90
          AND ZLONGITUDE BETWEEN -180 AND 180
        ORDER BY ZRESOLVEDPERFORMANCE, ZTIMESTAMP, Z_PK
      `);
      db.close();
      if (!result[0]?.values.length) throw new Error("No recorded GPS locations were found in this backup.");

      const raw = result[0].values as number[][];
      const drives: DriveDetails[] = (driveResult[0]?.values ?? []).map((row) => ({
        id: Number(row[0]),
        startDate: (Number(row[1]) + 978307200) * 1000,
        endDate: (Number(row[2]) + 978307200) * 1000,
        distanceKm: Number(row[3] ?? 0) / 1000,
        startCity: String(row[4] ?? ""),
        endCity: String(row[5] ?? ""),
        averageSpeedKmh: Number(row[6] ?? 0) * 3.6,
        maxSpeedKmh: Number(row[7] ?? 0) * 3.6,
        score: Number(row[8] ?? 0),
        note: String(row[9] ?? ""),
        weather: String(row[10] ?? ""),
        temperatureC: Number(row[11] ?? 0),
        consumptionUnits: Number(row[12] ?? 0),
        consumptionCost: Number(row[13] ?? 0),
        co2Kg: Number(row[14] ?? 0) / 1000,
        odometerStart: Number(row[15] ?? 0),
        odometerEnd: Number(row[16] ?? 0),
        startPlace: String(row[17] ?? ""),
        endPlace: String(row[18] ?? ""),
        tags: String(row[19] ?? "").split("|").filter(Boolean),
      }));
      const places: SavedPlace[] = (placeResult[0]?.values ?? []).map((row) => ({
        id: Number(row[0]), name: String(row[1] ?? ""), address: String(row[2] ?? ""),
        lat: Number(row[3]), lng: Number(row[4]),
      }));
      const fuelEntries: FuelEntry[] = (fuelResult[0]?.values ?? []).map((row) => ({
        id: Number(row[0]), amount: Number(row[1] ?? 0), cost: Number(row[2] ?? 0), pricePerUnit: Number(row[3] ?? 0),
      }));
      const odometerEntries: OdometerEntry[] = (odometerResult[0]?.values ?? []).map((row) => ({
        date: (Number(row[0]) + 978307200) * 1000, value: Number(row[1]),
      }));
      const points: DrivePoint[] = [];
      let distanceKm = 0;
      let recoveredPoints = 0;
      let previous: DrivePoint | null = null;
      for (const [lat, lng, appleTime, trip, recovered] of raw) {
        const point = { lat, lng, t: (appleTime + 978307200) * 1000, trip };
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
        if (recovered === 1) recoveredPoints += 1;
        if (previous && previous.trip === point.trip) {
          const gap = point.t - previous.t;
          const d = haversine(previous, point);
          if (gap >= 0 && gap < 60 * 60 * 1000 && d < 20) distanceKm += d;
        }
        points.push(point);
        previous = point;
      }
      const tripCount = new Set(points.map((p) => p.trip)).size;
      const dates = points.map((p) => p.t).filter(Number.isFinite);
      setData({
        points,
        drives,
        trips: tripCount,
        distanceKm,
        firstDate: Math.min(...dates),
        lastDate: Math.max(...dates),
        totalPoints,
        recoveredPoints,
        ignoredPoints: Math.max(0, totalPoints - points.length),
        places,
        fuelEntries,
        odometerEntries,
      });
      setSelectedTrip(null);
      driveListScrollTopRef.current = 0;
      setActiveView("map");
      setSearch(""); setWeatherFilter(""); setPlaceFilter(""); setMinimumDistance(""); setMinimumScore(""); setDateFrom(""); setDateTo("");
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setData(null);
      setError(err instanceof Error ? err.message : "The file could not be read.");
    }
  }, []);

  const dateRange = data
    ? `${new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(data.firstDate)} — ${new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(data.lastDate)}`
    : "";
  const selectedDrive = data?.drives.find((drive) => drive.id === selectedTrip) ?? null;
  const weatherOptions = useMemo(() => Array.from(new Set(data?.drives.map((drive) => drive.weather).filter(Boolean) ?? [])).sort(), [data]);
  const filteredDrives = useMemo(() => {
    if (!data) return [];
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Infinity;
    const query = search.trim().toLowerCase();
    return data.drives.filter((drive) => {
      const scorePercent = drive.score <= 1 ? drive.score * 100 : drive.score;
      const haystack = [drive.startCity, drive.endCity, drive.startPlace, drive.endPlace, drive.weather, ...drive.tags].join(" ").toLowerCase();
      return (!query || haystack.includes(query))
        && (!weatherFilter || drive.weather === weatherFilter)
        && (!placeFilter || drive.startPlace === placeFilter || drive.endPlace === placeFilter)
        && drive.distanceKm >= Number(minimumDistance || 0)
        && scorePercent >= Number(minimumScore || 0)
        && drive.startDate >= from && drive.startDate <= to;
    });
  }, [data, dateFrom, dateTo, minimumDistance, minimumScore, placeFilter, search, weatherFilter]);

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">M</span>
          <div><strong>Magica Viewer</strong><span>Drive history explorer</span></div>
        </div>
      </header>

      <div className="viewer-layout">
        <aside className="sidebar">
          <section className="panel-section">
            <h1>Drive history</h1>
            <p>Open a Magica backup to view recorded routes and basic trip statistics.</p>
            <div
              className={`dropzone ${dragging ? "dragging" : ""} ${status === "error" ? "has-error" : ""}`}
              onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); importFile(e.dataTransfer.files[0]); }}
            >
              <input ref={inputRef} type="file" accept=".magica,.sqlite,.sqlite3,.db" onChange={(e) => importFile(e.target.files?.[0])} />
              <button className="upload-button" onClick={() => inputRef.current?.click()} disabled={status === "reading"}>
                {status === "reading" ? "Reading backup…" : data ? "Open another file" : "Open Magica backup"}
              </button>
              <span className="drop-copy">or drag and drop a .magica file</span>
              {status === "error" && <div className="error-copy" role="alert">{error}</div>}
            </div>
          </section>

          <section className="panel-section file-section">
            <h2>Current file</h2>
            {data ? <div className="file-card"><span className="file-badge">DB</span><div><strong>{fileName}</strong><span>{data.points.length.toLocaleString()} GPS points</span></div></div> : <p className="empty-copy">No backup opened</p>}
          </section>

          <section className="panel-section summary-section">
            <h2>Summary</h2>
            <dl className="stats">
              <div><dt>Recorded drives</dt><dd>{data ? data.trips.toLocaleString() : "—"}</dd></div>
              <div><dt>Distance traced</dt><dd>{data ? `${Math.round(data.distanceKm).toLocaleString()} km` : "—"}</dd></div>
              <div><dt>GPS points in backup</dt><dd>{data ? data.totalPoints.toLocaleString() : "—"}</dd></div>
              <div><dt>GPS points mapped</dt><dd>{data ? data.points.length.toLocaleString() : "—"}</dd></div>
              <div><dt>Recovered points</dt><dd>{data ? data.recoveredPoints.toLocaleString() : "—"}</dd></div>
              <div><dt>Ignored points</dt><dd>{data ? data.ignoredPoints.toLocaleString() : "—"}</dd></div>
              <div><dt>History</dt><dd className="date-stat">{data ? dateRange : "—"}</dd></div>
            </dl>
          </section>
        </aside>

        <section className="map-workspace" aria-label="Drive history viewer">
          <div className="map-toolbar">
            <div className="view-tabs" role="tablist" aria-label="Drive views">
              <button role="tab" aria-selected={activeView === "map"} className={activeView === "map" ? "active" : ""} onClick={() => setActiveView("map")}>Map</button>
              <button role="tab" aria-selected={activeView === "list"} className={activeView === "list" ? "active" : ""} onClick={() => setActiveView("list")} disabled={!data}>List</button>
              <button role="tab" aria-selected={activeView === "statistics"} className={activeView === "statistics" ? "active" : ""} onClick={() => setActiveView("statistics")} disabled={!data}>Statistics</button>
            </div>
            <span className="toolbar-summary">{data ? `${data.trips.toLocaleString()} recorded drives` : "No data loaded"}</span>
            {data && activeView === "map" && <label className="place-toggle"><input type="checkbox" checked={showPlaces} onChange={(event) => setShowPlaces(event.target.checked)} /> Places</label>}
            {data && <button className="change-file" onClick={() => inputRef.current?.click()}>Change file</button>}
          </div>
          {activeView === "map" ? <div className="map-frame" role="tabpanel">
              <DriveMap data={data} selectedTrip={selectedTrip} showPlaces={showPlaces} />
              {!data && <div className="map-empty">
                <div className="map-pin" aria-hidden="true">⌖</div>
                <strong>No drive data loaded</strong>
                <span>Open a Magica backup from the panel to display your routes.</span>
                <button onClick={() => inputRef.current?.click()}>Choose file</button>
              </div>}
              {data && <div className="legend"><span>Route density</span><i /><i /><i /><i /><i /><span>High</span></div>}
              {selectedDrive && <aside className="drive-detail-card" aria-label="Selected drive details">
                <button className="detail-close" aria-label="Close drive details" onClick={() => setSelectedTrip(null)}>×</button>
                <span className="detail-date">{driveDateFormatter.format(selectedDrive.startDate)}</span>
                <h3>{selectedDrive.startPlace || selectedDrive.startCity || "Unknown start"} <span>→</span> {selectedDrive.endPlace || selectedDrive.endCity || "Unknown destination"}</h3>
                <dl className="detail-grid">
                  <div><dt>Distance</dt><dd>{selectedDrive.distanceKm.toFixed(1)} km</dd></div>
                  <div><dt>Duration</dt><dd>{formatDuration(selectedDrive.startDate, selectedDrive.endDate)}</dd></div>
                  <div><dt>Average</dt><dd>{Math.round(selectedDrive.averageSpeedKmh)} km/h</dd></div>
                  <div><dt>Maximum</dt><dd>{Math.round(selectedDrive.maxSpeedKmh)} km/h</dd></div>
                  <div><dt>Score</dt><dd>{formatScore(selectedDrive.score)}</dd></div>
                  <div><dt>Weather</dt><dd>{selectedDrive.weather || "—"}{selectedDrive.temperatureC ? `, ${Math.round(selectedDrive.temperatureC)}°C` : ""}</dd></div>
                  <div><dt>Consumption</dt><dd>{selectedDrive.consumptionUnits.toFixed(2)}</dd></div>
                  <div><dt>Fuel cost</dt><dd>CHF {selectedDrive.consumptionCost.toFixed(2)}</dd></div>
                  <div><dt>CO₂</dt><dd>{selectedDrive.co2Kg.toFixed(2)} kg</dd></div>
                  <div><dt>Odometer</dt><dd>{selectedDrive.odometerStart.toFixed(0)} → {selectedDrive.odometerEnd.toFixed(0)} km</dd></div>
                </dl>
                {selectedDrive.tags.length > 0 && <div className="detail-tags">{selectedDrive.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
                {selectedDrive.note && <p>{selectedDrive.note}</p>}
              </aside>}
            </div> : <div className="drive-list-frame" role="tabpanel">
              {activeView === "statistics" && data ? <StatisticsView data={data} /> : <>
              <div className="drive-list-header">
                <div><strong>Recorded drives</strong><span>Select a drive to focus it on the map.</span></div>
                <span>{filteredDrives.length.toLocaleString()} of {data?.drives.length.toLocaleString()} drives</span>
              </div>
              <div className="drive-filters">
                <input aria-label="Search drives" placeholder="Search city, place or tag" value={search} onChange={(event) => setSearch(event.target.value)} />
                <input aria-label="From date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                <input aria-label="To date" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                <select aria-label="Weather" value={weatherFilter} onChange={(event) => setWeatherFilter(event.target.value)}><option value="">All weather</option>{weatherOptions.map((weather) => <option key={weather}>{weather}</option>)}</select>
                <select aria-label="Saved place" value={placeFilter} onChange={(event) => setPlaceFilter(event.target.value)}><option value="">All places</option>{data?.places.map((place) => <option key={place.id} value={place.name}>{place.name}</option>)}</select>
                <input aria-label="Minimum distance" type="number" min="0" placeholder="Min km" value={minimumDistance} onChange={(event) => setMinimumDistance(event.target.value)} />
                <input aria-label="Minimum score" type="number" min="0" max="100" placeholder="Min score" value={minimumScore} onChange={(event) => setMinimumScore(event.target.value)} />
                <button onClick={() => { setSearch(""); setWeatherFilter(""); setPlaceFilter(""); setMinimumDistance(""); setMinimumScore(""); setDateFrom(""); setDateTo(""); }}>Clear</button>
              </div>
              <div
                ref={driveListRef}
                className="drive-list"
                onScroll={(event) => { driveListScrollTopRef.current = event.currentTarget.scrollTop; }}
              >
                {filteredDrives.map((drive) => <button
                  key={drive.id}
                  className={`drive-row ${selectedTrip === drive.id ? "selected" : ""}`}
                  onClick={() => { setSelectedTrip(drive.id); setActiveView("map"); }}
                >
                  <span className="drive-date">{driveDateFormatter.format(drive.startDate)}</span>
                  <span className="drive-route"><strong>{drive.startCity || "Unknown start"}</strong><i aria-hidden="true">→</i><strong>{drive.endCity || "Unknown destination"}</strong>{drive.note && <small>{drive.note}</small>}</span>
                  <span className="drive-metrics">
                    <span><strong>{drive.distanceKm.toFixed(1)} km</strong><small>Distance</small></span>
                    <span><strong>{formatDuration(drive.startDate, drive.endDate)}</strong><small>Duration</small></span>
                    <span><strong>{Math.round(drive.averageSpeedKmh)} km/h</strong><small>Average</small></span>
                    <span><strong>{Math.round(drive.maxSpeedKmh)} km/h</strong><small>Maximum</small></span>
                    <span><strong>{formatScore(drive.score)}</strong><small>Score</small></span>
                  </span>
                </button>)}
              </div>
              </>}
            </div>}
        </section>
      </div>
    </main>
  );
}
