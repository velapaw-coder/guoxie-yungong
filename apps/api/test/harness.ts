import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { app } from "../src/app";
import type { Db, Env, Stmt } from "../src/types";

export class MemoryBucket {
  objects = new Map<string, { data: Uint8Array; contentType?: string }>();

  async put(key: string, value: Uint8Array | ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string } }) {
    const data = typeof value === "string" ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
    this.objects.set(key, { data, contentType: options?.httpMetadata?.contentType });
  }

  async get(key: string) {
    const obj = this.objects.get(key);
    if (!obj) return null;
    const data = obj.data;
    return {
      size: data.byteLength,
      httpMetadata: { contentType: obj.contentType },
      async arrayBuffer() {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      },
      async text() {
        return new TextDecoder().decode(data);
      },
    };
  }
}

export function asDb(sqlite: DatabaseSync): Db {
  const wrap = (sql: string, params: unknown[]): Stmt => ({
    bind(...next: unknown[]) {
      return wrap(sql, next);
    },
    async first<T>(column?: string) {
      const row = sqlite.prepare(sql).get(...(params as never[])) as Record<string, unknown> | undefined;
      if (!row) return null;
      if (column) return (row[column] ?? null) as T;
      return row as T;
    },
    async all<T>() {
      const results = sqlite.prepare(sql).all(...(params as never[])) as T[];
      return { results };
    },
    async run() {
      sqlite.prepare(sql).run(...(params as never[]));
    },
  });
  return {
    prepare(sql: string) {
      return wrap(sql, []);
    },
  };
}

export function setup() {
  const sql = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(sql);
  const env: Env = {
    DB: asDb(sqlite),
    FILES: new MemoryBucket(),
    ENVIRONMENT: "test",
    WEB_ORIGIN: "http://127.0.0.1:43123",
    CONSENT_VERSION: "PIPL-2026-10-15",
    EMAIL_FROM: "notice@guoxie.chang2.ccwu.cc",
    SESSION_PEPPER: "test-pepper",
    ESIGN_WEBHOOK_SECRET: "test-esign",
    SEED: "off",
  };
  return { env, sqlite, app };
}

export async function api(
  env: Env,
  method: string,
  path: string,
  options: { token?: string; json?: unknown; form?: FormData } = {},
) {
  const headers = new Headers();
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  if (options.form) body = options.form;
  const response = await app.request(`http://unit.test${path}`, { method, headers, body }, env);
  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data: data as Record<string, unknown> & { error?: string; id?: string; token?: string }, text, headers: response.headers };
}

export async function login(env: Env, email: string, password: string) {
  const result = await api(env, "POST", "/api/auth/login", { json: { email, password } });
  if (result.status !== 200) throw new Error(`login failed ${result.status} ${result.text}`);
  return result.data.token as string;
}
