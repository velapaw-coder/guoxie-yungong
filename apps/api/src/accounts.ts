import { COPY } from "../../../packages/domain/src/index.ts";
import { audit } from "./audit";
import type { Actor, Ctx, UserKind, UserRow } from "./types";
import { HttpError, hashPassword, id, many, one, randomToken, requireActor, requireRoles, run, sessionPepper, sha256Text, verifyPassword } from "./util";

const ROLES = ["admin", "issuer", "acceptor", "payment_maker", "payment_checker", "privacy_officer", "auditor"] as const;

export async function loadActor(ctx: Ctx, user: UserRow): Promise<Actor> {
  const roles = await many<{ role: string }>(ctx.db, "select role from user_roles where user_id = ?", user.id);
  return {
    id: user.id,
    name: user.name,
    kind: user.kind,
    email: user.email,
    roles: roles.map((row) => row.role),
    status: user.status,
  };
}

export function publicUser(user: UserRow, roles: string[]) {
  return {
    id: user.id,
    kind: user.kind,
    name: user.name,
    email: user.email,
    designatedEmail: user.designated_email,
    phone: user.phone,
    status: user.status,
    identityStatus: user.identity_status,
    idNumberMasked: user.id_number_masked,
    settlementFlag: user.settlement_flag,
    createdAt: user.created_at,
    disabledAt: user.disabled_at,
    roles,
    labels: user.kind === "operator" ? null : COPY[user.kind],
  };
}

export async function mustUser(ctx: Ctx, userId: string): Promise<UserRow> {
  const user = await one<UserRow>(ctx.db, "select * from users where id = ?", userId);
  if (!user) throw new HttpError(404, "没有这个账号");
  return user;
}

export async function actorFromToken(ctx: Ctx, token: string | null): Promise<Actor | null> {
  if (!token) return null;
  const tokenHash = await sha256Text(token);
  const user = await one<UserRow>(
    ctx.db,
    `select u.* from sessions s join users u on u.id = s.user_id
     where s.token_hash = ? and s.expires_at > ?`,
    tokenHash,
    new Date().toISOString(),
  );
  if (!user) return null;
  return loadActor(ctx, user);
}

async function insertUser(ctx: Ctx, input: {
  kind: UserKind;
  name: string;
  email: string;
  designatedEmail: string;
  phone: string;
  password: string;
  platformAgreed: boolean;
}): Promise<UserRow> {
  if (input.password.length < 8) throw new HttpError(400, "密码至少 8 位");
  if (!input.platformAgreed && input.kind !== "operator") throw new HttpError(400, "请先阅读并同意平台服务协议");
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "邮箱格式不正确");
  const existing = await one(ctx.db, "select id from users where email = ?", email);
  if (existing) throw new HttpError(409, "这个邮箱已经注册");
  const userId = id();
  const passwordHash = await hashPassword(input.password, sessionPepper(ctx.env));
  await run(
    ctx.db,
    `insert into users
      (id, kind, name, email, designated_email, phone, password_hash, status, identity_status, platform_agreed_at, created_at)
     values (?, ?, ?, ?, ?, ?, ?, 'active', 'none', ?, ?)`,
    userId,
    input.kind,
    input.name.trim(),
    email,
    input.designatedEmail.trim().toLowerCase(),
    input.phone.trim(),
    passwordHash,
    input.platformAgreed ? ctx.now() : null,
    ctx.now(),
  );
  return mustUser(ctx, userId);
}

export async function registerPerson(ctx: Ctx, input: {
  kind: "employee" | "collaborator";
  name: string;
  email: string;
  designatedEmail: string;
  phone: string;
  password: string;
  platformAgreed: boolean;
}) {
  if (input.kind !== "employee" && input.kind !== "collaborator") {
    throw new HttpError(400, "注册时只能选择劳动员工或项目合作方，且以后不能更改");
  }
  const user = await insertUser(ctx, input);
  const actor = await loadActor(ctx, user);
  await audit({ ...ctx, actor }, {
    action: "user.register",
    objectType: "user",
    objectId: user.id,
    after: { kind: user.kind, email: user.email },
  });
  return publicUser(user, []);
}

export async function createOperator(ctx: Ctx, input: {
  name: string;
  email: string;
  designatedEmail: string;
  phone: string;
  password: string;
  roles: string[];
}) {
  const count = await one<{ n: number }>(ctx.db, "select count(*) as n from users");
  if (count && Number(count.n) > 0) requireRoles(ctx, ["admin"]);
  const roles = [...new Set(input.roles)];
  if (roles.length === 0 || roles.some((role) => !ROLES.includes(role as (typeof ROLES)[number]))) {
    throw new HttpError(400, "请选择有效的岗位权限");
  }
  const user = await insertUser(ctx, { ...input, kind: "operator", platformAgreed: true });
  for (const role of roles) {
    await run(ctx.db, "insert into user_roles (user_id, role) values (?, ?)", user.id, role);
  }
  await audit(ctx, {
    action: "user.create_operator",
    objectType: "user",
    objectId: user.id,
    after: { email: user.email, roles },
    actorName: ctx.actor ? undefined : "系统初始化",
  });
  return publicUser(user, roles);
}

export async function replaceRoles(ctx: Ctx, userId: string, roles: string[]) {
  requireRoles(ctx, ["admin"]);
  const user = await mustUser(ctx, userId);
  if (user.kind !== "operator") throw new HttpError(409, "劳动员工和项目合作方不能授予管理岗位");
  const next = [...new Set(roles)];
  if (next.some((role) => !ROLES.includes(role as (typeof ROLES)[number]))) {
    throw new HttpError(400, "包含无效岗位");
  }
  const before = await many<{ role: string }>(ctx.db, "select role from user_roles where user_id = ?", userId);
  await run(ctx.db, "delete from user_roles where user_id = ?", userId);
  for (const role of next) await run(ctx.db, "insert into user_roles (user_id, role) values (?, ?)", userId, role);
  await audit(ctx, {
    action: "user.roles",
    objectType: "user",
    objectId: userId,
    before: before.map((row) => row.role),
    after: next,
  });
}

export async function login(ctx: Ctx, email: string, password: string) {
  const user = await one<UserRow>(ctx.db, "select * from users where email = ?", email.trim().toLowerCase());
  if (!user || !(await verifyPassword(password, sessionPepper(ctx.env), user.password_hash))) {
    throw new HttpError(401, "邮箱或密码不正确");
  }
  if (user.status !== "active") throw new HttpError(403, "账号已停用，无法登录");
  const token = randomToken();
  const tokenHash = await sha256Text(token);
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await run(
    ctx.db,
    "insert into sessions (id, user_id, token_hash, created_at, expires_at) values (?, ?, ?, ?, ?)",
    id(),
    user.id,
    tokenHash,
    new Date().toISOString(),
    expires,
  );
  const actor = await loadActor(ctx, user);
  await audit({ ...ctx, actor }, { action: "auth.login", objectType: "user", objectId: user.id });
  return { token, user: publicUser(user, actor.roles) };
}

export async function logout(ctx: Ctx, token: string) {
  const actor = requireActor(ctx);
  const tokenHash = await sha256Text(token);
  await run(ctx.db, "delete from sessions where token_hash = ?", tokenHash);
  await audit(ctx, { action: "auth.logout", objectType: "user", objectId: actor.id });
}

export async function createPrivacyRequest(ctx: Ctx, type: string, content: string) {
  const actor = requireActor(ctx);
  if (!["access", "correction", "deletion", "complaint"].includes(type)) {
    throw new HttpError(400, "申请类型不正确");
  }
  if (content.trim().length < 2) throw new HttpError(400, "请填写申请内容");
  const requestId = id();
  await run(
    ctx.db,
    `insert into requests (id, user_id, type, content, status, created_at, updated_at)
     values (?, ?, ?, ?, 'submitted', ?, ?)`,
    requestId,
    actor.id,
    type,
    content.trim(),
    ctx.now(),
    ctx.now(),
  );
  await audit(ctx, { action: "privacy.submit", objectType: "request", objectId: requestId, after: { type } });
  return { id: requestId };
}

export async function handlePrivacyRequest(ctx: Ctx, requestId: string, status: string, resolution: string) {
  requireRoles(ctx, ["privacy_officer", "admin"]);
  if (!["accepted", "done", "rejected"].includes(status)) throw new HttpError(400, "处理状态不正确");
  if (resolution.trim().length < 2) throw new HttpError(400, "请填写处理说明");
  const current = await one<{ id: string; status: string }>(ctx.db, "select id, status from requests where id = ?", requestId);
  if (!current) throw new HttpError(404, "没有这份申请");
  await run(
    ctx.db,
    "update requests set status = ?, handler_id = ?, resolution = ?, updated_at = ? where id = ?",
    status,
    ctx.actor?.id,
    resolution.trim(),
    ctx.now(),
    requestId,
  );
  await audit(ctx, {
    action: "privacy.handle",
    objectType: "request",
    objectId: requestId,
    before: { status: current.status },
    after: { status, resolution: resolution.trim() },
  });
}
