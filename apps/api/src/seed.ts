import { TEST_ACCOUNTS } from "../../../packages/domain/src/index.ts";
import { createOperator, loadActor, registerPerson } from "./accounts";
import { createPrivacyRequest, handlePrivacyRequest } from "./accounts";
import { completeMockSign, createContract, recordConsent, startIdentity, terminateContract } from "./compliance";
import { createPayment, createStatement, createTask, decideAcceptance, decidePayment, objectStatement, sendStatement, confirmStatement, submitDeliverable } from "./fulfillment";
import { createBackup } from "./maintenance";
import { ENTERPRISE, TEMPLATES } from "./templates";
import type { Actor, Ctx, Env, Upload } from "./types";
import { mustUser } from "./accounts";
import { one, run, sessionPepper } from "./util";

let seeding: Promise<{ seeded: boolean }> | null = null;

export function shouldAutoSeed(env: Env): boolean {
  return env.SEED !== "off" && (env.ENVIRONMENT === "dev" || env.ENVIRONMENT === "prod");
}

export async function ensureSeed(env: Env): Promise<void> {
  if (!shouldAutoSeed(env)) return;
  if (!seeding) seeding = seedDatabase(env).finally(() => { seeding = null; });
  await seeding;
}

function textFile(filename: string, content: string): Upload {
  return { bytes: new TextEncoder().encode(content), filename, contentType: "text/plain; charset=utf-8" };
}

async function asActor(ctx: Ctx, userId: string): Promise<Actor> {
  return loadActor(ctx, await mustUser(ctx, userId));
}

export async function seedDatabase(env: Env): Promise<{ seeded: boolean }> {
  sessionPepper(env);
  const count = await one<{ n: number }>(env.DB, "select count(*) as n from users");
  if (count && Number(count.n) > 0) return { seeded: false };
  const clock = { iso: "2026-10-01T01:00:00.000Z" };
  const ctx: Ctx = {
    db: env.DB,
    bucket: env.FILES,
    env,
    actor: null,
    ip: "127.0.0.1",
    ua: "seed",
    now: () => clock.iso,
  };
  const at = (iso: string) => { clock.iso = iso; };

  await run(
    ctx.db,
    `insert into enterprise
      (id, name, credit_code, address, legal_rep, hr_email, project_email, finance_email, privacy_email, complaint_phone)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ENTERPRISE.id,
    ENTERPRISE.name,
    ENTERPRISE.creditCode,
    ENTERPRISE.address,
    ENTERPRISE.legalRep,
    ENTERPRISE.hrEmail,
    ENTERPRISE.projectEmail,
    ENTERPRISE.financeEmail,
    ENTERPRISE.privacyEmail,
    ENTERPRISE.complaintPhone,
  );
  for (const template of TEMPLATES) {
    await run(
      ctx.db,
      `insert into contract_templates (id, kind, version, title, body, active, created_at) values (?, ?, ?, ?, ?, 1, ?)`,
      template.id,
      template.kind,
      template.version,
      template.title,
      template.body,
      clock.iso,
    );
  }

  const makerAccount = TEST_ACCOUNTS[0];
  const checkerAccount = TEST_ACCOUNTS[1];
  const maker = await createOperator(ctx, {
    name: makerAccount.name,
    email: makerAccount.email,
    designatedEmail: makerAccount.email,
    phone: "13800001001",
    password: makerAccount.password,
    roles: ["admin", "issuer", "payment_maker", "privacy_officer", "auditor"],
  });
  ctx.actor = await asActor(ctx, maker.id);
  const checker = await createOperator(ctx, {
    name: checkerAccount.name,
    email: checkerAccount.email,
    designatedEmail: checkerAccount.email,
    phone: "13800001002",
    password: checkerAccount.password,
    roles: ["admin", "acceptor", "payment_checker", "auditor"],
  });
  const makerActor = ctx.actor;
  const checkerActor = await asActor(ctx, checker.id);

  await runStory(ctx, at, makerActor, checkerActor, {
    kind: "employee",
    name: "何牧",
    email: "hemu@guoxie.chang2.ccwu.cc",
    password: "Test-only-Terminated-2026",
    phone: "13800001005",
    idNumber: "110101199508086789",
    face: true,
    silent: false,
    confirm: "platform",
    terminate: true,
    title: "九月会员资料核对",
    whatToDo: "核对九月新增会员资料并提交差错表",
    whatToDeliver: "差错表和核对说明",
    howPaid: "按劳动合同约定的月工资，由单位线下核算。",
    whenSettles: "次月 10 日前随工资发放",
    amountCents: 860000,
    period: "2026年9月",
    reject: "差错表没有标明数据来源。",
    accept: "第二版已标明来源，可以验收。",
    objection: "远程补贴数额需要再核对。",
    referenceNo: "YH202610090014",
    paidOn: "2026-10-08",
    base: "2026-10-01",
  });

  const lin = TEST_ACCOUNTS[2];
  await runStory(ctx, at, makerActor, checkerActor, {
    kind: "employee",
    name: lin.name,
    email: lin.email,
    password: lin.password,
    phone: "13800001003",
    idNumber: "110101199203034321",
    face: false,
    silent: false,
    confirm: "platform",
    terminate: false,
    title: "十月客户档案整理与周报",
    whatToDo: "整理华北片区十月客户档案，并提交周报",
    whatToDeliver: "客户档案对照表与周报",
    howPaid: "按劳动合同约定的月工资，由单位线下核算。本任务不另行计价。",
    whenSettles: "次月 10 日前随工资发放",
    amountCents: 1_280_000,
    period: "2026年10月",
    reject: "周报缺少客户编号对照，请补上后再交。",
    accept: "第二版已补齐客户编号，成果符合岗位要求。",
    objection: "远程办公补贴金额与劳动合同不一致。",
    referenceNo: "YH202610140021",
    paidOn: "2026-10-14",
    base: "2026-10-02",
  });

  const zhou = TEST_ACCOUNTS[3];
  const zhouId = await runStory(ctx, at, makerActor, checkerActor, {
    kind: "collaborator",
    name: zhou.name,
    email: zhou.email,
    password: zhou.password,
    phone: "13800001004",
    idNumber: "310101198811112345",
    face: true,
    silent: true,
    confirm: "email",
    terminate: false,
    title: "官网改版视觉设计",
    whatToDo: "完成集团官网首页和两级栏目的视觉设计，不含前端开发",
    whatToDeliver: "可编辑源文件与导出图",
    howPaid: "固定总价。验收通过后按成果结算，不按月支付固定报酬。",
    whenSettles: "核算单确认后 10 个工作日内付款",
    amountCents: 3_600_000,
    period: "官网改版任务",
    reject: "未提供可编辑源文件。",
    accept: "源文件齐全，验收通过。",
    objection: "税前金额与任务单总额不一致。",
    referenceNo: "YH202610140088",
    paidOn: "2026-10-14",
    base: "2026-10-03",
  });

  at("2026-10-14T08:00:00.000Z");
  ctx.actor = await asActor(ctx, zhouId);
  await createPrivacyRequest(ctx, "complaint", "希望确认服务费核算单的指定邮箱是否只使用本人登记邮箱。");
  const linUser = await one<{ id: string }>(ctx.db, "select id from users where email = ?", lin.email);
  ctx.actor = await asActor(ctx, linUser!.id);
  const access = await createPrivacyRequest(ctx, "access", "申请查阅本人实名核验结果、劳动合同和工资核算确认记录。");
  at("2026-10-14T09:00:00.000Z");
  ctx.actor = makerActor;
  await handlePrivacyRequest(ctx, access.id, "accepted", "已受理。将在 15 个工作日内提供本人相关记录副本，不包含其他人员信息。");
  await createBackup(ctx, "上线前备份");
  return { seeded: true };
}

async function runStory(
  ctx: Ctx,
  at: (iso: string) => void,
  maker: Actor,
  checker: Actor,
  spec: {
    kind: "employee" | "collaborator";
    name: string;
    email: string;
    password: string;
    phone: string;
    idNumber: string;
    face: boolean;
    silent: boolean;
    confirm: "platform" | "email";
    terminate: boolean;
    title: string;
    whatToDo: string;
    whatToDeliver: string;
    howPaid: string;
    whenSettles: string;
    amountCents: number;
    period: string;
    reject: string;
    accept: string;
    objection: string;
    referenceNo: string;
    paidOn: string;
    base: string;
  },
): Promise<string> {
  at(`${spec.base}T01:00:00.000Z`);
  const registered = await registerPerson(ctx, {
    kind: spec.kind,
    name: spec.name,
    email: spec.email,
    designatedEmail: spec.email,
    phone: spec.phone,
    password: spec.password,
    platformAgreed: true,
  });
  const person = await asActor(ctx, registered.id);
  ctx.actor = person;
  at(`${spec.base}T02:00:00.000Z`);
  await recordConsent(ctx, {
    idNumberAgreed: true,
    faceAgreed: spec.face,
    faceAlternative: spec.face ? null : "线下核验",
    bankAgreed: true,
    thirdPartyAgreed: true,
  });
  at(`${spec.base}T03:00:00.000Z`);
  await startIdentity(ctx, {
    legalName: spec.name,
    idNumber: spec.idNumber,
    phone: spec.phone,
    method: spec.face ? "three_factor" : "offline",
  });
  ctx.actor = maker;
  at(`${spec.base}T04:00:00.000Z`);
  const contract = await createContract(ctx, {
    personId: person.id,
    silentConfirmAgreed: spec.silent,
    silentConfirmDays: spec.silent ? 3 : null,
  });
  ctx.actor = person;
  at(`${spec.base}T05:00:00.000Z`);
  await completeMockSign(ctx, contract.providerContractId, spec.silent);
  ctx.actor = maker;
  at(`${spec.base}T06:00:00.000Z`);
  const task = await createTask(ctx, {
    personId: person.id,
    title: spec.title,
    whatToDo: spec.whatToDo,
    whatToDeliver: spec.whatToDeliver,
    howPaid: spec.howPaid,
    whenSettles: spec.whenSettles,
    amountCents: spec.amountCents,
  });
  ctx.actor = person;
  at(`${spec.base}T07:00:00.000Z`);
  await submitDeliverable(ctx, task.id, "第一版，请查收。", textFile("draft-v1.txt", `${spec.title} 第一版`));
  ctx.actor = checker;
  at(`${spec.base}T08:00:00.000Z`);
  await decideAcceptance(ctx, task.id, "rejected", spec.reject);
  ctx.actor = person;
  at(`${spec.base}T09:00:00.000Z`);
  await submitDeliverable(ctx, task.id, "已按驳回意见修改。", textFile("draft-v2.txt", `${spec.title} 第二版`));
  ctx.actor = checker;
  at(`${spec.base}T10:00:00.000Z`);
  await decideAcceptance(ctx, task.id, "accepted", spec.accept);
  ctx.actor = maker;
  at(`${spec.base}T11:00:00.000Z`);
  const first = await createStatement(ctx, {
    taskId: task.id,
    amountCents: spec.amountCents - 100,
    periodLabel: spec.period,
    note: "线下核算初稿",
    file: textFile("statement-v1.txt", `${spec.period} 初稿`),
  });
  await sendStatement(ctx, first.id);
  ctx.actor = person;
  at(`${spec.base}T12:00:00.000Z`);
  await objectStatement(ctx, first.id, spec.objection);
  ctx.actor = maker;
  at(`${spec.base}T13:00:00.000Z`);
  const second = await createStatement(ctx, {
    taskId: task.id,
    amountCents: spec.amountCents,
    periodLabel: spec.period,
    note: "按异议修改后的线下核算",
    file: textFile("statement-v2.txt", `${spec.period} 确认版 ${spec.amountCents}`),
  });
  await sendStatement(ctx, second.id);
  at(`${spec.base}T14:00:00.000Z`);
  if (spec.confirm === "platform") {
    ctx.actor = person;
    await confirmStatement(ctx, { statementId: second.id, method: "platform_click" });
  } else {
    ctx.actor = maker;
    await confirmStatement(ctx, { statementId: second.id, method: "email_reply", receiptText: "确认。金额无误。" });
  }
  ctx.actor = maker;
  at(`${spec.base}T15:00:00.000Z`);
  const payment = await createPayment(ctx, {
    statementId: second.id,
    paidOn: spec.paidOn,
    referenceNo: spec.referenceNo,
    file: textFile("voucher.txt", `银行回单 ${spec.referenceNo}`),
  });
  ctx.actor = checker;
  at(`${spec.base}T16:00:00.000Z`);
  await decidePayment(ctx, payment.id, "approved", "复核通过，与银行回单一致。");
  if (spec.terminate) {
    ctx.actor = maker;
    at(`${spec.base}T17:00:00.000Z`);
    const contractRow = await one<{ id: string }>(ctx.db, "select id from contracts where person_id = ? and status = 'signed'", person.id);
    await terminateContract(ctx, { contractId: contractRow!.id, reason: "劳动合同经协商一致解除", settlement: "settled" });
  }
  return person.id;
}
