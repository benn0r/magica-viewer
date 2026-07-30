import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRecordsKindIndex, createRecordsTable } from "../../../db/schema";
import { isRecordValue, isSyncBatch } from "../../../lib/sync-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const databasePath = process.env.SQLITE_PATH || "./data/magica-viewer.sqlite";

function openDatabase() {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec(createRecordsTable);
  database.exec(createRecordsKindIndex);
  return database;
}

export async function GET() {
  const database = openDatabase();
  try {
    const rows = database
      .prepare("SELECT kind, payload FROM records ORDER BY kind, record_key")
      .all() as Array<{ kind: string; payload: string }>;
    const data: Record<string, unknown[]> = {
      points: [],
      drives: [],
      places: [],
      fuelEntries: [],
      odometerEntries: [],
    };
    let ignoredPoints = 0;
    for (const row of rows) {
      let value: unknown;
      try {
        value = JSON.parse(row.payload);
      } catch {
        continue;
      }
      if (!isRecordValue(row.kind, value)) continue;
      if (row.kind === "summary") {
        const candidate = Number((value as { ignoredPoints?: unknown })?.ignoredPoints);
        if (Number.isFinite(candidate) && candidate >= 0) ignoredPoints = candidate;
      } else data[row.kind]?.push(value);
    }
    return Response.json({ ...data, ignoredPoints });
  } finally {
    database.close();
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid sync batch." }, { status: 400 });
  }
  if (!isSyncBatch(body)) {
    return Response.json({ error: "Invalid sync batch." }, { status: 400 });
  }
  const database = openDatabase();
  try {
    const upsert = database.prepare(`
      INSERT INTO records (kind, record_key, payload, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(kind, record_key) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `);
    database.exec("BEGIN IMMEDIATE");
    try {
      const now = Date.now();
      for (const record of body.records) {
        upsert.run(body.kind, record.key, JSON.stringify(record.value), now);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return Response.json({ synced: body.records.length });
  } finally {
    database.close();
  }
}
