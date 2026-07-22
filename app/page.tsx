"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";

const DriveMap = dynamic(() => import("./DriveMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
});

export type DrivePoint = { lat: number; lng: number; t: number; trip: number };
export type DriveData = {
  points: DrivePoint[];
  trips: number;
  distanceKm: number;
  firstDate: number;
  lastDate: number;
};

type Status = "idle" | "reading" | "ready" | "error";

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
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<DriveData | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

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
      const result = db.exec(`
        SELECT ZLATITUDE, ZLONGITUDE, ZTIMESTAMP, ZPERFORMANCE
        FROM ZLOCATION
        WHERE ZPERFORMANCE IS NOT NULL
          AND ZLATITUDE BETWEEN -90 AND 90
          AND ZLONGITUDE BETWEEN -180 AND 180
        ORDER BY ZPERFORMANCE, ZTIMESTAMP, Z_PK
      `);
      db.close();
      if (!result[0]?.values.length) throw new Error("No recorded GPS locations were found in this backup.");

      const raw = result[0].values as number[][];
      const points: DrivePoint[] = [];
      let distanceKm = 0;
      let previous: DrivePoint | null = null;
      for (const [lat, lng, appleTime, trip] of raw) {
        const point = { lat, lng, t: (appleTime + 978307200) * 1000, trip };
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
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
      setData({ points, trips: tripCount, distanceKm, firstDate: Math.min(...dates), lastDate: Math.max(...dates) });
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

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">M</span>
          <div><strong>Magica Viewer</strong><span>Drive history explorer</span></div>
        </div>
        <span className="privacy-note"><span className="privacy-dot" /> Local processing only</span>
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
              <div><dt>GPS points</dt><dd>{data ? data.points.length.toLocaleString() : "—"}</dd></div>
              <div><dt>History</dt><dd className="date-stat">{data ? dateRange : "—"}</dd></div>
            </dl>
          </section>
          <div className="local-note"><span>✓</span><p><strong>Private by default</strong>Your backup is processed in this browser and is not uploaded.</p></div>
        </aside>

        <section className="map-workspace" aria-label="Drive map viewer">
          <div className="map-toolbar">
            <div><h2>Map</h2><span>{data ? `${data.trips.toLocaleString()} recorded drives` : "No data loaded"}</span></div>
            {data && <button className="change-file" onClick={() => inputRef.current?.click()}>Change file</button>}
          </div>
          <div className="map-frame">
            <DriveMap data={data} />
            {!data && <div className="map-empty">
              <div className="map-pin" aria-hidden="true">⌖</div>
              <strong>No drive data loaded</strong>
              <span>Open a Magica backup from the panel to display your routes.</span>
              <button onClick={() => inputRef.current?.click()}>Choose file</button>
            </div>}
            {data && <div className="legend"><span>Route density</span><i /><i /><i /><i /><i /><span>High</span></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
