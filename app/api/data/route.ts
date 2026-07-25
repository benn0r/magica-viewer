import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRecordsKindIndex, createRecordsTable } from "../../../db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const recordKinds = new Set(["points", "drives", "places", "fuelEntries", "odometerEntries", "summary"]);
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
    const rows = database.prepare("SELECT kind, payload FROM records ORDER BY kind, record_key")
      .all() as Array<{ kind: string; payload: string }>;
    const data: Record<string, unknown[]> = {
      points: [], drives: [], places: [], fuelEntries: [], odometerEntries: [],
    };
    let summary: Record<string, unknown> = {};
    for (const row of rows) {
      const value = JSON.parse(row.payload);
      if (row.kind === "summary") summary = value;
      else data[row.kind]?.push(value);
    }
    return Response.json({ ...data, ...summary });
  } finally {
    database.close();
  }
}

export async function POST(request: Request) {
  const body = await request.json() as {
    kind?: string;
    records?: Array<{ key?: string; value?: unknown }>;
  };
  if (!body.kind || !recordKinds.has(body.kind) || !Array.isArray(body.records) || body.records.length > 75) {
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
        if (!record.key || record.value === undefined) throw new Error("Invalid sync record.");
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
