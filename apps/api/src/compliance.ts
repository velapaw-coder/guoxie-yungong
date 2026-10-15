import { COPY } from "../../../packages/domain/src/index.ts";
import { loadActor, mustUser, publicUser } from "./accounts";
import { audit } from "./audit";
import { putFile } from "./files";
import { getEsignProvider, getIdentityProvider } from "./providers";
import { ENTERPRISE } from "./templates";
import type { ContractRow, Ctx, UserRow } from "./types";
import {
  HttpError,
  assertIdNumber,
  esignSecret,
  id,
  many,
  maskId,
  one,
  renderTemplate,
  requireActor,
  requireRoles,
  run,
  sessionPepper,
  sha256Text,
} from "./util";

type ConsentRow = {
  id: string;
  user_id: string;
  document_version: string;
  id_number_agreed: number;
  face_agreed: number;
  face_alternative: string | null;
  bank_agreed: number;
  third_party_agreed: number;
  agreed_at: string;
};

export async function latestConsent(ctx: Ctx, userId: string): Promise<ConsentRow | null> {
  return one<ConsentRow>(
    ctx.db,
    "select * from consents where user_id = ? order by agreed_at desc limit 1",
    userId,
  );
}

export function consentReady(ctx: Ctx, consent: ConsentRow | null): boolean {
  return Boolean(
    consent &&
      consent.document_version === ctx.env.CONSENT_VERSION &&
      consent.id_number_agreed === 1 &&
      consent.third_party_agreed === 1,
  );
}

export function presentConsent(consent: ConsentRow | null) {
  if (!consent) return null;
  return {
    id: consent.id,
    documentVersion: consent.document_version,
    idNumberAgreed: consent.id_number_agreed === 1,
    faceAgreed: consent.face_agreed === 1,
    faceAlternative: consent.face_alternative,
    bankAgreed: consent.bank_agreed === 1,
    thirdPartyAgreed: consent.third_party_agreed === 1,
    agreedAt: consent.agreed_at,
  };
}

export async function recordConsent(ctx: Ctx, input: {
  idNumberAgreed: boolean;
  faceAgreed: boolean;
  faceAlternative: string | null;
  bankAgreed: boolean;
  thirdPartyAgreed: boolean;
}) {
  const actor = requireActor(ctx);
  if (actor.kind === "operator") throw new HttpError(409, "管理人员不在此签署个人信息授权");
  if (!input.idNumberAgreed || !input.thirdPartyAgreed) {
    throw new HttpError(400, "身份证号码和向电子签服务商提供信息，需要单独同意后才能继续");
  }
  if (!input.faceAgreed && !input.faceAlternative?.trim()) {
    throw new HttpError(400, "不同意人脸识别时，请填写替代核验方式");
  }
  const consentId = id();
  await run(
    ctx.db,
    `insert into consents
      (id, user_id, document_version, id_number_agreed, face_agreed, face_alternative, bank_agreed, third_party_agreed, agreed_at, ip, user_agent)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    consentId,
    actor.id,
    ctx.env.CONSENT_VERSION,
    input.idNumberAgreed ? 1 : 0,
    input.faceAgreed ? 1 : 0,
    input.faceAgreed ? null : input.faceAlternative?.trim(),
    input.bankAgreed ? 1 : 0,
    input.thirdPartyAgreed ? 1 : 0,
    ctx.now(),
    ctx.ip,
    ctx.ua,
  );
  await audit(ctx, {
    action: "consent.record",
    objectType: "consent",
    objectId: consentId,
    after: { version: ctx.env.CONSENT_VERSION, faceAgreed: input.faceAgreed, bankAgreed: input.bankAgreed },
  });
  return { id: consentId, documentVersion: ctx.env.CONSENT_VERSION, agreedAt: ctx.now() };
}

export async function startIdentity(ctx: Ctx, input: {
  legalName: string;
  idNumber: string;
  phone: string;
  method: "three_factor" | "offline";
}) {
  const actor = requireActor(ctx);
  if (actor.kind === "operator") throw new HttpError(409, "管理人员不进行用工实名");
  const consent = await latestConsent(ctx, actor.id);
  if (!consentReady(ctx, consent)) throw new HttpError(409, "请先完成本版个人信息单独同意");
  if (input.legalName.trim() !== actor.name) throw new HttpError(400, "核验姓名必须与账号姓名一致");
  assertIdNumber(input.idNumber);
  if (!/^1\d{10}$/.test(input.phone)) throw new HttpError(400, "请填写 11 位手机号");
  if (input.method !== "three_factor" && input.method !== "offline") throw new HttpError(400, "核验方式不正确");
  if (!consent?.face_agreed && input.method !== "offline") {
    throw new HttpError(409, "未单独同意人脸识别时，请选择线下核验");
  }
  const provider = getIdentityProvider();
  const started = await provider.start(input);
  const verificationId = id();
  await run(
    ctx.db,
    `insert into identity_verifications
      (id, user_id, provider, provider_ref, method, status, created_at, verified_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    verificationId,
    actor.id,
    provider.name,
    started.providerRef,
    input.method,
    started.status === "pending" ? "pending" : started.status,
    ctx.now(),
    started.status === "verified" ? ctx.now() : null,
  );
  if (started.status === "verified") {
    const idHash = await sha256Text(`${sessionPepper(ctx.env)}:${input.idNumber.toUpperCase()}`);
    await run(
      ctx.db,
      "update users set identity_status = 'verified', id_number_masked = ?, id_number_hash = ?, phone = ? where id = ?",
      maskId(input.idNumber),
      idHash,
      input.phone,
      actor.id,
    );
  } else if (started.status === "failed") {
    await run(ctx.db, "update users set identity_status = 'failed' where id = ?", actor.id);
  } else {
    await run(ctx.db, "update users set identity_status = 'pending' where id = ?", actor.id);
  }
  await audit(ctx, {
    action: "identity.result",
    objectType: "identity_verification",
    objectId: verificationId,
    after: { provider: provider.name, method: input.method, status: started.status, providerRef: started.providerRef },
  });
  return { status: started.status, method: input.method, provider: provider.name, providerRef: started.providerRef };
}

async function signedContract(ctx: Ctx, personId: string): Promise<ContractRow | null> {
  return one<ContractRow>(
    ctx.db,
    "select * from contracts where person_id = ? and status = 'signed' order by signed_at desc limit 1",
    personId,
  );
}

export async function readiness(ctx: Ctx, person: UserRow) {
  const blockers: string[] = [];
  if (person.kind === "operator") blockers.push("管理人员不进入履约流程");
  if (person.status !== "active") blockers.push("账号已停用");
  const consent = await latestConsent(ctx, person.id);
  const consentOk = person.kind !== "operator" && consentReady(ctx, consent);
  if (person.kind !== "operator" && !consentOk) blockers.push("尚未完成本版个人信息单独同意");
  if (person.kind !== "operator" && person.identity_status !== "verified") blockers.push("尚未完成实名认证");
  const contract = person.kind === "operator" ? null : await signedContract(ctx, person.id);
  if (person.kind !== "operator" && !contract) {
    blockers.push(person.kind === "employee" ? "劳动合同尚未签署" : "项目服务协议尚未签署");
  }
  return {
    consent: consentOk,
    identity: person.identity_status === "verified",
    signed: Boolean(contract),
    active: person.status === "active",
    ready: blockers.length === 0,
    blockers,
    contract,
    consentRow: consent,
  };
}

export async function createContract(ctx: Ctx, input: {
  personId: string;
  silentConfirmAgreed?: boolean;
  silentConfirmDays?: number | null;
}) {
  requireRoles(ctx, ["issuer"]);
  const person = await mustUser(ctx, input.personId);
  if (person.kind !== "employee" && person.kind !== "collaborator") {
    throw new HttpError(409, "只能为劳动员工或项目合作方发起合同");
  }
  if (person.status !== "active") throw new HttpError(409, "账号已停用");
  if (person.identity_status !== "verified") throw new HttpError(409, "未完成实名认证，不能发起签署");
  const consent = await latestConsent(ctx, person.id);
  if (!consentReady(ctx, consent)) throw new HttpError(409, "未完成本版个人信息单独同意，不能发起签署");
  if (person.kind === "employee" && input.silentConfirmAgreed) {
    throw new HttpError(409, "劳动合同不适用沉默视为确认");
  }
  const silent = person.kind === "collaborator" && input.silentConfirmAgreed === true;
  if (silent && (!input.silentConfirmDays || input.silentConfirmDays < 1 || input.silentConfirmDays > 30)) {
    throw new HttpError(400, "沉默确认天数须在 1 到 30 个自然日之间");
  }
  const open = await one(
    ctx.db,
    "select id from contracts where person_id = ? and status in ('signing', 'signed')",
    person.id,
  );
  if (open) throw new HttpError(409, person.kind === "employee" ? "该劳动员工已有劳动合同" : "该项目合作方已有服务协议");
  const contractKind = person.kind === "employee" ? "labor" : "service";
  const template = await one<{ id: string; title: string; body: string }>(
    ctx.db,
    "select id, title, body from contract_templates where kind = ? and active = 1 order by created_at desc limit 1",
    contractKind,
  );
  if (!template) throw new HttpError(500, "没有可用的合同模板");
  const contractId = id();
  const serial = `${person.kind === "employee" ? "GY-LD" : "GY-FW"}-${contractId.slice(0, 8).toUpperCase()}`;
  const silenceClause = silent
    ? `乙方已单独勾选同意：收到服务费核算单后 ${input.silentConfirmDays} 个自然日内，既未确认也未提出书面异议的，视为确认。事后有证据证明核算错误的，甲方仍应更正，多退少补。`
    : person.kind === "employee"
      ? "乙方未回复工资核算单的，不视为确认，不影响乙方依法主张劳动报酬。"
      : "双方未约定沉默视为确认。逾期未回复不构成确认。";
  const body = renderTemplate(template.body, {
    甲方公司名称: ENTERPRISE.name,
    统一社会信用代码: ENTERPRISE.creditCode,
    住所: ENTERPRISE.address,
    法定代表人: ENTERPRISE.legalRep,
    姓名: person.name,
    身份证号掩码: person.id_number_masked ?? "未核验",
    指定邮箱: person.designated_email,
    合同编号: serial,
    沉默条款: silenceClause,
  });
  const provider = getEsignProvider();
  const flow = await provider.createFlow({ contractId, title: template.title, signerName: person.name });
  await run(
    ctx.db,
    `insert into contracts
      (id, person_id, person_kind, template_id, contract_kind, title, body, status, provider, provider_contract_id,
       silent_confirm_agreed, silent_confirm_days, designated_email, created_at)
     values (?, ?, ?, ?, ?, ?, ?, 'signing', ?, ?, ?, ?, ?, ?)`,
    contractId,
    person.id,
    person.kind,
    template.id,
    contractKind,
    `${template.title} ${serial}`,
    body,
    provider.name,
    flow.providerContractId,
    silent ? 1 : 0,
    silent ? input.silentConfirmDays : null,
    person.designated_email,
    ctx.now(),
  );
  await audit(ctx, {
    action: "contract.create",
    objectType: "contract",
    objectId: contractId,
    after: { personKind: person.kind, contractKind, providerContractId: flow.providerContractId, silent },
  });
  return { id: contractId, providerContractId: flow.providerContractId, contractKind };
}

async function finalizeSign(ctx: Ctx, contract: ContractRow) {
  const person = await mustUser(ctx, contract.person_id);
  const evidenceNo = `GY-EV-${contract.id.slice(0, 8).toUpperCase()}-${ctx.now().slice(0, 10).replaceAll("-", "")}`;
  const signedText = `${contract.body}\n签署完成\n电子签服务商：${contract.provider}\n服务商合同编号：${contract.provider_contract_id}\n存证编号：${evidenceNo}\n签署时间：${ctx.now()}\n签署人：${person.name}\n说明：此文本由模拟电子签服务商回传。正式环境回传 PDF，平台不自行生成签名。\n`;
  const file = await putFile(ctx, {
    bytes: new TextEncoder().encode(signedText),
    filename: `${contract.contract_kind}-${contract.id.slice(0, 8)}.txt`,
    contentType: "text/plain; charset=utf-8",
  }, person.id);
  await run(
    ctx.db,
    `update contracts set status = 'signed', evidence_no = ?, file_id = ?, signed_at = ?, body = ? where id = ? and status = 'signing'`,
    evidenceNo,
    file.id,
    ctx.now(),
    signedText,
    contract.id,
  );
  await audit(ctx, {
    action: "contract.signed",
    objectType: "contract",
    objectId: contract.id,
    after: { evidenceNo, sha256: file.sha256, provider: contract.provider },
    actorName: ctx.actor ? undefined : "电子签回调",
  });
  return { evidenceNo, sha256: file.sha256 };
}

export async function completeMockSign(ctx: Ctx, providerContractId: string, silentAcknowledged: boolean) {
  const actor = requireActor(ctx);
  const contract = await one<ContractRow>(ctx.db, "select * from contracts where provider_contract_id = ?", providerContractId);
  if (!contract) throw new HttpError(404, "没有这份待签署合同");
  if (contract.person_id !== actor.id) throw new HttpError(403, "只能由合同相对人本人签署");
  if (contract.status === "signed") return { evidenceNo: contract.evidence_no, already: true };
  if (contract.status !== "signing") throw new HttpError(409, "合同不在待签署状态");
  if (contract.silent_confirm_agreed === 1 && !silentAcknowledged) {
    throw new HttpError(400, "服务费核算单的沉默确认必须单独勾选。未勾选则本次签署不能完成");
  }
  if (contract.person_kind === "employee" && silentAcknowledged) {
    throw new HttpError(409, "劳动合同不能勾选沉默视为确认");
  }
  return finalizeSign(ctx, contract);
}

export async function applyEsignWebhook(ctx: Ctx, providerContractId: string, headerSecret: string | null) {
  if (headerSecret !== esignSecret(ctx.env)) throw new HttpError(401, "电子签回调密钥不正确");
  const contract = await one<ContractRow>(ctx.db, "select * from contracts where provider_contract_id = ?", providerContractId);
  if (!contract) throw new HttpError(404, "没有这份待签署合同");
  if (contract.status === "signed") return { evidenceNo: contract.evidence_no, already: true };
  if (contract.status !== "signing") throw new HttpError(409, "合同不在待签署状态");
  return finalizeSign(ctx, contract);
}

export async function terminateContract(ctx: Ctx, input: {
  contractId: string;
  reason: string;
  settlement: "settled" | "pending_settlement";
}) {
  requireRoles(ctx, ["admin"]);
  if (input.reason.trim().length < 2) throw new HttpError(400, "请填写终止原因");
  if (input.settlement !== "settled" && input.settlement !== "pending_settlement") {
    throw new HttpError(400, "请标明未结款项已结清或待结清");
  }
  const contract = await one<ContractRow>(ctx.db, "select * from contracts where id = ?", input.contractId);
  if (!contract) throw new HttpError(404, "没有这份合同");
  if (contract.status === "terminated") throw new HttpError(409, "合同已经终止");
  if (contract.status !== "signed") throw new HttpError(409, "只有已签署的合同可以终止");
  const pending = await one<{ n: number }>(
    ctx.db,
    "select count(*) as n from payments where person_id = ? and status = 'pending_check'",
    contract.person_id,
  );
  if (input.settlement === "settled" && pending && Number(pending.n) > 0) {
    throw new HttpError(409, "仍有未复核的付款登记，不能标记为已结清");
  }
  await run(
    ctx.db,
    "update contracts set status = 'terminated', terminated_at = ?, termination_reason = ? where id = ?",
    ctx.now(),
    input.reason.trim(),
    contract.id,
  );
  await run(
    ctx.db,
    "update users set status = 'disabled', disabled_at = ?, settlement_flag = ? where id = ?",
    ctx.now(),
    input.settlement,
    contract.person_id,
  );
  const payments = await many<{ id: string; status: string }>(
    ctx.db,
    "select id, status from payments where person_id = ?",
    contract.person_id,
  );
  for (const payment of payments) {
    const flag = payment.status === "approved" ? input.settlement : "pending_settlement";
    await run(ctx.db, "update payments set settlement_flag = ? where id = ?", flag, payment.id);
  }
  await run(
    ctx.db,
    "update tasks set status = 'closed' where person_id = ? and status in ('open', 'delivered', 'rejected')",
    contract.person_id,
  );
  await run(ctx.db, "delete from sessions where user_id = ?", contract.person_id);
  await audit(ctx, {
    action: "contract.terminate",
    objectType: "contract",
    objectId: contract.id,
    before: { status: contract.status },
    after: { status: "terminated", settlement: input.settlement, reason: input.reason.trim(), personKind: contract.person_kind },
  });
}

export async function applyIdentityWebhook(ctx: Ctx, providerRef: string, passed: boolean, secret: string) {
  if (secret !== esignSecret(ctx.env)) throw new HttpError(401, "实名回调密钥不正确");
  const row = await one<{ id: string; user_id: string }>(
    ctx.db,
    "select id, user_id from identity_verifications where provider_ref = ?",
    providerRef,
  );
  if (!row) throw new HttpError(404, "没有这笔核验");
  const status = passed ? "verified" : "failed";
  await run(
    ctx.db,
    "update identity_verifications set status = ?, verified_at = ? where id = ?",
    status,
    passed ? ctx.now() : null,
    row.id,
  );
  await run(ctx.db, "update users set identity_status = ? where id = ?", status, row.user_id);
  await audit(ctx, {
    action: "identity.callback",
    objectType: "identity_verification",
    objectId: row.id,
    after: { status, providerRef },
    actorName: "实名回调",
  });
}

export async function presentContract(ctx: Ctx, contract: ContractRow) {
  const file = contract.file_id
    ? await one<{ sha256: string; filename: string }>(ctx.db, "select sha256, filename from files where id = ?", contract.file_id)
    : null;
  return {
    id: contract.id,
    personId: contract.person_id,
    personKind: contract.person_kind,
    contractKind: contract.contract_kind,
    title: contract.title,
    body: contract.body,
    status: contract.status,
    provider: contract.provider,
    providerContractId: contract.provider_contract_id,
    evidenceNo: contract.evidence_no,
    fileId: contract.file_id,
    fileSha256: file?.sha256 ?? null,
    filename: file?.filename ?? null,
    silentConfirmAgreed: contract.silent_confirm_agreed === 1,
    silentConfirmDays: contract.silent_confirm_days,
    designatedEmail: contract.designated_email,
    createdAt: contract.created_at,
    signedAt: contract.signed_at,
    terminatedAt: contract.terminated_at,
    terminationReason: contract.termination_reason,
    labels: COPY[contract.person_kind],
  };
}

export async function listUsers(ctx: Ctx) {
  requireRoles(ctx, ["admin", "auditor"]);
  const users = await many<UserRow>(ctx.db, "select * from users order by created_at");
  const result = [];
  for (const user of users) {
    const actor = await loadActor(ctx, user);
    result.push(publicUser(user, actor.roles));
  }
  return result;
}

export { publicUser as presentUser };
