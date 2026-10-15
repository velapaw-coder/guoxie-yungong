import type { Ctx, Db, Env, Upload } from "./types";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
  ) {
    super(message);
  }
}

const RULE_SNIPPETS = [
  "人员类型一经确定不可更改",
  "审计日志只允许追加",
  "合同人员类型与账号类型不一致",
  "劳动员工只能签署劳动合同",
  "项目合作方只能签署服务协议",
  "劳动合同不适用沉默视为确认",
  "约定沉默确认时必须写明天数",
  "合同类型不可更改",
  "人员类型与任务类型不一致",
  "账号已停用",
  "未完成实名认证，不能发单",
  "未完成个人信息单独同意，不能发单",
  "合同未签署，不能发单",
  "任务类型与合同类型不一致",
  "任务与合同不属于同一人",
  "合同未处于已签署状态，不能提交成果",
  "发单人与验收人不能是同一人",
  "当事人不能验收自己的成果",
  "驳回必须填写原因",
  "验收通过后才能上传核算单",
  "核算单类型与任务类型不一致",
  "核算单与任务不属于同一人",
  "劳动员工只能使用工资核算单",
  "项目合作方只能使用服务费核算单",
  "核算单类型不可更改",
  "未事先约定，沉默不构成确认",
  "劳动员工的工资核算单不适用沉默确认",
  "核算单尚未确认，不能登记付款",
  "登记金额必须与已确认核算单一致",
  "付款登记与核算单不属于同一人",
  "付款登记类型与核算单类型不一致",
  "复核人与制单人不能是同一人",
  "制单人不可更改",
];

export function ruleMessage(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : String(error);
  return RULE_SNIPPETS.find((snippet) => raw.includes(snippet)) ?? null;
}

export function sessionPepper(env: Env): string {
  if (env.SESSION_PEPPER) return env.SESSION_PEPPER;
  if (env.ENVIRONMENT === "prod") throw new HttpError(500, "未配置 SESSION_PEPPER");
  return "dev-session-pepper";
}

export function esignSecret(env: Env): string {
  if (env.ESIGN_WEBHOOK_SECRET) return env.ESIGN_WEBHOOK_SECRET;
  if (env.ENVIRONMENT === "prod") throw new HttpError(500, "未配置 ESIGN_WEBHOOK_SECRET");
  return "dev-esign-webhook-secret";
}

export function bodyBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function sha256Hex(data: Uint8Array | ArrayBuffer): Promise<string> {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", bodyBuffer(view));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Text(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(password: string, pepper: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${pepper}:${password}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: bodyBuffer(salt), iterations, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, pepper, salt, 10_000);
  return `pbkdf2$10000$${hex(salt)}$${hex(bits)}`;
}

export async function verifyPassword(password: string, pepper: string, stored: string): Promise<boolean> {
  const [scheme, iter, saltHex, hashHex] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !saltHex || !hashHex) return false;
  const bits = await derive(password, pepper, fromHex(saltHex), Number(iter));
  const actual = hex(bits);
  if (actual.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

export function randomToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

export function id(): string {
  return crypto.randomUUID();
}

export async function one<T>(db: Db, sql: string, ...params: unknown[]): Promise<T | null> {
  const row = await db.prepare(sql).bind(...params).first<T>();
  return (row ?? null) as T | null;
}

export async function many<T>(db: Db, sql: string, ...params: unknown[]): Promise<T[]> {
  const out = await db.prepare(sql).bind(...params).all<T>();
  return (out.results ?? []) as T[];
}

export async function run(db: Db, sql: string, ...params: unknown[]): Promise<void> {
  try {
    await db.prepare(sql).bind(...params).run();
  } catch (error) {
    const friendly = ruleMessage(error);
    if (friendly) throw new HttpError(409, friendly, "RULE");
    throw error;
  }
}

export function requireActor(ctx: Ctx) {
  if (!ctx.actor) throw new HttpError(401, "请先登录");
  if (ctx.actor.status !== "active") throw new HttpError(403, "账号已停用，无法登录");
  return ctx.actor;
}

export function requireRoles(ctx: Ctx, roles: string[]) {
  const actor = requireActor(ctx);
  if (!roles.some((role) => actor.roles.includes(role))) {
    throw new HttpError(403, "当前岗位没有这项权限");
  }
  return actor;
}

export function assertCents(value: unknown): number {
  const amount = typeof value === "string" ? Number(value) : value;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || amount > 100_000_000_00) {
    throw new HttpError(400, "金额须为非负整数，单位是分");
  }
  return amount;
}

export function assertText(value: unknown, label: string, min = 2): string {
  if (typeof value !== "string" || value.trim().length < min) {
    throw new HttpError(400, `请填写${label}`);
  }
  return value.trim();
}

export function clientIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
}

export function allowedFile(file: File): Upload {
  if (file.size <= 0) throw new HttpError(400, "附件是空的");
  if (file.size > 10 * 1024 * 1024) throw new HttpError(400, "附件不能超过 10MB");
  const name = file.name || "file";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const allowed = new Set(["pdf", "txt", "png", "jpg", "jpeg", "xlsx", "xls"]);
  if (!allowed.has(ext)) throw new HttpError(400, "附件仅支持 PDF、Excel、图片或文本");
  return {
    bytes: new Uint8Array(),
    filename: name,
    contentType: file.type || "application/octet-stream",
  };
}

export async function uploadFromFile(file: File): Promise<Upload> {
  const checked = allowedFile(file);
  checked.bytes = new Uint8Array(await file.arrayBuffer());
  return checked;
}

export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function jsonError(error: unknown): { status: number; body: { error: string; code: string } } {
  if (error instanceof HttpError) return { status: error.status, body: { error: error.message, code: error.code } };
  const friendly = ruleMessage(error);
  if (friendly) return { status: 409, body: { error: friendly, code: "RULE" } };
  console.error(error);
  return { status: 500, body: { error: "系统未能完成这项操作", code: "INTERNAL" } };
}

export function maskId(idNumber: string): string {
  return `${idNumber.slice(0, 3)}${"*".repeat(11)}${idNumber.slice(-4)}`;
}

export function assertIdNumber(idNumber: string, now = new Date()): void {
  if (!/^\d{17}[\dXx]$/.test(idNumber)) throw new HttpError(400, "身份证号格式不正确");
  const year = Number(idNumber.slice(6, 10));
  const month = Number(idNumber.slice(10, 12));
  const day = Number(idNumber.slice(12, 14));
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) {
    throw new HttpError(400, "身份证号中的出生日期无效");
  }
  const sixteen = new Date(Date.UTC(year + 16, month - 1, day));
  if (now < sixteen) throw new HttpError(400, "未满十六周岁，不能在本平台登记");
}

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/【([^】]+)】/g, (token, key: string) => vars[key] ?? token);
}

export function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}
