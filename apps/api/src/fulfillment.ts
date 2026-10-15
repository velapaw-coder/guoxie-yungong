import { COPY } from "../../../packages/domain/src/index.ts";
import { mustUser } from "./accounts";
import { audit } from "./audit";
import { consentReady, latestConsent } from "./compliance";
import { putFile } from "./files";
import { getEmailProvider } from "./providers";
import type { ContractRow, Ctx, StatementRow, TaskRow, Upload } from "./types";
import { HttpError, addDays, assertCents, assertText, id, one, randomToken, requireActor, requireRoles, run, sha256Text } from "./util";

async function mustTask(ctx: Ctx, taskId: string): Promise<TaskRow> {
  const task = await one<TaskRow>(ctx.db, "select * from tasks where id = ?", taskId);
  if (!task) throw new HttpError(404, "没有这项任务");
  return task;
}

async function mustStatement(ctx: Ctx, statementId: string): Promise<StatementRow> {
  const statement = await one<StatementRow>(ctx.db, "select * from statements where id = ?", statementId);
  if (!statement) throw new HttpError(404, "没有这张核算单");
  return statement;
}

export async function createTask(ctx: Ctx, input: {
  personId: string;
  title: string;
  whatToDo: string;
  whatToDeliver: string;
  howPaid: string;
  whenSettles: string;
  amountCents: number;
}) {
  const actor = requireRoles(ctx, ["issuer"]);
  const person = await mustUser(ctx, input.personId);
  if (person.kind !== "employee" && person.kind !== "collaborator") {
    throw new HttpError(409, "只能向劳动员工或项目合作方发单");
  }
  const labels = COPY[person.kind];
  if (person.status !== "active") throw new HttpError(409, "账号已停用");
  if (person.identity_status !== "verified") throw new HttpError(409, `未完成实名认证，不能发布${labels.task}`);
  const consent = await latestConsent(ctx, person.id);
  if (!consentReady(ctx, consent)) throw new HttpError(409, `未完成本版个人信息单独同意，不能发布${labels.task}`);
  const contract = await one<ContractRow>(
    ctx.db,
    "select * from contracts where person_id = ? and person_kind = ? and status = 'signed' order by signed_at desc limit 1",
    person.id,
    person.kind,
  );
  if (!contract) {
    throw new HttpError(409, person.kind === "employee" ? "劳动合同尚未签署，不能布置工作任务" : "项目服务协议尚未签署，不能发布任务单");
  }
  if (contract.contract_kind === "labor" && person.kind !== "employee") {
    throw new HttpError(409, "劳动合同不能用于项目合作方");
  }
  if (contract.contract_kind === "service" && person.kind !== "collaborator") {
    throw new HttpError(409, "服务协议不能用于劳动员工");
  }
  const title = assertText(input.title, "标题");
  const whatToDo = assertText(input.whatToDo, "做什么");
  const whatToDeliver = assertText(input.whatToDeliver, "交付什么");
  const howPaid = assertText(input.howPaid, "怎么算钱");
  const whenSettles = assertText(input.whenSettles, "何时结");
  const amountCents = assertCents(input.amountCents);
  if (person.kind === "employee" && /服务费|项目合作/.test(howPaid)) {
    throw new HttpError(409, "劳动员工的报酬依据不能写成服务费");
  }
  if (person.kind === "collaborator" && /工资|社保|考勤|坐班/.test(`${howPaid}${whatToDo}`)) {
    throw new HttpError(409, "项目任务单不能约定工资、社保、考勤或坐班");
  }
  const taskId = id();
  await run(
    ctx.db,
    `insert into tasks
      (id, person_id, person_kind, contract_id, issuer_id, title, what_to_do, what_to_deliver, how_paid, when_settles, amount_cents, acceptance_due_days, status, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, 'open', ?)`,
    taskId,
    person.id,
    person.kind,
    contract.id,
    actor.id,
    title,
    whatToDo,
    whatToDeliver,
    howPaid,
    whenSettles,
    amountCents,
    ctx.now(),
  );
  await audit(ctx, {
    action: "task.create",
    objectType: "task",
    objectId: taskId,
    after: { personKind: person.kind, title, amountCents },
  });
  return { id: taskId };
}

export async function submitDeliverable(ctx: Ctx, taskId: string, note: string, file: Upload) {
  const actor = requireActor(ctx);
  const task = await mustTask(ctx, taskId);
  if (actor.id !== task.person_id || actor.kind !== task.person_kind) {
    throw new HttpError(403, task.person_kind === "employee" ? "只有这位劳动员工本人可以提交工作成果" : "只有这位项目合作方本人可以提交交付物");
  }
  if (task.status === "accepted" || task.status === "closed") throw new HttpError(409, "这项任务已经验收或关闭");
  const latest = await one<{ version: number; id: string }>(
    ctx.db,
    "select id, version from deliverables where task_id = ? order by version desc limit 1",
    taskId,
  );
  if (latest) {
    const acceptance = await one<{ decision: string }>(
      ctx.db,
      "select decision from acceptances where deliverable_id = ?",
      latest.id,
    );
    if (!acceptance) throw new HttpError(409, "上一版还在等待验收");
    if (acceptance.decision === "accepted") throw new HttpError(409, "已经验收通过");
  }
  const saved = await putFile(ctx, file, actor.id);
  const version = (latest?.version ?? 0) + 1;
  const deliverableId = id();
  await run(
    ctx.db,
    `insert into deliverables (id, task_id, version, note, file_id, submitted_by, submitted_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
    deliverableId,
    taskId,
    version,
    assertText(note, "说明"),
    saved.id,
    actor.id,
    ctx.now(),
  );
  await run(ctx.db, "update tasks set status = 'delivered' where id = ?", taskId);
  await audit(ctx, {
    action: "deliverable.submit",
    objectType: "deliverable",
    objectId: deliverableId,
    after: { taskId, version, sha256: saved.sha256, personKind: task.person_kind },
  });
  return { id: deliverableId, version, sha256: saved.sha256 };
}

export async function decideAcceptance(ctx: Ctx, taskId: string, decision: "accepted" | "rejected", reason: string) {
  const actor = requireRoles(ctx, ["acceptor"]);
  const task = await mustTask(ctx, taskId);
  if (decision !== "accepted" && decision !== "rejected") throw new HttpError(400, "请选择通过或驳回");
  const opinion = reason?.trim() ?? "";
  if (opinion.length < 2) throw new HttpError(400, decision === "rejected" ? "驳回必须填写原因" : "请填写验收意见");
  if (actor.id === task.issuer_id) throw new HttpError(409, "发单人与验收人不能是同一人");
  if (actor.id === task.person_id) throw new HttpError(409, "当事人不能验收自己的成果");
  const latest = await one<{ id: string; version: number }>(
    ctx.db,
    "select id, version from deliverables where task_id = ? order by version desc limit 1",
    taskId,
  );
  if (!latest) throw new HttpError(409, "还没有可验收的提交");
  const existing = await one(ctx.db, "select id from acceptances where deliverable_id = ?", latest.id);
  if (existing) throw new HttpError(409, "这一版已经有验收结论");
  const acceptanceId = id();
  await run(
    ctx.db,
    `insert into acceptances (id, task_id, deliverable_id, version, decision, reason, reviewer_id, reviewed_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    acceptanceId,
    taskId,
    latest.id,
    latest.version,
    decision,
    opinion,
    actor.id,
    ctx.now(),
  );
  await run(ctx.db, "update tasks set status = ? where id = ?", decision === "accepted" ? "accepted" : "rejected", taskId);
  await audit(ctx, {
    action: decision === "accepted" ? "acceptance.pass" : "acceptance.reject",
    objectType: "acceptance",
    objectId: acceptanceId,
    after: { taskId, version: latest.version, decision, reason: opinion, personKind: task.person_kind },
  });
}

function statementKindFor(personKind: TaskRow["person_kind"]): "wage_slip" | "service_fee" {
  return personKind === "employee" ? "wage_slip" : "service_fee";
}

export async function createStatement(ctx: Ctx, input: {
  taskId: string;
  amountCents: number;
  periodLabel: string;
  note: string;
  file: Upload;
}) {
  requireRoles(ctx, ["payment_maker"]);
  const task = await mustTask(ctx, input.taskId);
  if (task.status !== "accepted") throw new HttpError(409, "验收通过后才能上传核算单");
  const labels = COPY[task.person_kind];
  const latest = await one<{ status: string; version: number }>(
    ctx.db,
    "select status, version from statements where task_id = ? order by version desc limit 1",
    task.id,
  );
  if (latest && ["draft", "sent", "confirmed"].includes(latest.status)) {
    throw new HttpError(409, `当前${labels.statement}尚未完结，不能另起一版`);
  }
  const saved = await putFile(ctx, input.file, ctx.actor?.id ?? null);
  const statementId = id();
  const version = (latest?.version ?? 0) + 1;
  const amountCents = assertCents(input.amountCents);
  await run(
    ctx.db,
    `insert into statements
      (id, task_id, person_id, person_kind, statement_kind, version, amount_cents, period_label, note, file_id, status, created_by, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    statementId,
    task.id,
    task.person_id,
    task.person_kind,
    statementKindFor(task.person_kind),
    version,
    amountCents,
    assertText(input.periodLabel, "期间"),
    input.note?.trim() ?? "",
    saved.id,
    ctx.actor?.id,
    ctx.now(),
  );
  await audit(ctx, {
    action: "statement.create",
    objectType: "statement",
    objectId: statementId,
    after: { version, amountCents, sha256: saved.sha256, statementKind: statementKindFor(task.person_kind) },
  });
  return { id: statementId, version, sha256: saved.sha256 };
}

export async function sendStatement(ctx: Ctx, statementId: string) {
  requireRoles(ctx, ["payment_maker"]);
  const statement = await mustStatement(ctx, statementId);
  if (statement.status !== "draft") throw new HttpError(409, "只有草稿可以发送");
  const person = await mustUser(ctx, statement.person_id);
  const labels = COPY[statement.person_kind];
  const file = await one<{ sha256: string; filename: string }>(ctx.db, "select sha256, filename from files where id = ?", statement.file_id);
  if (!file) throw new HttpError(500, "核算单附件丢失");
  const contract = await one<ContractRow>(
    ctx.db,
    "select * from contracts where person_id = ? and status = 'signed' order by signed_at desc limit 1",
    person.id,
  );
  const silenceAllowed = statement.person_kind === "collaborator" && contract?.silent_confirm_agreed === 1;
  const silenceDays = silenceAllowed ? contract?.silent_confirm_days ?? null : null;
  const token = randomToken();
  const tokenHash = await sha256Text(token);
  const link = `${ctx.env.WEB_ORIGIN}/confirm/?token=${token}`;
  const subject = `${labels.statement}待确认（第 ${statement.version} 版）`;
  const silenceLine = silenceAllowed
    ? `你已在服务协议中单独同意：${silenceDays} 个自然日内未确认也未提出异议的，视为确认。`
    : labels.silence;
  const body = [
    `${person.name}：`,
    `国协云工集团有限公司向你发送${labels.statement}第 ${statement.version} 版。`,
    `期间：${statement.period_label}`,
    `金额：${(statement.amount_cents / 100).toFixed(2)} 元（平台只展示线下核算结果）`,
    `附件 SHA-256：${file.sha256}`,
    silenceLine,
    `请打开确认页：${link}`,
    "也可以用指定邮箱回复，正文需包含“确认”。微信不是确认渠道。",
  ].join("\n");
  const email = getEmailProvider();
  const sent = await email.send({
    to: person.designated_email,
    subject,
    body,
    attachmentSha256: file.sha256,
  });
  const messageRowId = id();
  await run(
    ctx.db,
    `insert into email_messages
      (id, statement_id, to_email, subject, body, message_id, attachment_file_id, attachment_sha256, status, sent_at, provider)
     values (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`,
    messageRowId,
    statement.id,
    person.designated_email,
    subject,
    body,
    sent.providerMessageId,
    statement.file_id,
    file.sha256,
    ctx.now(),
    email.name,
  );
  const confirmationId = id();
  await run(
    ctx.db,
    `insert into email_confirmations
      (id, statement_id, version, recipient_email, sent_at, message_id, attachment_sha256, status, token_hash, silence_allowed, silence_deadline_at)
     values (?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?)`,
    confirmationId,
    statement.id,
    statement.version,
    person.designated_email,
    ctx.now(),
    sent.providerMessageId,
    file.sha256,
    tokenHash,
    silenceAllowed ? 1 : 0,
    silenceAllowed && silenceDays ? addDays(ctx.now(), silenceDays) : null,
  );
  await run(ctx.db, "update statements set status = 'sent' where id = ?", statement.id);
  await audit(ctx, {
    action: "statement.send",
    objectType: "statement",
    objectId: statement.id,
    after: { messageId: sent.providerMessageId, sha256: file.sha256, silenceAllowed, to: person.designated_email },
  });
  return { messageId: sent.providerMessageId, confirmationId };
}

export async function voidStatement(ctx: Ctx, statementId: string) {
  requireRoles(ctx, ["payment_maker"]);
  const statement = await mustStatement(ctx, statementId);
  if (statement.status !== "draft" && statement.status !== "sent") {
    throw new HttpError(409, "已确认的核算单不能作废");
  }
  await run(ctx.db, "update statements set status = 'void' where id = ?", statementId);
  await run(ctx.db, "update email_confirmations set status = 'void' where statement_id = ? and status = 'sent'", statementId);
  await audit(ctx, {
    action: "statement.void",
    objectType: "statement",
    objectId: statementId,
    before: { status: statement.status },
    after: { status: "void" },
  });
}

async function confirmationFor(ctx: Ctx, statementId: string) {
  return one<{
    id: string;
    status: string;
    attachment_sha256: string;
    silence_allowed: number;
  }>(ctx.db, "select * from email_confirmations where statement_id = ? order by sent_at desc limit 1", statementId);
}

export async function confirmStatement(ctx: Ctx, input: {
  statementId: string;
  method: "platform_click" | "email_reply";
  receiptText?: string;
}) {
  const statement = await mustStatement(ctx, input.statementId);
  const labels = COPY[statement.person_kind];
  if (statement.status !== "sent") throw new HttpError(409, `${labels.statement}不在待确认状态`);
  const confirmation = await confirmationFor(ctx, statement.id);
  if (!confirmation || confirmation.status !== "sent") throw new HttpError(409, "没有待确认的发送回执");
  if (!ctx.actor) throw new HttpError(401, "请先登录");
  let receipt = input.receiptText?.trim() ?? "";
  if (input.method === "platform_click") {
    if (ctx.actor.id !== statement.person_id) throw new HttpError(403, "只能由本人在平台确认");
    receipt = receipt || `本人在平台点击确认这张${labels.statement}。`;
  } else if (input.method === "email_reply") {
    requireRoles(ctx, ["payment_maker"]);
    if (!receipt.includes("确认")) throw new HttpError(400, "邮件回复需包含「确认」字样");
  } else {
    throw new HttpError(403, "沉默确认只能由已约定的期限任务写入");
  }
  await run(
    ctx.db,
    `update email_confirmations
     set status = 'confirmed', confirm_method = ?, confirmed_at = ?, receipt_text = ?, ip = ?, user_agent = ?
     where id = ?`,
    input.method,
    ctx.now(),
    receipt,
    ctx.ip,
    ctx.ua,
    confirmation.id,
  );
  await run(ctx.db, "update statements set status = 'confirmed' where id = ?", statement.id);
  await audit(ctx, {
    action: "statement.confirm",
    objectType: "statement",
    objectId: statement.id,
    after: { method: input.method, sha256: confirmation.attachment_sha256 },
  });
}

export async function confirmByToken(ctx: Ctx, token: string, action: "confirm" | "object", text: string) {
  const tokenHash = await sha256Text(token);
  const confirmation = await one<{ id: string; statement_id: string; status: string; attachment_sha256: string }>(
    ctx.db,
    "select * from email_confirmations where token_hash = ?",
    tokenHash,
  );
  if (!confirmation) throw new HttpError(404, "确认链接无效");
  const statement = await mustStatement(ctx, confirmation.statement_id);
  const labels = COPY[statement.person_kind];
  if (confirmation.status !== "sent" || statement.status !== "sent") {
    throw new HttpError(409, `这张${labels.statement}已经处理过`);
  }
  if (action === "object") {
    if (text.trim().length < 2) throw new HttpError(400, "请写明异议内容");
    await run(
      ctx.db,
      "update email_confirmations set status = 'objected', objection_text = ?, ip = ?, user_agent = ? where id = ?",
      text.trim(),
      ctx.ip,
      ctx.ua,
      confirmation.id,
    );
    await run(ctx.db, "update statements set status = 'objected' where id = ?", statement.id);
    await audit(ctx, {
      action: "statement.object",
      objectType: "statement",
      objectId: statement.id,
      after: { via: "email_link" },
      actorName: "邮箱确认链接",
    });
    return;
  }
  await run(
    ctx.db,
    `update email_confirmations
     set status = 'confirmed', confirm_method = 'platform_click', confirmed_at = ?, receipt_text = ?, ip = ?, user_agent = ?
     where id = ?`,
    ctx.now(),
    text.trim() || `本人通过邮件中的确认链接确认这张${labels.statement}。`,
    ctx.ip,
    ctx.ua,
    confirmation.id,
  );
  await run(ctx.db, "update statements set status = 'confirmed' where id = ?", statement.id);
  await audit(ctx, {
    action: "statement.confirm",
    objectType: "statement",
    objectId: statement.id,
    after: { method: "platform_click", via: "email_link", sha256: confirmation.attachment_sha256 },
    actorName: "邮箱确认链接",
  });
}

export async function objectStatement(ctx: Ctx, statementId: string, text: string) {
  if (!ctx.actor) throw new HttpError(401, "请先登录");
  const statement = await mustStatement(ctx, statementId);
  if (ctx.actor.id !== statement.person_id) throw new HttpError(403, "只能由本人提出异议");
  if (statement.status !== "sent") throw new HttpError(409, "只有待确认的核算单可以提出异议");
  if (text.trim().length < 2) throw new HttpError(400, "请写明异议内容");
  await run(
    ctx.db,
    "update email_confirmations set status = 'objected', objection_text = ?, ip = ?, user_agent = ? where statement_id = ? and status = 'sent'",
    text.trim(),
    ctx.ip,
    ctx.ua,
    statementId,
  );
  await run(ctx.db, "update statements set status = 'objected' where id = ?", statementId);
  await audit(ctx, { action: "statement.object", objectType: "statement", objectId: statementId, after: { text: text.trim() } });
}

export async function markSilentConfirmation(ctx: Ctx, confirmationId: string) {
  const confirmation = await one<{ id: string; statement_id: string; status: string; silence_allowed: number }>(
    ctx.db,
    "select * from email_confirmations where id = ?",
    confirmationId,
  );
  if (!confirmation || confirmation.status !== "sent" || confirmation.silence_allowed !== 1) return false;
  const statement = await mustStatement(ctx, confirmation.statement_id);
  if (statement.person_kind !== "collaborator" || statement.status !== "sent") return false;
  const receipt = "事先约定的沉默确认期限已届满，系统按约定记为确认。如有证据证明核算错误，仍应更正。";
  await run(
    ctx.db,
    `update email_confirmations
     set status = 'confirmed', confirm_method = 'silence', confirmed_at = ?, receipt_text = ?
     where id = ? and status = 'sent'`,
    ctx.now(),
    receipt,
    confirmation.id,
  );
  await run(ctx.db, "update statements set status = 'confirmed' where id = ? and status = 'sent'", statement.id);
  await audit(ctx, {
    action: "statement.confirm",
    objectType: "statement",
    objectId: statement.id,
    after: { method: "silence" },
    actorName: "系统定时任务",
  });
  return true;
}

export async function createPayment(ctx: Ctx, input: {
  statementId: string;
  paidOn: string;
  referenceNo: string;
  file: Upload;
}) {
  const actor = requireRoles(ctx, ["payment_maker"]);
  const statement = await mustStatement(ctx, input.statementId);
  const labels = COPY[statement.person_kind];
  if (statement.status !== "confirmed") throw new HttpError(409, `${labels.statement}尚未确认，不能登记付款`);
  const existing = await one(
    ctx.db,
    "select id from payments where statement_id = ? and status in ('pending_check', 'approved')",
    statement.id,
  );
  if (existing) throw new HttpError(409, "这张核算单已经有付款登记");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) throw new HttpError(400, "付款日期格式应为 YYYY-MM-DD");
  const referenceNo = assertText(input.referenceNo, "银行流水号", 4);
  const saved = await putFile(ctx, input.file, actor.id);
  const paymentId = id();
  await run(
    ctx.db,
    `insert into payments
      (id, statement_id, person_id, person_kind, amount_cents, paid_on, reference_no, voucher_file_id, maker_id, status, settlement_flag, maker_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_check', 'recorded', ?)`,
    paymentId,
    statement.id,
    statement.person_id,
    statement.person_kind,
    statement.amount_cents,
    input.paidOn,
    referenceNo,
    saved.id,
    actor.id,
    ctx.now(),
  );
  await audit(ctx, {
    action: "payment.create",
    objectType: "payment",
    objectId: paymentId,
    after: { amountCents: statement.amount_cents, referenceNo, sha256: saved.sha256, personKind: statement.person_kind },
  });
  return { id: paymentId };
}

export async function decidePayment(ctx: Ctx, paymentId: string, decision: "approved" | "rejected", note: string) {
  const actor = requireRoles(ctx, ["payment_checker"]);
  const payment = await one<{ id: string; maker_id: string; status: string; person_kind: "employee" | "collaborator" }>(
    ctx.db,
    "select * from payments where id = ?",
    paymentId,
  );
  if (!payment) throw new HttpError(404, "没有这笔付款登记");
  if (payment.status !== "pending_check") throw new HttpError(409, "这笔登记不在待复核状态");
  if (actor.id === payment.maker_id) throw new HttpError(409, "复核人与制单人不能是同一人");
  if (decision !== "approved" && decision !== "rejected") throw new HttpError(400, "请选择通过或退回");
  const opinion = note?.trim() ?? "";
  if (decision === "rejected" && opinion.length < 2) throw new HttpError(400, "退回必须填写原因");
  await run(
    ctx.db,
    `update payments set checker_id = ?, status = ?, checker_at = ?, checker_note = ? where id = ?`,
    actor.id,
    decision,
    ctx.now(),
    opinion,
    paymentId,
  );
  await audit(ctx, {
    action: decision === "approved" ? "payment.approve" : "payment.reject",
    objectType: "payment",
    objectId: paymentId,
    after: { decision, personKind: payment.person_kind },
  });
}
