"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";

const DriveMap = dynamic(() => import("./DriveMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Warming up the map…</div>,
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
    setFileName(file.name);
    setError("");
    try {
      const initSqlJs = (await import("sql.js")).default;
      const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
      const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='ZLOCATION'");
      if (!tables[0]?.values.length) throw new Error("This database does not contain Magica location data.");
      const result = db.exec(`
        SELECT ZLATITUDE, ZLONGITUDE, ZTIMESTAMP, COALESCE(ZPERFORMANCE, 0)
        FROM ZLOCATION
        WHERE ZLATITUDE BETWEEN -90 AND 90 AND ZLONGITUDE BETWEEN -180 AND 180
        ORDER BY COALESCE(ZPERFORMANCE, 0), ZTIMESTAMP
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
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Roadprint home">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>roadprint</span>
        </a>
        <span className="privacy-note"><span className="privacy-dot" /> Your data stays in this browser</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span>MAGICA DRIVE VISUALIZER</span></div>
        <h1>See the roads<br />you <em>really</em> drive.</h1>
        <p className="lede">Turn your Magica backup into a living map of every journey. Brighter roads are the ones you return to most.</p>

        <div
          className={`dropzone ${dragging ? "dragging" : ""} ${status === "error" ? "has-error" : ""}`}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); importFile(e.dataTransfer.files[0]); }}
        >
          <input ref={inputRef} type="file" accept=".magica,.sqlite,.sqlite3,.db" onChange={(e) => importFile(e.target.files?.[0])} />
          <button className="upload-button" onClick={() => inputRef.current?.click()} disabled={status === "reading"}>
            <span className="upload-icon">↑</span>
            {status === "reading" ? "Reading your drives…" : data ? "Choose another backup" : "Choose your Magica backup"}
          </button>
          <span className="drop-copy">or drop a .magica file here</span>
          {status === "error" && <span className="error-copy">{error}</span>}
        </div>

        <div className="trust-row">
          <span>◉ Processed locally</span><span>◇ No account needed</span><span>↯ Ready in seconds</span>
        </div>
      </section>

      <section className={`map-section ${data ? "loaded" : ""}`}>
        <div className="map-heading">
          <div>
            <span className="section-kicker">YOUR ROADPRINT</span>
            <h2>{data ? "Every drive, revealed." : "Your driving world, waiting."}</h2>
          </div>
          {data && <button className="change-file" onClick={() => inputRef.current?.click()}>↻ {fileName}</button>}
        </div>

        <div className="map-frame">
          <DriveMap data={data} />
          {!data && <div className="map-empty">
            <div className="map-pin">⌁</div>
            <strong>Your roads will glow here</strong>
            <span>Upload a backup to trace your journeys across the world.</span>
          </div>}
          {data && <div className="legend"><span>LESS TRAVELLED</span><i /><i /><i /><i /><i /><span>MOST TRAVELLED</span></div>}
        </div>

        {data && <div className="stats">
          <div><span>RECORDED DRIVES</span><strong>{data.trips.toLocaleString()}</strong></div>
          <div><span>DISTANCE TRACED</span><strong>{Math.round(data.distanceKm).toLocaleString()} <small>km</small></strong></div>
          <div><span>GPS POINTS</span><strong>{data.points.length.toLocaleString()}</strong></div>
          <div><span>DRIVING HISTORY</span><strong className="date-stat">{dateRange}</strong></div>
        </div>}
      </section>

      <footer><span>Built for Magica backups.</span><span>Nothing leaves your device.</span></footer>
    </main>
  );
}
