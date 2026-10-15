import { Hono } from "hono";
import { actorFromToken, createOperator, createPrivacyRequest, handlePrivacyRequest, login, logout, replaceRoles } from "./accounts";
import { loadActor, mustUser, publicUser, registerPerson } from "./accounts";
import { applyEsignWebhook, applyIdentityWebhook, completeMockSign, createContract, recordConsent, startIdentity, terminateContract } from "./compliance";
import {
  confirmByToken,
  confirmStatement,
  createPayment,
  createStatement,
  createTask,
  decideAcceptance,
  decidePayment,
  objectStatement,
  sendStatement,
  submitDeliverable,
  voidStatement,
} from "./fulfillment";
import { createBackup, evidenceZip, runMaintenance } from "./maintenance";
import { readFile } from "./files";
import {
  activateTemplate,
  auditCsv,
  canReadFile,
  confirmPreview,
  dossier,
  listAudit,
  listBackups,
  listContracts,
  listMoney,
  listOutbox,
  listPeople,
  listRequests,
  listTemplates,
  mockEsignPreview,
  platformMeta,
  saveTemplate,
  taskDetail,
} from "./read";
import { ensureSeed } from "./seed";
import type { Env, PersonKind, TaskRow } from "./types";
import { HttpError, bodyBuffer, contentDisposition, jsonError, one, uploadFromFile } from "./util";

export const app = new Hono<{ Bindings: Env }>();

const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:43123",
  "http://localhost:43123",
  "https://guoxie.chang2.ccwu.cc",
]);

function allowOrigin(c: { req: { header: (name: string) => string | undefined }; env: Env; header: (name: string, value: string) => void }) {
  const origin = c.req.header("origin");
  const allowed = origin && (ALLOWED_ORIGINS.has(origin) || origin === c.env.WEB_ORIGIN);
  if (allowed && origin) {
    c.header("access-control-allow-origin", origin);
    c.header("access-control-allow-headers", "authorization,content-type");
    c.header("access-control-allow-methods", "GET,POST,OPTIONS");
    c.header("vary", "origin");
  }
}

app.use("*", async (c, next) => {
  if (c.req.method !== "OPTIONS" && c.req.path.startsWith("/api")) {
    try {
      await ensureSeed(c.env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "初始化失败";
      const friendly = message.includes("no such table") ? "数据库迁移尚未执行" : message;
      allowOrigin(c);
      return c.json({ error: friendly, code: "SEED" }, 500);
    }
  }
  await next();
  allowOrigin(c);
});

app.options("*", (c) => c.body(null, 204));

app.onError((error, c) => {
  const mapped = jsonError(error);
  allowOrigin(c);
  return c.json(mapped.body, mapped.status as 400);
});

app.notFound((c) => c.json({ error: "没有这个接口", code: "NOT_FOUND" }, 404));

async function ctxOf(c: { env: Env; req: { header: (name: string) => string | undefined } }) {
  const header = c.req.header("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const ctx = {
    db: c.env.DB,
    bucket: c.env.FILES,
    env: c.env,
    actor: null as Awaited<ReturnType<typeof actorFromToken>>,
    ip: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
    ua: c.req.header("user-agent") ?? null,
    now: () => new Date().toISOString(),
  };
  ctx.actor = await actorFromToken(ctx, token || null);
  return { ctx, token };
}

async function bodyOf<T>(c: { req: { json: () => Promise<T> } }): Promise<T> {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new HttpError(400, "请求格式不正确");
  return body;
}

function assertAccess(env: Env, header: string | undefined) {
  if (env.ENVIRONMENT !== "prod") return;
  if (!env.ACCESS_AUD && !env.ACCESS_TEAM_DOMAIN) return;
  if (!header) throw new HttpError(401, "管理功能需要经过 Cloudflare Access");
  const part = header.split(".")[1];
  if (!part) throw new HttpError(401, "Cloudflare Access 凭证无效");
  const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { aud?: string | string[]; exp?: number };
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
    throw new HttpError(401, "Cloudflare Access 登录已过期");
  }
  if (env.ACCESS_AUD) {
    const aud = payload.aud;
    const ok = Array.isArray(aud) ? aud.includes(env.ACCESS_AUD) : aud === env.ACCESS_AUD;
    if (!ok) throw new HttpError(403, "Cloudflare Access 受众不匹配");
  }
}

async function kindTask(c: { env: Env }, taskId: string, kind: PersonKind): Promise<TaskRow> {
  const task = await one<TaskRow>(c.env.DB, "select * from tasks where id = ?", taskId);
  if (!task || task.person_kind !== kind) {
    throw new HttpError(404, kind === "employee" ? "这不是劳动员工的工作任务" : "这不是项目合作方的任务单");
  }
  return task;
}

app.get("/api/health", async (c) => {
  const count = await one<{ n: number }>(c.env.DB, "select count(*) as n from users");
  return c.json({ ok: true, service: "guoxie-yungong", environment: c.env.ENVIRONMENT, seeded: Number(count?.n ?? 0) > 0 });
});

app.get("/api/meta", async (c) => c.json(await platformMeta()));

app.post("/api/auth/register", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ kind: "employee" | "collaborator"; name: string; email: string; designatedEmail: string; phone: string; password: string; platformAgreed: boolean }>(c);
  return c.json(await registerPerson(ctx, body), 201);
});

app.post("/api/auth/login", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ email: string; password: string }>(c);
  return c.json(await login(ctx, body.email, body.password));
});

app.post("/api/auth/logout", async (c) => {
  const { ctx, token } = await ctxOf(c);
  await logout(ctx, token);
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => {
  const { ctx } = await ctxOf(c);
  if (!ctx.actor) return c.json({ error: "请先登录", code: "ERROR" }, 401);
  if (ctx.actor.status !== "active") return c.json({ error: "账号已停用，无法登录", code: "ERROR" }, 403);
  const user = await mustUser(ctx, ctx.actor.id);
  return c.json(publicUser(user, (await loadActor(ctx, user)).roles));
});

app.post("/api/consent", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ idNumberAgreed: boolean; faceAgreed: boolean; faceAlternative: string | null; bankAgreed: boolean; thirdPartyAgreed: boolean }>(c);
  return c.json(await recordConsent(ctx, body), 201);
});

app.post("/api/identity", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ legalName: string; idNumber: string; phone: string; method: "three_factor" | "offline" }>(c);
  return c.json(await startIdentity(ctx, body));
});

app.post("/api/webhooks/identity", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ providerRef: string; passed: boolean }>(c);
  await applyIdentityWebhook(ctx, body.providerRef, body.passed, c.req.header("x-esign-secret") ?? "");
  return c.json({ ok: true });
});

app.get("/api/employees", async (c) => c.json(await listPeople((await ctxOf(c)).ctx, "employee")));
app.get("/api/collaborators", async (c) => c.json(await listPeople((await ctxOf(c)).ctx, "collaborator")));
app.get("/api/employees/:id", async (c) => c.json(await dossier((await ctxOf(c)).ctx, "employee", c.req.param("id"))));
app.get("/api/collaborators/:id", async (c) => c.json(await dossier((await ctxOf(c)).ctx, "collaborator", c.req.param("id"))));

app.post("/api/labor-contracts", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ personId: string; silentConfirmAgreed?: boolean }>(c);
  if (body.silentConfirmAgreed) throw new HttpError(409, "劳动合同不适用沉默视为确认");
  const person = await mustUser(ctx, body.personId);
  if (person.kind !== "employee") throw new HttpError(409, "劳动合同只能签给劳动员工");
  return c.json(await createContract(ctx, { personId: body.personId, silentConfirmAgreed: false }), 201);
});

app.post("/api/service-contracts", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ personId: string; silentConfirmAgreed?: boolean; silentConfirmDays?: number | null }>(c);
  const person = await mustUser(ctx, body.personId);
  if (person.kind !== "collaborator") throw new HttpError(409, "项目服务协议只能签给项目合作方");
  return c.json(await createContract(ctx, body), 201);
});

app.get("/api/labor-contracts", async (c) => c.json(await listContracts((await ctxOf(c)).ctx, "employee")));
app.get("/api/service-contracts", async (c) => c.json(await listContracts((await ctxOf(c)).ctx, "collaborator")));

app.get("/api/mock/esign/:ref", async (c) => c.json(await mockEsignPreview((await ctxOf(c)).ctx, c.req.param("ref"))));
app.post("/api/mock/esign/:ref/complete", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ silentAcknowledged?: boolean }>(c);
  return c.json(await completeMockSign(ctx, c.req.param("ref"), Boolean(body.silentAcknowledged)));
});

app.post("/api/webhooks/esign", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ providerContractId: string }>(c);
  return c.json(await applyEsignWebhook(ctx, body.providerContractId, c.req.header("x-esign-secret") ?? null));
});

app.post("/api/contracts/:id/terminate", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ reason: string; settlement: "settled" | "pending_settlement" }>(c);
  await terminateContract(ctx, { contractId: c.req.param("id"), reason: body.reason, settlement: body.settlement });
  return c.json({ ok: true });
});

app.get("/api/contracts/:id/file", async (c) => {
  const { ctx } = await ctxOf(c);
  const contract = await one<{ file_id: string | null; person_id: string; title: string }>(ctx.db, "select file_id, person_id, title from contracts where id = ?", c.req.param("id"));
  if (!contract?.file_id) throw new HttpError(404, "签署文件尚未回传");
  if (!(await canReadFile(ctx, contract.file_id))) throw new HttpError(403, "不能下载这份文件");
  const stored = await readFile(ctx, contract.file_id);
  if (!stored) throw new HttpError(404, "文件不在存储中");
  return new Response(bodyBuffer(stored.bytes), {
    headers: { "content-type": stored.meta.contentType, "content-disposition": contentDisposition(stored.meta.filename) },
  });
});

app.post("/api/employee-tasks", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ personId: string; title: string; whatToDo: string; whatToDeliver: string; howPaid: string; whenSettles: string; amountCents: number }>(c);
  const person = await mustUser(ctx, body.personId);
  if (person.kind !== "employee") throw new HttpError(409, "工作任务只能布置给劳动员工");
  return c.json(await createTask(ctx, body), 201);
});

app.post("/api/collaborator-tasks", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ personId: string; title: string; whatToDo: string; whatToDeliver: string; howPaid: string; whenSettles: string; amountCents: number }>(c);
  const person = await mustUser(ctx, body.personId);
  if (person.kind !== "collaborator") throw new HttpError(409, "项目任务单只能发给项目合作方");
  return c.json(await createTask(ctx, body), 201);
});

app.get("/api/tasks/:id", async (c) => c.json(await taskDetail((await ctxOf(c)).ctx, c.req.param("id"))));

app.post("/api/tasks/:id/deliverables", async (c) => {
  const { ctx } = await ctxOf(c);
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) throw new HttpError(400, "请上传附件");
  const note = typeof form.note === "string" ? form.note : "";
  return c.json(await submitDeliverable(ctx, c.req.param("id"), note, await uploadFromFile(file)), 201);
});

app.post("/api/tasks/:id/acceptance", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ decision: "accepted" | "rejected"; reason: string }>(c);
  await decideAcceptance(ctx, c.req.param("id"), body.decision, body.reason);
  return c.json({ ok: true });
});

app.post("/api/wage-slips", async (c) => {
  const { ctx } = await ctxOf(c);
  const form = await c.req.parseBody();
  const taskId = String(form.taskId ?? "");
  await kindTask(c, taskId, "employee");
  const file = form.file;
  if (!(file instanceof File)) throw new HttpError(400, "请上传附件");
  return c.json(await createStatement(ctx, {
    taskId,
    amountCents: Number(form.amountCents),
    periodLabel: String(form.periodLabel ?? ""),
    note: String(form.note ?? ""),
    file: await uploadFromFile(file),
  }), 201);
});

app.post("/api/service-fees", async (c) => {
  const { ctx } = await ctxOf(c);
  const form = await c.req.parseBody();
  const taskId = String(form.taskId ?? "");
  await kindTask(c, taskId, "collaborator");
  const file = form.file;
  if (!(file instanceof File)) throw new HttpError(400, "请上传附件");
  return c.json(await createStatement(ctx, {
    taskId,
    amountCents: Number(form.amountCents),
    periodLabel: String(form.periodLabel ?? ""),
    note: String(form.note ?? ""),
    file: await uploadFromFile(file),
  }), 201);
});

app.get("/api/wage-slips", async (c) => c.json(await listMoney((await ctxOf(c)).ctx, "employee", "statements")));
app.get("/api/service-fees", async (c) => c.json(await listMoney((await ctxOf(c)).ctx, "collaborator", "statements")));
app.get("/api/wage-payments", async (c) => c.json(await listMoney((await ctxOf(c)).ctx, "employee", "payments")));
app.get("/api/service-payments", async (c) => c.json(await listMoney((await ctxOf(c)).ctx, "collaborator", "payments")));

app.post("/api/statements/:id/send", async (c) => c.json(await sendStatement((await ctxOf(c)).ctx, c.req.param("id"))));
app.post("/api/statements/:id/void", async (c) => {
  await voidStatement((await ctxOf(c)).ctx, c.req.param("id"));
  return c.json({ ok: true });
});
app.post("/api/statements/:id/confirm", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ receiptText?: string }>(c);
  await confirmStatement(ctx, { statementId: c.req.param("id"), method: "platform_click", receiptText: body.receiptText });
  return c.json({ ok: true });
});
app.post("/api/statements/:id/email-reply", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ receiptText: string }>(c);
  await confirmStatement(ctx, { statementId: c.req.param("id"), method: "email_reply", receiptText: body.receiptText });
  return c.json({ ok: true });
});
app.post("/api/statements/:id/object", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ text: string }>(c);
  await objectStatement(ctx, c.req.param("id"), body.text);
  return c.json({ ok: true });
});

app.get("/api/confirm", async (c) => c.json(await confirmPreview((await ctxOf(c)).ctx, c.req.query("token") ?? "")));
app.post("/api/confirm", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ token: string; action: "confirm" | "object"; text?: string }>(c);
  await confirmByToken(ctx, body.token, body.action, body.text ?? "");
  return c.json({ ok: true });
});

app.post("/api/payments", async (c) => {
  const { ctx } = await ctxOf(c);
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) throw new HttpError(400, "请上传付款凭证");
  return c.json(await createPayment(ctx, {
    statementId: String(form.statementId ?? ""),
    paidOn: String(form.paidOn ?? ""),
    referenceNo: String(form.referenceNo ?? ""),
    file: await uploadFromFile(file),
  }), 201);
});

app.post("/api/payments/:id/decision", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ decision: "approved" | "rejected"; note: string }>(c);
  await decidePayment(ctx, c.req.param("id"), body.decision, body.note ?? "");
  return c.json({ ok: true });
});

app.get("/api/requests", async (c) => c.json(await listRequests((await ctxOf(c)).ctx)));
app.post("/api/requests", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ type: string; content: string }>(c);
  return c.json(await createPrivacyRequest(ctx, body.type, body.content), 201);
});
app.post("/api/requests/:id/handle", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ status: string; resolution: string }>(c);
  await handlePrivacyRequest(ctx, c.req.param("id"), body.status, body.resolution);
  return c.json({ ok: true });
});

app.use("/api/admin/*", async (c, next) => {
  assertAccess(c.env, c.req.header("cf-access-jwt-assertion"));
  await next();
});

app.get("/api/admin/users", async (c) => {
  const { listUsers } = await import("./compliance");
  return c.json(await listUsers((await ctxOf(c)).ctx));
});
app.post("/api/admin/users", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ name: string; email: string; designatedEmail: string; phone: string; password: string; roles: string[] }>(c);
  return c.json(await createOperator(ctx, body), 201);
});
app.post("/api/admin/users/:id/roles", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ roles: string[] }>(c);
  await replaceRoles(ctx, c.req.param("id"), body.roles);
  return c.json({ ok: true });
});
app.get("/api/admin/audit", async (c) => c.json(await listAudit((await ctxOf(c)).ctx, { objectType: c.req.query("objectType"), q: c.req.query("q") })));
app.get("/api/admin/audit.csv", async (c) => {
  const { ctx } = await ctxOf(c);
  const { requireRoles } = await import("./util");
  requireRoles(ctx, ["admin", "auditor"]);
  return new Response(await auditCsv(ctx), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": contentDisposition("审计日志.csv") } });
});
app.get("/api/admin/templates", async (c) => c.json(await listTemplates((await ctxOf(c)).ctx)));
app.post("/api/admin/templates", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ kind: string; title: string; body: string; version: string }>(c);
  return c.json(await saveTemplate(ctx, body), 201);
});
app.post("/api/admin/templates/:id/activate", async (c) => {
  await activateTemplate((await ctxOf(c)).ctx, c.req.param("id"));
  return c.json({ ok: true });
});
app.get("/api/admin/backups", async (c) => c.json(await listBackups((await ctxOf(c)).ctx)));
app.post("/api/admin/backups", async (c) => {
  const { ctx } = await ctxOf(c);
  const body = await bodyOf<{ note?: string }>(c);
  return c.json(await createBackup(ctx, body.note ?? "手动备份"), 201);
});
app.get("/api/admin/outbox", async (c) => c.json(await listOutbox((await ctxOf(c)).ctx)));

app.get("/api/files/:id", async (c) => {
  const { ctx } = await ctxOf(c);
  if (!(await canReadFile(ctx, c.req.param("id")))) throw new HttpError(403, "不能下载这份文件");
  const stored = await readFile(ctx, c.req.param("id"));
  if (!stored) throw new HttpError(404, "文件不存在");
  return new Response(bodyBuffer(stored.bytes), {
    headers: { "content-type": stored.meta.contentType, "content-disposition": contentDisposition(stored.meta.filename) },
  });
});

app.get("/api/evidence/persons/:id", async (c) => {
  const packed = await evidenceZip((await ctxOf(c)).ctx, { personId: c.req.param("id") });
  return new Response(bodyBuffer(packed.bytes), { headers: { "content-type": "application/zip", "content-disposition": contentDisposition(packed.filename) } });
});
app.get("/api/evidence/tasks/:id", async (c) => {
  const packed = await evidenceZip((await ctxOf(c)).ctx, { taskId: c.req.param("id") });
  return new Response(bodyBuffer(packed.bytes), { headers: { "content-type": "application/zip", "content-disposition": contentDisposition(packed.filename) } });
});

app.post("/api/internal/cron", async (c) => {
  if (c.env.ENVIRONMENT === "prod") return c.json({ error: "生产环境由 Cron 触发", code: "ERROR" }, 404);
  return c.json(await runMaintenance(c.env));
});
