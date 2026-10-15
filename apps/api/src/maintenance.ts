import { zipSync, strToU8 } from "fflate";
import { audit } from "./audit";
import { readFile } from "./files";
import { markSilentConfirmation } from "./fulfillment";
import { getEmailProvider } from "./providers";
import type { Ctx, Env } from "./types";
import { HttpError, addDays, id, many, one, requireActor, requireRoles, run, sha256Hex } from "./util";

export function systemCtx(env: Env, now = () => new Date().toISOString()): Ctx {
  return { db: env.DB, bucket: env.FILES, env, actor: null, ip: null, ua: "cron", now };
}

const BACKUP_TABLES = [
  "enterprise",
  "users",
  "user_roles",
  "consents",
  "identity_verifications",
  "contract_templates",
  "contracts",
  "tasks",
  "deliverables",
  "acceptances",
  "statements",
  "email_messages",
  "email_confirmations",
  "payments",
  "requests",
  "files",
  "audit_logs",
  "backups",
];

function redact(table: string, row: Record<string, unknown>) {
  const copy = { ...row };
  if (table === "users") {
    copy.password_hash = "[redacted]";
    copy.id_number_hash = "[redacted]";
  }
  if (table === "sessions" || table === "email_confirmations") copy.token_hash = "[redacted]";
  return copy;
}

export async function createBackup(ctx: Ctx, note: string) {
  requireActor(ctx);
  if (ctx.actor && ctx.actor.kind === "operator") requireRoles(ctx, ["admin"]);
  const dump: Record<string, unknown[]> = {};
  for (const table of BACKUP_TABLES) {
    const rows = await many<Record<string, unknown>>(ctx.db, `select * from ${table}`);
    dump[table] = rows.map((row) => redact(table, row));
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ createdAt: ctx.now(), tables: dump }));
  const sha256 = await sha256Hex(bytes);
  const backupId = id();
  const key = `backups/${backupId}.json`;
  await ctx.bucket.put(key, bytes, { httpMetadata: { contentType: "application/json" } });
  await run(
    ctx.db,
    "insert into backups (id, r2_key, sha256, size, created_at, created_by, note) values (?, ?, ?, ?, ?, ?, ?)",
    backupId,
    key,
    sha256,
    bytes.byteLength,
    ctx.now(),
    ctx.actor?.id ?? null,
    note,
  );
  await audit(ctx, { action: "backup.create", objectType: "backup", objectId: backupId, after: { sha256, note }, actorName: ctx.actor ? undefined : "系统定时任务" });
  return { id: backupId, sha256, size: bytes.byteLength };
}

export async function runMaintenance(env: Env): Promise<{ silenced: number; reminded: number; backedUp: boolean }> {
  const ctx = systemCtx(env);
  const now = ctx.now();
  const due = await many<{ id: string }>(
    ctx.db,
    `select ec.id from email_confirmations ec
     join statements s on s.id = ec.statement_id
     where ec.status = 'sent' and ec.silence_allowed = 1 and s.person_kind = 'collaborator'
       and ec.silence_deadline_at is not null and ec.silence_deadline_at <= ?`,
    now,
  );
  let silenced = 0;
  for (const row of due) {
    if (await markSilentConfirmation(ctx, row.id)) silenced += 1;
  }
  const remindBefore = addDays(now, -1);
  const pending = await many<{ id: string; statement_id: string; recipient_email: string }>(
    ctx.db,
    "select id, statement_id, recipient_email from email_confirmations where status = 'sent' and reminder_sent_at is null and sent_at <= ?",
    remindBefore,
  );
  const email = getEmailProvider();
  for (const row of pending) {
    const sent = await email.send({
      to: row.recipient_email,
      subject: "提醒：核算单仍待确认",
      body: "你有一张核算单尚未确认。未事先约定的，逾期不视为确认。劳动工资核算单不适用沉默确认。",
      attachmentSha256: null,
    });
    await run(
      ctx.db,
      `insert into email_messages (id, statement_id, to_email, subject, body, message_id, status, sent_at, provider)
       values (?, ?, ?, ?, ?, ?, 'sent', ?, ?)`,
      id(),
      row.statement_id,
      row.recipient_email,
      "提醒：核算单仍待确认",
      "系统提醒",
      sent.providerMessageId,
      now,
      email.name,
    );
    await run(ctx.db, "update email_confirmations set reminder_sent_at = ? where id = ?", now, row.id);
  }
  await createBackup({ ...ctx, actor: { id: "system", name: "系统定时任务", kind: "operator", email: "", roles: ["admin"], status: "active" } }, "定时备份");
  return { silenced, reminded: pending.length, backedUp: true };
}

async function filesForPerson(ctx: Ctx, personId: string) {
  return many<{ id: string }>(
    ctx.db,
    `select file_id as id from contracts where person_id = ? and file_id is not null
     union select d.file_id from deliverables d join tasks t on t.id = d.task_id where t.person_id = ?
     union select file_id from statements where person_id = ?
     union select voucher_file_id from payments where person_id = ? and voucher_file_id is not null`,
    personId,
    personId,
    personId,
    personId,
  );
}

export async function evidenceZip(ctx: Ctx, target: { personId?: string; taskId?: string }) {
  requireActor(ctx);
  let personId = target.personId ?? "";
  let taskId = target.taskId ?? "";
  if (taskId) {
    const task = await one<{ person_id: string; person_kind: string }>(ctx.db, "select person_id, person_kind from tasks where id = ?", taskId);
    if (!task) throw new HttpError(404, "没有这项任务");
    personId = task.person_id;
  }
  const person = await one<{ id: string; kind: string; name: string }>(ctx.db, "select id, kind, name from users where id = ?", personId);
  if (!person || (person.kind !== "employee" && person.kind !== "collaborator")) throw new HttpError(404, "没有这份人员档案");
  const operator = ctx.actor?.kind === "operator" && ctx.actor.roles.some((role) => role === "admin" || role === "auditor");
  if (ctx.actor?.id !== person.id && !operator) throw new HttpError(403, "不能导出这份证据包");

  const whereTask = taskId ? "and id = ?" : "";
  const taskParams = taskId ? [personId, taskId] : [personId];
  const records = {
    person: await one(ctx.db, "select id, kind, name, email, designated_email, status, identity_status, id_number_masked, settlement_flag, created_at, disabled_at from users where id = ?", personId),
    consents: await many(ctx.db, "select * from consents where user_id = ?", personId),
    identity: await many(ctx.db, "select id, provider, provider_ref, method, status, created_at, verified_at from identity_verifications where user_id = ?", personId),
    contracts: await many(ctx.db, "select * from contracts where person_id = ?", personId),
    tasks: await many(ctx.db, `select * from tasks where person_id = ? ${whereTask}`, ...taskParams),
    deliverables: await many(
      ctx.db,
      `select d.* from deliverables d join tasks t on t.id = d.task_id where t.person_id = ? ${taskId ? "and t.id = ?" : ""}`,
      ...taskParams,
    ),
    acceptances: await many(
      ctx.db,
      `select a.* from acceptances a join tasks t on t.id = a.task_id where t.person_id = ? ${taskId ? "and t.id = ?" : ""}`,
      ...taskParams,
    ),
    statements: await many(
      ctx.db,
      `select * from statements where person_id = ? ${taskId ? "and task_id = ?" : ""}`,
      ...taskParams,
    ),
    emails: await many(
      ctx.db,
      `select e.* from email_messages e join statements s on s.id = e.statement_id where s.person_id = ? ${taskId ? "and s.task_id = ?" : ""}`,
      ...taskParams,
    ),
    confirmations: await many(
      ctx.db,
      `select c.id, c.statement_id, c.version, c.recipient_email, c.sent_at, c.message_id, c.attachment_sha256, c.confirm_method, c.confirmed_at, c.receipt_text, c.status, c.silence_allowed, c.silence_deadline_at, c.objection_text
       from email_confirmations c join statements s on s.id = c.statement_id where s.person_id = ? ${taskId ? "and s.task_id = ?" : ""}`,
      ...taskParams,
    ),
    payments: await many(ctx.db, `select * from payments where person_id = ? ${taskId ? "and statement_id in (select id from statements where task_id = ?)" : ""}`, ...taskParams),
    audit: await many(ctx.db, "select * from audit_logs where object_id = ? or object_id in (select id from tasks where person_id = ?) order by created_at", personId, personId),
  };

  const fileIds = taskId
    ? await many<{ id: string }>(
        ctx.db,
        `select file_id as id from contracts where person_id = ? and file_id is not null
         union select d.file_id from deliverables d where d.task_id = ?
         union select file_id from statements where task_id = ?
         union select voucher_file_id from payments where statement_id in (select id from statements where task_id = ?) and voucher_file_id is not null`,
        personId,
        taskId,
        taskId,
        taskId,
      )
    : await filesForPerson(ctx, personId);

  const zipFiles: Record<string, Uint8Array> = {};
  const manifestFiles: Array<{ id: string; filename: string; sha256: string; size: number }> = [];
  for (const file of fileIds) {
    if (!file.id) continue;
    const stored = await readFile(ctx, file.id);
    if (!stored) continue;
    const actual = await sha256Hex(stored.bytes);
    manifestFiles.push({ id: stored.meta.id, filename: stored.meta.filename, sha256: stored.meta.sha256, size: stored.bytes.byteLength });
    if (actual !== stored.meta.sha256) {
      throw new HttpError(500, `附件哈希不一致：${stored.meta.filename}`);
    }
    zipFiles[`files/${stored.meta.sha256.slice(0, 8)}-${stored.meta.filename}`] = stored.bytes;
  }
  const manifest = {
    exportedAt: ctx.now(),
    personId,
    taskId: taskId || null,
    personKind: person.kind,
    files: manifestFiles,
    note: "证据包由国协云工导出。审计日志只追加。金额单位为分。电子签、实名和邮件在本期为模拟服务商。",
  };
  zipFiles["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  zipFiles["records.json"] = strToU8(JSON.stringify(records, null, 2));
  zipFiles["README.txt"] = strToU8("国协云工证据包。records.json 为业务记录，files 目录为附件，manifest.json 含 SHA-256。");
  const zipped = zipSync(zipFiles, { level: 6 });
  await audit(ctx, { action: "evidence.export", objectType: taskId ? "task" : "user", objectId: taskId || personId });
  const filename = taskId ? `evidence-task-${taskId.slice(0, 8)}.zip` : `evidence-person-${personId.slice(0, 8)}.zip`;
  return { bytes: zipped, filename };
}
