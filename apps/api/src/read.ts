import { COPY, type PersonKind } from "../../../packages/domain/src/index.ts";
import { loadActor, mustUser, publicUser } from "./accounts";
import { latestConsent, presentConsent, presentContract, readiness } from "./compliance";
import { ENTERPRISE, TEMPLATES } from "./templates";
import type { ContractRow, Ctx, StatementRow, TaskRow, UserRow } from "./types";
import { HttpError, many, one, requireActor, requireRoles, sha256Text } from "./util";

function isOperator(ctx: Ctx): boolean {
  return ctx.actor?.kind === "operator";
}

async function assertCanReadPerson(ctx: Ctx, person: UserRow) {
  requireActor(ctx);
  if (ctx.actor?.id === person.id) return;
  if (!isOperator(ctx)) throw new HttpError(403, "不能查看他人档案");
}

export async function platformMeta() {
  const privacy = TEMPLATES.find((item) => item.kind === "privacy");
  const platform = TEMPLATES.find((item) => item.kind === "platform");
  return {
    platform: "国协云工",
    origin: "https://guoxie.chang2.ccwu.cc",
    enterprise: {
      name: ENTERPRISE.name,
      creditCode: ENTERPRISE.creditCode,
      address: ENTERPRISE.address,
      legalRep: ENTERPRISE.legalRep,
      hrEmail: ENTERPRISE.hrEmail,
      projectEmail: ENTERPRISE.projectEmail,
      financeEmail: ENTERPRISE.financeEmail,
      privacyEmail: ENTERPRISE.privacyEmail,
      complaintPhone: ENTERPRISE.complaintPhone,
    },
    consentVersion: "PIPL-2026-10-15",
    consentText: privacy?.body ?? "",
    platformText: platform?.body ?? "",
    providers: { identity: "mock-identity", esign: "mock-esign", email: "mock-email" },
    labels: COPY,
  };
}

export async function listPeople(ctx: Ctx, kind: PersonKind) {
  requireRoles(ctx, ["admin", "issuer", "acceptor", "payment_maker", "payment_checker", "auditor", "privacy_officer"]);
  const users = await many<UserRow>(ctx.db, "select * from users where kind = ? order by created_at", kind);
  const rows = [];
  for (const user of users) {
    const ready = await readiness(ctx, user);
    rows.push({ ...publicUser(user, []), ready: ready.ready, blockers: ready.blockers, contractStatus: ready.contract?.status ?? null });
  }
  return rows;
}

async function taskBundle(ctx: Ctx, task: TaskRow) {
  const issuer = await mustUser(ctx, task.issuer_id);
  const deliverables = await many<{
    id: string;
    version: number;
    note: string;
    file_id: string;
    submitted_at: string;
    sha256: string;
    filename: string;
  }>(
    ctx.db,
    `select d.id, d.version, d.note, d.file_id, d.submitted_at, f.sha256, f.filename
     from deliverables d join files f on f.id = d.file_id
     where d.task_id = ? order by d.version`,
    task.id,
  );
  const acceptances = await many<{
    id: string;
    version: number;
    decision: string;
    reason: string | null;
    reviewer_id: string;
    reviewed_at: string;
    reviewer_name: string;
  }>(
    ctx.db,
    `select a.id, a.version, a.decision, a.reason, a.reviewer_id, a.reviewed_at, u.name as reviewer_name
     from acceptances a join users u on u.id = a.reviewer_id
     where a.task_id = ? order by a.version`,
    task.id,
  );
  const statements = await many<StatementRow>(ctx.db, "select * from statements where task_id = ? order by version", task.id);
  const statementViews = [];
  for (const statement of statements) {
    const file = await one<{ sha256: string; filename: string }>(ctx.db, "select sha256, filename from files where id = ?", statement.file_id);
    const confirmation = await one<Record<string, unknown>>(
      ctx.db,
      "select * from email_confirmations where statement_id = ? order by sent_at desc limit 1",
      statement.id,
    );
    const payment = await one<Record<string, unknown>>(
      ctx.db,
      `select p.*, m.name as maker_name, c.name as checker_name, f.sha256 as voucher_sha256
       from payments p
       join users m on m.id = p.maker_id
       left join users c on c.id = p.checker_id
       left join files f on f.id = p.voucher_file_id
       where p.statement_id = ? order by p.maker_at desc limit 1`,
      statement.id,
    );
    statementViews.push({
      id: statement.id,
      version: statement.version,
      statementKind: statement.statement_kind,
      amountCents: statement.amount_cents,
      periodLabel: statement.period_label,
      note: statement.note,
      status: statement.status,
      fileId: statement.file_id,
      sha256: file?.sha256 ?? null,
      filename: file?.filename ?? null,
      createdAt: statement.created_at,
      confirmation: confirmation
        ? {
            id: confirmation.id,
            status: confirmation.status,
            sentAt: confirmation.sent_at,
            messageId: confirmation.message_id,
            attachmentSha256: confirmation.attachment_sha256,
            confirmMethod: confirmation.confirm_method,
            confirmedAt: confirmation.confirmed_at,
            receiptText: confirmation.receipt_text,
            silenceAllowed: confirmation.silence_allowed === 1,
            silenceDeadlineAt: confirmation.silence_deadline_at,
            objectionText: confirmation.objection_text,
            recipientEmail: confirmation.recipient_email,
          }
        : null,
      payment: payment
        ? {
            id: payment.id,
            amountCents: payment.amount_cents,
            paidOn: payment.paid_on,
            referenceNo: payment.reference_no,
            status: payment.status,
            makerId: payment.maker_id,
            makerName: payment.maker_name,
            checkerId: payment.checker_id,
            checkerName: payment.checker_name,
            settlementFlag: payment.settlement_flag,
            voucherFileId: payment.voucher_file_id,
            voucherSha256: payment.voucher_sha256,
            checkerNote: payment.checker_note,
          }
        : null,
    });
  }
  return {
    id: task.id,
    title: task.title,
    whatToDo: task.what_to_do,
    whatToDeliver: task.what_to_deliver,
    howPaid: task.how_paid,
    whenSettles: task.when_settles,
    amountCents: task.amount_cents,
    status: task.status,
    issuerId: task.issuer_id,
    issuerName: issuer.name,
    acceptanceDueDays: task.acceptance_due_days,
    createdAt: task.created_at,
    deliverables: deliverables.map((item) => ({
      id: item.id,
      version: item.version,
      note: item.note,
      fileId: item.file_id,
      sha256: item.sha256,
      filename: item.filename,
      submittedAt: item.submitted_at,
    })),
    acceptances: acceptances.map((item) => ({
      id: item.id,
      version: item.version,
      decision: item.decision,
      reason: item.reason,
      reviewerId: item.reviewer_id,
      reviewerName: item.reviewer_name,
      reviewedAt: item.reviewed_at,
    })),
    statements: statementViews,
  };
}

export async function dossier(ctx: Ctx, kind: PersonKind, personId: string) {
  const person = await mustUser(ctx, personId);
  if (person.kind !== kind) {
    throw new HttpError(404, kind === "employee" ? "这不是劳动员工档案" : "这不是项目合作方档案");
  }
  await assertCanReadPerson(ctx, person);
  const actor = await loadActor(ctx, person);
  const ready = await readiness(ctx, person);
  const contracts = await many<ContractRow>(
    ctx.db,
    "select * from contracts where person_id = ? and person_kind = ? order by created_at",
    person.id,
    kind,
  );
  const tasks = await many<TaskRow>(ctx.db, "select * from tasks where person_id = ? and person_kind = ? order by created_at", person.id, kind);
  const taskViews = [];
  for (const task of tasks) taskViews.push(await taskBundle(ctx, task));
  const identity = await one<{ provider: string; method: string; status: string; provider_ref: string; verified_at: string | null }>(
    ctx.db,
    "select provider, method, status, provider_ref, verified_at from identity_verifications where user_id = ? order by created_at desc limit 1",
    person.id,
  );
  return {
    person: publicUser(person, actor.roles),
    labels: COPY[kind],
    readiness: {
      consent: ready.consent,
      identity: ready.identity,
      signed: ready.signed,
      active: ready.active,
      ready: ready.ready,
      blockers: ready.blockers,
    },
    consent: presentConsent(ready.consentRow),
    identity: identity
      ? {
          provider: identity.provider,
          method: identity.method,
          status: identity.status,
          providerRef: identity.provider_ref,
          verifiedAt: identity.verified_at,
        }
      : null,
    contracts: await Promise.all(contracts.map((contract) => presentContract(ctx, contract))),
    tasks: taskViews,
  };
}

export async function taskDetail(ctx: Ctx, taskId: string) {
  const task = await one<TaskRow>(ctx.db, "select * from tasks where id = ?", taskId);
  if (!task) throw new HttpError(404, "没有这项任务");
  const person = await mustUser(ctx, task.person_id);
  await assertCanReadPerson(ctx, person);
  return { ...(await taskBundle(ctx, task)), personKind: task.person_kind, personId: task.person_id, personName: person.name, labels: COPY[task.person_kind] };
}

export async function listContracts(ctx: Ctx, kind: PersonKind) {
  requireActor(ctx);
  const contractKind = kind === "employee" ? "labor" : "service";
  if (isOperator(ctx)) {
    const rows = await many<ContractRow>(ctx.db, "select * from contracts where contract_kind = ? order by created_at desc", contractKind);
    return Promise.all(rows.map((row) => presentContract(ctx, row)));
  }
  if (ctx.actor?.kind !== kind) throw new HttpError(403, "不能查看另一类人员的合同");
  const rows = await many<ContractRow>(ctx.db, "select * from contracts where person_id = ? and contract_kind = ?", ctx.actor.id, contractKind);
  return Promise.all(rows.map((row) => presentContract(ctx, row)));
}

export async function listMoney(ctx: Ctx, kind: PersonKind, table: "statements" | "payments") {
  requireActor(ctx);
  const personFilter = isOperator(ctx) ? "" : "and person_id = ?";
  const params: unknown[] = [kind];
  if (!isOperator(ctx)) {
    if (ctx.actor?.kind !== kind) throw new HttpError(403, "不能查看另一类人员的记录");
    params.push(ctx.actor.id);
  }
  if (table === "statements") {
    const rows = await many<StatementRow>(
      ctx.db,
      `select * from statements where person_kind = ? ${personFilter} order by created_at desc`,
      ...params,
    );
    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      personId: row.person_id,
      version: row.version,
      amountCents: row.amount_cents,
      periodLabel: row.period_label,
      status: row.status,
      statementKind: row.statement_kind,
      createdAt: row.created_at,
      labels: COPY[kind],
    }));
  }
  const rows = await many<Record<string, unknown>>(
    ctx.db,
    `select p.*, u.name as person_name from payments p join users u on u.id = p.person_id
     where p.person_kind = ? ${personFilter.replace("person_id", "p.person_id")} order by p.maker_at desc`,
    ...params,
  );
  return rows.map((row) => ({
    id: row.id,
    statementId: row.statement_id,
    personId: row.person_id,
    personName: row.person_name,
    amountCents: row.amount_cents,
    paidOn: row.paid_on,
    referenceNo: row.reference_no,
    status: row.status,
    makerId: row.maker_id,
    checkerId: row.checker_id,
    settlementFlag: row.settlement_flag,
    labels: COPY[kind],
  }));
}

export async function listAudit(ctx: Ctx, filters: { objectType?: string; q?: string }) {
  requireRoles(ctx, ["admin", "auditor"]);
  const clauses = ["1 = 1"];
  const params: unknown[] = [];
  if (filters.objectType) {
    clauses.push("object_type = ?");
    params.push(filters.objectType);
  }
  if (filters.q) {
    clauses.push("(action like ? or object_id like ? or actor_name like ?)");
    const like = `%${filters.q}%`;
    params.push(like, like, like);
  }
  return many(
    ctx.db,
    `select id, actor_id, actor_name, action, object_type, object_id, before_json, after_json, ip, created_at
     from audit_logs where ${clauses.join(" and ")} order by created_at desc limit 300`,
    ...params,
  );
}

export async function auditCsv(ctx: Ctx) {
  const rows = await many<Record<string, unknown>>(
    ctx.db,
    "select actor_name, action, object_type, object_id, ip, created_at from audit_logs order by created_at",
  );
  const { csvCell } = await import("./util");
  const header = ["时间", "操作人", "动作", "对象类型", "对象", "IP"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([row.created_at, row.actor_name, row.action, row.object_type, row.object_id, row.ip].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
}

export async function listTemplates(ctx: Ctx) {
  requireRoles(ctx, ["admin", "auditor"]);
  return many(ctx.db, "select id, kind, version, title, body, active, created_at from contract_templates order by created_at");
}

export async function saveTemplate(ctx: Ctx, input: { kind: string; title: string; body: string; version: string }) {
  requireRoles(ctx, ["admin"]);
  if (!["labor", "service", "privacy", "platform"].includes(input.kind)) throw new HttpError(400, "模板类型不正确");
  if (input.title.trim().length < 2 || input.body.trim().length < 10) throw new HttpError(400, "请填写模板标题和正文");
  const { id, run } = await import("./util");
  const { audit } = await import("./audit");
  const templateId = id();
  await run(
    ctx.db,
    `insert into contract_templates (id, kind, version, title, body, active, created_at) values (?, ?, ?, ?, ?, 0, ?)`,
    templateId,
    input.kind,
    input.version.trim() || "V0.2",
    input.title.trim(),
    input.body.trim(),
    ctx.now(),
  );
  await audit(ctx, { action: "template.create", objectType: "contract_template", objectId: templateId, after: { kind: input.kind } });
  return { id: templateId };
}

export async function activateTemplate(ctx: Ctx, templateId: string) {
  requireRoles(ctx, ["admin"]);
  const { run, one: oneRow } = await import("./util");
  const template = await oneRow<{ id: string; kind: string }>(ctx.db, "select id, kind from contract_templates where id = ?", templateId);
  if (!template) throw new HttpError(404, "没有这份模板");
  await run(ctx.db, "update contract_templates set active = 0 where kind = ?", template.kind);
  await run(ctx.db, "update contract_templates set active = 1 where id = ?", templateId);
  const { audit } = await import("./audit");
  await audit(ctx, { action: "template.activate", objectType: "contract_template", objectId: templateId, after: { kind: template.kind } });
}

export async function listBackups(ctx: Ctx) {
  requireRoles(ctx, ["admin", "auditor"]);
  return many(ctx.db, "select id, sha256, size, created_at, created_by, note from backups order by created_at desc");
}

export async function listOutbox(ctx: Ctx) {
  requireRoles(ctx, ["admin", "payment_maker", "auditor"]);
  return many(
    ctx.db,
    `select id, statement_id, to_email, subject, body, message_id, attachment_sha256, status, sent_at, provider
     from email_messages order by sent_at desc limit 200`,
  );
}

export async function listRequests(ctx: Ctx) {
  requireActor(ctx);
  const operator = isOperator(ctx) && ctx.actor?.roles.some((role) => role === "admin" || role === "privacy_officer");
  if (operator) {
    return many(
      ctx.db,
      `select r.*, u.name as user_name, u.kind as user_kind from requests r join users u on u.id = r.user_id order by r.created_at desc`,
    );
  }
  return many(ctx.db, "select * from requests where user_id = ? order by created_at desc", ctx.actor?.id);
}

export async function confirmPreview(ctx: Ctx, token: string) {
  const tokenHash = await sha256Text(token);
  const confirmation = await one<Record<string, unknown>>(ctx.db, "select * from email_confirmations where token_hash = ?", tokenHash);
  if (!confirmation) throw new HttpError(404, "确认链接无效或已失效");
  const statement = await one<StatementRow>(ctx.db, "select * from statements where id = ?", confirmation.statement_id);
  if (!statement) throw new HttpError(404, "核算单不存在");
  const person = await mustUser(ctx, statement.person_id);
  return {
    labels: COPY[statement.person_kind],
    personName: person.name,
    version: statement.version,
    amountCents: statement.amount_cents,
    periodLabel: statement.period_label,
    status: statement.status,
    sha256: confirmation.attachment_sha256,
    silenceAllowed: confirmation.silence_allowed === 1,
    silenceDeadlineAt: confirmation.silence_deadline_at,
    confirmMethod: confirmation.confirm_method,
    confirmedAt: confirmation.confirmed_at,
    receiptText: confirmation.receipt_text,
    objectionText: confirmation.objection_text,
  };
}

export async function mockEsignPreview(ctx: Ctx, providerContractId: string) {
  const actor = requireActor(ctx);
  const contract = await one<ContractRow>(ctx.db, "select * from contracts where provider_contract_id = ?", providerContractId);
  if (!contract) throw new HttpError(404, "签署链接无效");
  if (contract.person_id !== actor.id && !isOperator(ctx)) throw new HttpError(403, "不能查看这份签署");
  return presentContract(ctx, contract);
}

export async function canReadFile(ctx: Ctx, fileId: string): Promise<boolean> {
  requireActor(ctx);
  if (isOperator(ctx)) return true;
  const owned = await one(
    ctx.db,
    `select id from files where id = ? and uploaded_by = ?
     union select file_id from contracts where file_id = ? and person_id = ?
     union select d.file_id from deliverables d join tasks t on t.id = d.task_id where d.file_id = ? and t.person_id = ?
     union select file_id from statements where file_id = ? and person_id = ?
     union select voucher_file_id from payments where voucher_file_id = ? and person_id = ?`,
    fileId,
    ctx.actor?.id,
    fileId,
    ctx.actor?.id,
    fileId,
    ctx.actor?.id,
    fileId,
    ctx.actor?.id,
    fileId,
    ctx.actor?.id,
  );
  return Boolean(owned);
}
