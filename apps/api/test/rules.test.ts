import { describe, expect, it } from "vitest";
import { COPY, yuanToCents } from "../../../packages/domain/src/index.ts";
import { ENTERPRISE, TEMPLATES } from "../src/templates";
import { seedDatabase } from "../src/seed";
import { api, login, setup } from "./harness";

async function seedOrg(env: ReturnType<typeof setup>["env"]) {
  await env.DB.prepare(
    `insert into enterprise (id, name, credit_code, address, legal_rep, hr_email, project_email, finance_email, privacy_email, complaint_phone)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
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
  ).run();
  for (const template of TEMPLATES) {
    await env.DB.prepare(
      "insert into contract_templates (id, kind, version, title, body, active, created_at) values (?, ?, ?, ?, ?, 1, ?)",
    ).bind(template.id, template.kind, template.version, template.title, template.body, "2026-10-01T00:00:00.000Z").run();
  }
}

async function registerReady(env: ReturnType<typeof setup>["env"], kind: "employee" | "collaborator", email: string, idNumber: string) {
  const registered = await api(env, "POST", "/api/auth/register", {
    json: {
      kind,
      name: kind === "employee" ? "测试员工" : "测试合作",
      email,
      designatedEmail: email,
      phone: "13800001111",
      password: "Test-only-Flow-2026",
      platformAgreed: true,
    },
  });
  expect(registered.status).toBe(201);
  const token = await login(env, email, "Test-only-Flow-2026");
  const consent = await api(env, "POST", "/api/consent", {
    token,
    json: { idNumberAgreed: true, faceAgreed: false, faceAlternative: "线下核验", bankAgreed: true, thirdPartyAgreed: true },
  });
  expect(consent.status).toBe(201);
  const identity = await api(env, "POST", "/api/identity", {
    token,
    json: { legalName: kind === "employee" ? "测试员工" : "测试合作", idNumber, phone: "13800001111", method: "offline" },
  });
  expect(identity.status).toBe(200);
  expect(identity.data.status).toBe("verified");
  return { id: registered.data.id as string, token };
}

describe("核心规则", () => {
  it("金额以分保存，元换算不使用浮点误差", () => {
    expect(yuanToCents("12.80")).toBe(1280);
    expect(yuanToCents("12800")).toBe(1_280_000);
    expect(yuanToCents("0.1")).toBe(10);
    expect(yuanToCents("12.345")).toBeNull();
  });

  it("两类措辞不会混用", () => {
    expect(COPY.employee.statement).not.toContain("服务费");
    expect(COPY.employee.contract).toContain("劳动");
    expect(COPY.collaborator.statement).not.toContain("工资");
    expect(COPY.collaborator.payment).toContain("服务费");
    expect(COPY.employee.silence).toContain("不视为确认");
  });

  it("未签署不能发单，合同类型不能交叉", async () => {
    const { env } = setup();
    await seedOrg(env);
    const maker = await api(env, "POST", "/api/admin/users", {
      json: {
        name: "梁淑敏",
        email: "maker@guoxie.chang2.ccwu.cc",
        designatedEmail: "maker@guoxie.chang2.ccwu.cc",
        phone: "13800001001",
        password: "Test-only-Maker-2026",
        roles: ["admin", "issuer", "payment_maker"],
      },
    });
    expect(maker.status).toBe(201);
    const makerToken = await login(env, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026");
    const employee = await registerReady(env, "employee", "employee@guoxie.chang2.ccwu.cc", "110101199203034321");
    const collaborator = await registerReady(env, "collaborator", "collaborator@guoxie.chang2.ccwu.cc", "310101198811112345");

    const tooEarly = await api(env, "POST", "/api/employee-tasks", {
      token: makerToken,
      json: {
        personId: employee.id,
        title: "档案",
        whatToDo: "整理档案并形成周报",
        whatToDeliver: "周报",
        howPaid: "按劳动合同约定的月工资线下核算",
        whenSettles: "次月发放",
        amountCents: 100,
      },
    });
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.data.error).toContain("劳动合同尚未签署");

    const wrong = await api(env, "POST", "/api/service-contracts", {
      token: makerToken,
      json: { personId: employee.id, silentConfirmAgreed: true, silentConfirmDays: 3 },
    });
    expect(wrong.status).toBe(409);
    expect(wrong.data.error).toContain("项目合作方");

    const wrongLabor = await api(env, "POST", "/api/labor-contracts", {
      token: makerToken,
      json: { personId: collaborator.id },
    });
    expect(wrongLabor.status).toBe(409);
    expect(wrongLabor.data.error).toContain("劳动员工");

    const silentOnLabor = await api(env, "POST", "/api/labor-contracts", {
      token: makerToken,
      json: { personId: employee.id, silentConfirmAgreed: true },
    });
    expect(silentOnLabor.status).toBe(409);
    expect(silentOnLabor.data.error).toContain("沉默");

    const labor = await api(env, "POST", "/api/labor-contracts", { token: makerToken, json: { personId: employee.id } });
    expect(labor.status).toBe(201);
    const service = await api(env, "POST", "/api/service-contracts", {
      token: makerToken,
      json: { personId: collaborator.id, silentConfirmAgreed: false },
    });
    expect(service.status).toBe(201);

    const employees = await api(env, "GET", "/api/employees", { token: makerToken });
    expect(employees.status).toBe(200);
    const employeeRows = employees.data as unknown as Array<{ email: string }>;
    expect(employeeRows.every((row) => row.email !== "collaborator@guoxie.chang2.ccwu.cc")).toBe(true);

    const crossed = await api(env, "GET", `/api/employees/${collaborator.id}`, { token: makerToken });
    expect(crossed.status).toBe(404);
  });

  it("制单人不能复核自己，发单人不能验收自己，审计日志不能改删", async () => {
    const { env, sqlite } = setup();
    await seedOrg(env);
    await api(env, "POST", "/api/admin/users", {
      json: {
        name: "梁淑敏",
        email: "maker@guoxie.chang2.ccwu.cc",
        designatedEmail: "maker@guoxie.chang2.ccwu.cc",
        phone: "13800001001",
        password: "Test-only-Maker-2026",
        roles: ["admin", "issuer", "acceptor", "payment_maker", "payment_checker"],
      },
    });
    const makerToken = await login(env, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026");
    await api(env, "POST", "/api/admin/users", {
      token: makerToken,
      json: {
        name: "韩砺",
        email: "checker@guoxie.chang2.ccwu.cc",
        designatedEmail: "checker@guoxie.chang2.ccwu.cc",
        phone: "13800001002",
        password: "Test-only-Checker-2026",
        roles: ["admin", "acceptor", "payment_checker"],
      },
    });
    const checkerToken = await login(env, "checker@guoxie.chang2.ccwu.cc", "Test-only-Checker-2026");
    const employee = await registerReady(env, "employee", "employee@guoxie.chang2.ccwu.cc", "110101199203034321");
    const labor = await api(env, "POST", "/api/labor-contracts", { token: makerToken, json: { personId: employee.id } });
    const preview = await api(env, "GET", `/api/mock/esign/${(labor.data as { providerContractId: string }).providerContractId}`, { token: employee.token });
    expect(preview.status).toBe(200);
    const signed = await api(env, "POST", `/api/mock/esign/${(labor.data as { providerContractId: string }).providerContractId}/complete`, {
      token: employee.token,
      json: { silentAcknowledged: false },
    });
    expect(signed.status).toBe(200);
    expect(signed.data.evidenceNo).toBeTruthy();

    const task = await api(env, "POST", "/api/employee-tasks", {
      token: makerToken,
      json: {
        personId: employee.id,
        title: "档案整理",
        whatToDo: "整理客户档案并提交周报",
        whatToDeliver: "周报",
        howPaid: "按劳动合同约定的月工资线下核算",
        whenSettles: "次月发放",
        amountCents: 1280000,
      },
    });
    expect(task.status).toBe(201);
    const form = new FormData();
    form.set("note", "第一版周报");
    form.set("file", new File(["周报"], "note.txt", { type: "text/plain" }));
    const delivered = await api(env, "POST", `/api/tasks/${task.data.id}/deliverables`, { token: employee.token, form });
    expect(delivered.status).toBe(201);

    const selfAccept = await api(env, "POST", `/api/tasks/${task.data.id}/acceptance`, {
      token: makerToken,
      json: { decision: "accepted", reason: "发单人自己验收" },
    });
    expect(selfAccept.status).toBe(409);
    expect(selfAccept.data.error).toContain("不能是同一人");

    const accepted = await api(env, "POST", `/api/tasks/${task.data.id}/acceptance`, {
      token: checkerToken,
      json: { decision: "accepted", reason: "成果完整，验收通过。" },
    });
    expect(accepted.status).toBe(200);

    const slip = new FormData();
    slip.set("taskId", String(task.data.id));
    slip.set("amountCents", "1280000");
    slip.set("periodLabel", "2026年10月");
    slip.set("note", "线下工资核算");
    slip.set("file", new File(["工资核算单"], "wage.txt", { type: "text/plain" }));
    const statement = await api(env, "POST", "/api/wage-slips", { token: makerToken, form: slip });
    expect(statement.status).toBe(201);
    const serviceFee = new FormData();
    serviceFee.set("taskId", String(task.data.id));
    serviceFee.set("amountCents", "1280000");
    serviceFee.set("periodLabel", "2026年10月");
    serviceFee.set("note", "错误类型");
    serviceFee.set("file", new File(["服务费"], "fee.txt", { type: "text/plain" }));
    const crossedFee = await api(env, "POST", "/api/service-fees", { token: makerToken, form: serviceFee });
    expect(crossedFee.status).toBe(404);

    await api(env, "POST", `/api/statements/${statement.data.id}/send`, { token: makerToken });
    const confirmed = await api(env, "POST", `/api/statements/${statement.data.id}/confirm`, { token: employee.token, json: {} });
    expect(confirmed.status).toBe(200);

    const pay = new FormData();
    pay.set("statementId", String(statement.data.id));
    pay.set("paidOn", "2026-10-14");
    pay.set("referenceNo", "YH202610140099");
    pay.set("file", new File(["回单"], "voucher.txt", { type: "text/plain" }));
    const payment = await api(env, "POST", "/api/payments", { token: makerToken, form: pay });
    expect(payment.status).toBe(201);
    const samePerson = await api(env, "POST", `/api/payments/${payment.data.id}/decision`, {
      token: makerToken,
      json: { decision: "approved", note: "自己复核" },
    });
    expect(samePerson.status).toBe(409);
    expect(samePerson.data.error).toContain("不能是同一人");
    const approved = await api(env, "POST", `/api/payments/${payment.data.id}/decision`, {
      token: checkerToken,
      json: { decision: "approved", note: "复核通过" },
    });
    expect(approved.status).toBe(200);

    expect(() => sqlite.prepare("update audit_logs set action = 'tamper'").run()).toThrow(/审计日志只允许追加/);
    expect(() => sqlite.prepare("delete from audit_logs").run()).toThrow(/审计日志只允许追加/);
    const missing = await api(env, "POST", "/api/admin/audit", { token: makerToken, json: { action: "tamper" } });
    expect(missing.status).toBe(404);
  });

  it("沉默确认只对事先约定的项目合作方生效", async () => {
    const { env, sqlite } = setup();
    await seedOrg(env);
    await api(env, "POST", "/api/admin/users", {
      json: {
        name: "梁淑敏",
        email: "maker@guoxie.chang2.ccwu.cc",
        designatedEmail: "maker@guoxie.chang2.ccwu.cc",
        phone: "13800001001",
        password: "Test-only-Maker-2026",
        roles: ["admin", "issuer", "payment_maker"],
      },
    });
    const makerToken = await login(env, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026");
    await api(env, "POST", "/api/admin/users", {
      token: makerToken,
      json: {
        name: "韩砺",
        email: "checker@guoxie.chang2.ccwu.cc",
        designatedEmail: "checker@guoxie.chang2.ccwu.cc",
        phone: "13800001002",
        password: "Test-only-Checker-2026",
        roles: ["acceptor", "payment_checker"],
      },
    });
    const checkerToken = await login(env, "checker@guoxie.chang2.ccwu.cc", "Test-only-Checker-2026");
    const collaborator = await registerReady(env, "collaborator", "collaborator@guoxie.chang2.ccwu.cc", "310101198811112345");
    const service = await api(env, "POST", "/api/service-contracts", {
      token: makerToken,
      json: { personId: collaborator.id, silentConfirmAgreed: true, silentConfirmDays: 3 },
    });
    expect(service.status).toBe(201);
    const withoutBox = await api(env, "POST", `/api/mock/esign/${(service.data as { providerContractId: string }).providerContractId}/complete`, {
      token: collaborator.token,
      json: { silentAcknowledged: false },
    });
    expect(withoutBox.status).toBe(400);
    const signed = await api(env, "POST", `/api/mock/esign/${(service.data as { providerContractId: string }).providerContractId}/complete`, {
      token: collaborator.token,
      json: { silentAcknowledged: true },
    });
    expect(signed.status).toBe(200);
    const task = await api(env, "POST", "/api/collaborator-tasks", {
      token: makerToken,
      json: {
        personId: collaborator.id,
        title: "视觉设计",
        whatToDo: "完成首页视觉，不含开发",
        whatToDeliver: "源文件",
        howPaid: "固定总价，按验收成果结算",
        whenSettles: "确认后十个工作日",
        amountCents: 3600000,
      },
    });
    const form = new FormData();
    form.set("note", "交付源文件");
    form.set("file", new File(["设计"], "design.txt", { type: "text/plain" }));
    await api(env, "POST", `/api/tasks/${task.data.id}/deliverables`, { token: collaborator.token, form });
    await api(env, "POST", `/api/tasks/${task.data.id}/acceptance`, {
      token: checkerToken,
      json: { decision: "accepted", reason: "源文件齐全。" },
    });
    const fee = new FormData();
    fee.set("taskId", String(task.data.id));
    fee.set("amountCents", "3600000");
    fee.set("periodLabel", "官网任务");
    fee.set("note", "服务费");
    fee.set("file", new File(["服务费核算单"], "fee.txt", { type: "text/plain" }));
    const statement = await api(env, "POST", "/api/service-fees", { token: makerToken, form: fee });
    expect(statement.status).toBe(201);
    await api(env, "POST", `/api/statements/${statement.data.id}/send`, { token: makerToken });
    sqlite.prepare("update email_confirmations set silence_deadline_at = '2000-01-01T00:00:00.000Z'").run();
    const cron = await api(env, "POST", "/api/internal/cron");
    expect(cron.status).toBe(200);
    expect(cron.data.silenced).toBe(1);
    const after = sqlite.prepare("select s.status as status, e.confirm_method as confirm_method from statements s join email_confirmations e on e.statement_id = s.id").get() as { status: string; confirm_method: string };
    expect(after.status).toBe("confirmed");
    expect(after.confirm_method).toBe("silence");

    sqlite.prepare("update email_confirmations set silence_allowed = 0, status = 'sent', confirm_method = null").run();
    sqlite.prepare("update statements set status = 'sent'").run();
    expect(() => sqlite.prepare("update email_confirmations set confirm_method = 'silence', status = 'confirmed'").run()).toThrow(/沉默/);
  });

  it("种子数据走完两类人员的签署、履约、确认、双人付款和终止", async () => {
    const { env, sqlite } = setup();
    const seeded = await seedDatabase(env);
    expect(seeded.seeded).toBe(true);
    const maker = await login(env, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026");
    const employees = await api(env, "GET", "/api/employees", { token: maker });
    const rows = employees.data as unknown as Array<{ name: string; status: string }>;
    expect(rows.map((row) => row.name).sort()).toEqual(["何牧", "林晓雯"]);
    expect(rows.find((row) => row.name === "何牧")?.status).toBe("disabled");
    const collaborators = await api(env, "GET", "/api/collaborators", { token: maker });
    const partners = collaborators.data as unknown as Array<{ name: string; status: string }>;
    expect(partners).toHaveLength(1);
    expect(partners[0]?.name).toBe("周启明");
    expect(partners[0]?.status).toBe("active");
    const wage = sqlite.prepare("select count(*) as n from statements where statement_kind = 'wage_slip'").get() as { n: number };
    const fees = sqlite.prepare("select count(*) as n from statements where statement_kind = 'service_fee'").get() as { n: number };
    expect(Number(wage.n)).toBeGreaterThan(0);
    expect(Number(fees.n)).toBeGreaterThan(0);
    const mixed = sqlite.prepare(
      "select count(*) as n from statements where (person_kind = 'employee' and statement_kind != 'wage_slip') or (person_kind = 'collaborator' and statement_kind != 'service_fee')",
    ).get() as { n: number };
    expect(Number(mixed.n)).toBe(0);
    const loginDead = await api(env, "POST", "/api/auth/login", { json: { email: "hemu@guoxie.chang2.ccwu.cc", password: "Test-only-Terminated-2026" } });
    expect(loginDead.status).toBe(403);
    expect(loginDead.data.error).toContain("停用");
  });
});
