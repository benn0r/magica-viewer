/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { createRecordsKindIndex, createRecordsTable } from "../db/schema";

interface D1Result<T> { results?: T[] }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown>;
}

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const recordKinds = new Set(["points", "drives", "places", "fuelEntries", "odometerEntries", "summary"]);

async function initializeDatabase(db: D1Database) {
  await db.batch([db.prepare(createRecordsTable), db.prepare(createRecordsKindIndex)]);
}

async function handleDataApi(request: Request, env: Env) {
  await initializeDatabase(env.DB);
  if (request.method === "GET") {
    const { results = [] } = await env.DB.prepare(
      "SELECT kind, payload FROM records ORDER BY kind, record_key",
    ).all<{ kind: string; payload: string }>();
    const data: Record<string, unknown[]> = {
      points: [], drives: [], places: [], fuelEntries: [], odometerEntries: [],
    };
    let summary: Record<string, unknown> = {};
    for (const row of results) {
      const value = JSON.parse(row.payload);
      if (row.kind === "summary") summary = value;
      else data[row.kind]?.push(value);
    }
    return Response.json({ ...data, ...summary });
  }

  if (request.method === "POST") {
    const body = await request.json() as {
      kind?: string;
      records?: Array<{ key?: string; value?: unknown }>;
    };
    if (!body.kind || !recordKinds.has(body.kind) || !Array.isArray(body.records) || body.records.length > 75) {
      return Response.json({ error: "Invalid sync batch." }, { status: 400 });
    }
    const now = Date.now();
    const statements = body.records.map((record) => {
      if (!record.key || record.value === undefined) throw new Error("Invalid sync record.");
      return env.DB.prepare(`
        INSERT INTO records (kind, record_key, payload, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(kind, record_key) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `).bind(body.kind, record.key, JSON.stringify(record.value), now);
    });
    if (statements.length) await env.DB.batch(statements);
    return Response.json({ synced: statements.length });
  }

  return new Response("Method not allowed", { status: 405 });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/data") {
      try {
        return await handleDataApi(request, env);
      } catch (error) {
        console.error("Persistence API error", error);
        return Response.json({ error: "The persistent database could not be updated." }, { status: 500 });
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
