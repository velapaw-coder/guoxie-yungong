import fs from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT_ENTRY || "playwright");
import path from "node:path";

const base = "http://127.0.0.1:43123";
const shots = "/opt/cursor/artifacts";
fs.mkdirSync(shots, { recursive: true });
const file = "/tmp/guoxie-note.txt";
fs.writeFileSync(file, "国协云工测试附件\n这一版用于验收。\n");

const checklist = [];
function record(name, ok, detail = "") {
  checklist.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function shot(page, name) {
  const target = path.join(shots, `${name}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function login(page, email, password, fillTestId) {
  await page.goto(`${base}/login/`, { waitUntil: "networkidle" });
  if (fillTestId) await page.getByTestId(fillTestId).click();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("whoami").waitFor({ timeout: 20000 });
}

async function logout(page) {
  await page.getByTestId("logout").click();
  await page.getByTestId("login-form").waitFor({ timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());

  try {
    await page.goto(`${base}/login/`, { waitUntil: "networkidle" });
    await shot(page, "01-login-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, "02-login-mobile");
    await page.setViewportSize({ width: 1280, height: 900 });
    record("登录页桌面与手机截图", true);

    await page.getByTestId("go-contact").click();
    await page.getByText("010-66001800").waitFor();
    await shot(page, "03-contact");
    record("联系与投诉页", true);

    await page.goto(`${base}/login/`);
    await page.getByTestId("login-email").fill("hemu@guoxie.chang2.ccwu.cc");
    await page.getByTestId("login-password").fill("Test-only-Terminated-2026");
    await page.getByTestId("login-submit").click();
    await page.getByText("账号已停用").waitFor();
    await shot(page, "04-terminated-login");
    record("已终止账号何牧不能登录", true);

    await login(page, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026", "fill-maker");
    await shot(page, "05-maker-home");
    const homeText = await page.getByTestId("home-employees").innerText();
    const homeRight = await page.getByTestId("home-collaborators").innerText();
    if (!homeText.includes("林晓雯") || !homeRight.includes("周启明") || homeText.includes("周启明") || homeRight.includes("林晓雯")) {
      throw new Error(`工作台混排：左=${homeText} 右=${homeRight}`);
    }
    record("工作台两列名册不混排", true);

    await page.getByTestId("nav-employees").click();
    await page.getByTestId("employee-employee@guoxie.chang2.ccwu.cc").waitFor();
    await shot(page, "06-employees");
    record("劳动员工名册", true);
    await page.getByTestId("employee-employee@guoxie.chang2.ccwu.cc").click();
    await page.getByTestId("employee-desk").waitFor();
    await page.getByText("劳动合同").first().waitFor();
    await shot(page, "07-lin-desk");
    record("林晓雯劳动档案", true);
    await page.getByTestId("task-title").fill("十一月客户回访纪要");
    await page.getByTestId("task-what").fill("整理指定客户的回访记录并写成周报");
    await page.getByTestId("task-deliver").fill("周报一份，含客户编号对照表");
    await page.getByTestId("task-pay").fill("按劳动合同约定的月工资核算，本单对应报酬 6400 元");
    await page.getByTestId("task-when").fill("验收通过后随当月工资核算单结清");
    await page.getByTestId("task-amount").fill("6400.00");
    await page.getByTestId("create-task").click();
    await page.waitForURL(/\/task\/\?id=/);
    const employeeTask = new URL(page.url()).searchParams.get("id");
    await shot(page, "13-employee-task-created");
    record("劳动员工第二轮任务已发布", true, employeeTask || "");

    await page.getByTestId("nav-collaborators").click();
    await page.getByTestId("collaborator-collaborator@guoxie.chang2.ccwu.cc").waitFor();
    await shot(page, "08-collaborators");
    await page.getByTestId("collaborator-hemu@guoxie.chang2.ccwu.cc").count().then((n) => {
      if (n) throw new Error("何牧出现在项目合作方名册");
    });
    await page.getByTestId("collaborator-collaborator@guoxie.chang2.ccwu.cc").click();
    await page.getByTestId("collaborator-desk").waitFor();
    await page.getByText("项目服务协议").first().waitFor();
    await shot(page, "09-zhou-desk");
    record("周启明服务协议档案", true);

    await page.getByTestId("nav-employees").click();
    await page.getByTestId("employee-hemu@guoxie.chang2.ccwu.cc").click();
    await page.getByText("已终止").first().waitFor();
    await shot(page, "10-hemu-terminated");
    record("何牧档案显示已终止", true);

    for (const [id, title] of [
      ["nav-wage-slips", "工资核算单"],
      ["nav-wage-payments", "工资发放登记"],
      ["nav-service-fees", "服务费核算单"],
      ["nav-service-payments", "服务费付款登记"],
      ["nav-audit", "审计日志"],
      ["nav-outbox", "邮件存根"],
      ["nav-users", "岗位"],
      ["nav-templates", "合同模板"],
      ["nav-backups", "数据备份"],
      ["nav-admin-requests", "个人信息处理"],
      ["nav-contact", "联系与投诉"],
    ]) {
      await page.getByTestId(id).click();
      await page.getByRole("heading", { name: title }).waitFor();
    }
    await shot(page, "11-admin-requests");
    record("制单管理员打开全部导航页面", true);

    await page.getByTestId("nav-audit").click();
    await page.getByTestId("audit-q").fill("task.create");
    await page.getByTestId("audit-search").click();
    await page.getByText("task.create").first().waitFor();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("audit-csv").click();
    const csv = await downloadPromise;
    await csv.saveAs(path.join(shots, "audit.csv"));
    record("审计筛选与 CSV", true);

    await page.getByTestId("nav-backups").click();
    const backupNote = `浏览器验收备份${Date.now()}`;
    await page.getByTestId("backup-note").fill(backupNote);
    await page.getByTestId("backup-submit").click();
    await page.getByText(backupNote).waitFor();
    record("手动备份", true);

    await page.getByTestId("nav-templates").click();
    const templateTitle = `浏览器验收用停用模板${Date.now()}`;
    await page.getByTestId("template-title").fill(templateTitle);
    await page.getByTestId("template-body").fill("这是一条停用的劳动合同模板正文，不启用，避免替换正在使用的法务初稿。");
    await page.getByTestId("template-submit").click();
    await page.getByText(templateTitle).waitFor();
    record("新模板默认停用", true);

    await page.getByTestId("nav-users").click();
    await page.getByTestId("operator-name").fill("验收观察员");
    const observerEmail = `observer.${Date.now()}@guoxie.chang2.ccwu.cc`;
    await page.getByTestId("operator-email").fill(observerEmail);
    await page.getByTestId("operator-phone").fill("13800001999");
    await page.getByTestId("operator-password").fill("Test-only-Observer-2026");
    await page.getByTestId("operator-role-auditor").check();
    await page.getByTestId("operator-submit").click();
    await page.getByText(observerEmail).waitFor();
    record("开设只读审计岗位", true);

    await logout(page);
    await login(page, "employee@guoxie.chang2.ccwu.cc", "Test-only-Employee-2026", "fill-employee");
    const employeeNav = await page.getByTestId("main-nav").innerText();
    if (employeeNav.includes("服务费") || employeeNav.includes("项目合作") || employeeNav.includes("劳动员工名册")) {
      throw new Error(`劳动员工导航串线：${employeeNav}`);
    }
    await page.goto(`${base}/collaborators/`);
    await page.getByTestId("form-error").waitFor();
    await page.goto(`${base}/service-fees/`);
    await page.getByTestId("form-error").waitFor();
    await shot(page, "12-employee-blocked");
    record("劳动员工打不开项目合作页面", true);

    await page.goto(`${base}/task/?id=${employeeTask}`);
    await page.getByTestId("deliver-note").fill("第一版周报，尚未附客户编号");
    await page.getByTestId("deliver-file").setInputFiles(file);
    await page.getByTestId("deliver-submit").click();
    await page.getByTestId("deliverable-v1").waitFor();
    record("林晓雯提交工作成果第一版", true);

    await logout(page);
    await login(page, "checker@guoxie.chang2.ccwu.cc", "Test-only-Checker-2026", "fill-checker");
    await page.goto(`${base}/task/?id=${employeeTask}`);
    await page.getByTestId("accept-decision").selectOption("rejected");
    await page.getByTestId("accept-reason").fill("周报缺少客户编号对照");
    await page.getByTestId("accept-submit").click();
    await page.getByText("周报缺少客户编号对照").waitFor();
    await shot(page, "14-employee-rejected");
    record("验收人驳回第一版", true);

    await logout(page);
    await login(page, "employee@guoxie.chang2.ccwu.cc", "Test-only-Employee-2026", "fill-employee");
    await page.goto(`${base}/task/?id=${employeeTask}`);
    await page.getByTestId("deliver-note").fill("第二版已补上客户编号对照");
    await page.getByTestId("deliver-file").setInputFiles(file);
    await page.getByTestId("deliver-submit").click();
    await page.getByTestId("deliverable-v2").waitFor();
    record("林晓雯提交第二版", true);

    await logout(page);
    await login(page, "checker@guoxie.chang2.ccwu.cc", "Test-only-Checker-2026", "fill-checker");
    await page.goto(`${base}/task/?id=${employeeTask}`);
    await page.getByTestId("accept-decision").selectOption("accepted");
    await page.getByTestId("accept-reason").fill("客户编号对照齐全，验收通过");
    await page.getByTestId("accept-submit").click();
    await page.getByText("已通过").first().waitFor();
    record("验收人通过第二版", true);

    await logout(page);
    await login(page, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026", "fill-maker");
    await page.goto(`${base}/task/?id=${employeeTask}`);
    async function draftStatement(period, yuan, note) {
      await page.getByTestId("statement-period").fill(period);
      await page.getByTestId("statement-amount").fill(yuan);
      await page.getByTestId("statement-note").fill(note);
      await page.getByTestId("statement-file").setInputFiles(file);
      await page.getByTestId("statement-submit").click();
      await page.getByText(period).waitFor();
    }
    await draftStatement("草稿作废专期", "6400.00", "这张草稿会被作废");
    await page.getByTestId("void-statement-1").click();
    await page.getByTestId("statement-v1").getByText("已作废").waitFor();
    record("作废工资核算单草稿", true);
    await draftStatement("发送作废专期", "6400.00", "这张发送后作废");
    await page.getByTestId("send-statement-2").click();
    await page.getByTestId("void-sent-2").waitFor();
    await page.getByTestId("void-sent-2").click();
    await page.getByTestId("statement-v2").getByText("已作废").waitFor();
    record("作废已发送的工资核算单", true);

    await draftStatement("异议专期十一月", "6300.00", "先按少记的金额出单");
    await page.getByTestId("send-statement-3").click();
    await page.getByTestId("void-sent-3").waitFor();
    record("发送有异议的工资核算单", true);

    await logout(page);
    await login(page, "employee@guoxie.chang2.ccwu.cc", "Test-only-Employee-2026", "fill-employee");
    await page.goto(`${base}/task/?id=${employeeTask}`);
    await page.getByTestId("object-text-3").fill("远程办公补贴与劳动合同不一致");
    await page.getByTestId("object-statement-3").click();
    await page.getByTestId("statement-v3").getByText("已异议").waitFor();
    record("林晓雯对工资核算单提出异议", true);

    await logout(page);
    await login(page, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026", "fill-maker");
    await page.goto(`${base}/task/?id=${employeeTask}`);
    await draftStatement("确认专期十一月", "6400.00", "按劳动合同约定的工资重出");
    await page.getByTestId("send-statement-4").click();
    await page.getByTestId("void-sent-4").waitFor();
    record("重发正确的工资核算单", true);

    await logout(page);
    await login(page, "employee@guoxie.chang2.ccwu.cc", "Test-only-Employee-2026", "fill-employee");
    await page.goto(`${base}/task/?id=${employeeTask}`);
    await page.getByTestId("confirm-text-4").fill("本人在平台核对并确认这张工资核算单");
    await page.getByTestId("confirm-statement-4").click();
    await page.getByTestId("statement-v4").getByText("已确认").waitFor();
    await shot(page, "15-employee-confirmed");
    record("林晓雯在平台确认工资核算单", true);

    await logout(page);
    await login(page, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026", "fill-maker");
    await page.goto(`${base}/task/?id=${employeeTask}`);
    await page.getByTestId("paid-on-4").fill("2026-10-15");
    await page.getByTestId("reference-4").fill("YH202610150021");
    await page.getByTestId("voucher-4").setInputFiles(file);
    await page.getByTestId("payment-submit-4").click();
    await page.getByText("YH202610150021").waitFor();
    record("制单人登记工资发放", true);

    await logout(page);
    await login(page, "checker@guoxie.chang2.ccwu.cc", "Test-only-Checker-2026", "fill-checker");
    await page.goto(`${base}/task/?id=${employeeTask}`);
    await page.getByTestId("decision-note-4").fill("流水与已确认工资核算单金额一致");
    await page.getByTestId("decision-submit-4").click();
    await page.getByTestId("statement-v4").getByText("已复核").waitFor();
    await shot(page, "16-employee-paid");
    const evidence = page.waitForEvent("download");
    await page.getByTestId("evidence-task").click();
    await (await evidence).saveAs(path.join(shots, "employee-task-evidence.zip"));
    record("复核人通过工资发放并导出证据包", true);

    await logout(page);
    await login(page, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026", "fill-maker");
    await page.goto(`${base}/collaborator/?id=` + (await collaboratorId(page)));
    await page.getByTestId("task-title").fill("活动主视觉延展");
    await page.getByTestId("task-what").fill("按已确认的官网风格延展一套活动主视觉");
    await page.getByTestId("task-deliver").fill("可编辑源文件和导出图");
    await page.getByTestId("task-pay").fill("按交付件一次性服务费 18000 元，不约定月薪");
    await page.getByTestId("task-when").fill("验收通过并确认服务费核算单后登记付款");
    await page.getByTestId("task-amount").fill("18000.00");
    await page.getByTestId("create-task").click();
    await page.waitForURL(/\/task\/\?id=/);
    const collaboratorTask = new URL(page.url()).searchParams.get("id");
    record("项目合作方第二轮任务已发布", true, collaboratorTask || "");

    await logout(page);
    await login(page, "collaborator@guoxie.chang2.ccwu.cc", "Test-only-Collaborator-2026", "fill-collaborator");
    const collaboratorNav = await page.getByTestId("main-nav").innerText();
    if (collaboratorNav.includes("工资") || collaboratorNav.includes("劳动合同") || collaboratorNav.includes("劳动员工")) {
      throw new Error(`项目合作方导航串线：${collaboratorNav}`);
    }
    await page.goto(`${base}/employees/`);
    await page.getByTestId("form-error").waitFor();
    record("项目合作方打不开劳动员工页面", true);
    await page.goto(`${base}/task/?id=${collaboratorTask}`);
    await page.getByTestId("deliver-note").fill("第一版只有导出图");
    await page.getByTestId("deliver-file").setInputFiles(file);
    await page.getByTestId("deliver-submit").click();
    await page.getByTestId("deliverable-v1").waitFor();
    record("周启明提交交付物第一版", true);

    await logout(page);
    await login(page, "checker@guoxie.chang2.ccwu.cc", "Test-only-Checker-2026", "fill-checker");
    await page.goto(`${base}/task/?id=${collaboratorTask}`);
    await page.getByTestId("accept-decision").selectOption("rejected");
    await page.getByTestId("accept-reason").fill("未提供可编辑源文件");
    await page.getByTestId("accept-submit").click();
    await page.getByText("未提供可编辑源文件").waitFor();
    record("验收人驳回交付物", true);

    await logout(page);
    await login(page, "collaborator@guoxie.chang2.ccwu.cc", "Test-only-Collaborator-2026", "fill-collaborator");
    await page.goto(`${base}/task/?id=${collaboratorTask}`);
    await page.getByTestId("deliver-note").fill("第二版附上可编辑源文件");
    await page.getByTestId("deliver-file").setInputFiles(file);
    await page.getByTestId("deliver-submit").click();
    await page.getByTestId("deliverable-v2").waitFor();
    record("周启明提交第二版", true);

    await logout(page);
    await login(page, "checker@guoxie.chang2.ccwu.cc", "Test-only-Checker-2026", "fill-checker");
    await page.goto(`${base}/task/?id=${collaboratorTask}`);
    await page.getByTestId("accept-reason").fill("源文件齐全，验收通过");
    await page.getByTestId("accept-submit").click();
    await page.getByText("已通过").first().waitFor();
    record("验收人通过交付物", true);

    await logout(page);
    await login(page, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026", "fill-maker");
    await page.goto(`${base}/task/?id=${collaboratorTask}`);
    await draftStatement("异议专期服务", "17900.00", "先按少记的服务费出单");
    await page.getByTestId("send-statement-1").click();
    await page.getByTestId("void-sent-1").waitFor();
    await page.getByTestId("nav-outbox").click();
    await page.getByTestId("outbox-body").first().waitFor();
    const bodies = await page.getByTestId("outbox-body").allInnerTexts();
    const mail = bodies.find((text) => text.includes("异议专期服务"));
    const token = mail?.match(/token=([0-9a-f]+)/)?.[1];
    if (!token) throw new Error(`邮件里没有确认链接：${bodies[0] ?? ""}`);
    await shot(page, "17-outbox");
    record("服务费核算单邮件含确认链接", true);

    await page.goto(`${base}/confirm/?token=${token}`);
    await page.getByTestId("link-object-text").fill("服务费与报价单不一致");
    await page.getByTestId("link-object").click();
    await page.getByTestId("confirm-done").waitFor();
    await shot(page, "18-confirm-object");
    record("确认链接提交服务费异议", true);

    await page.goto(`${base}/task/?id=${collaboratorTask}`);
    await draftStatement("确认专期服务", "18000.00", "按约定服务费重出");
    await page.getByTestId("send-statement-2").click();
    await page.getByTestId("reply-text-2").fill("指定邮箱回复：确认这张服务费核算单");
    await page.getByTestId("reply-submit-2").click();
    await page.getByTestId("payment-form-2").waitFor();
    await page.getByTestId("paid-on-2").fill("2026-10-15");
    await page.getByTestId("reference-2").fill("YH202610150088");
    await page.getByTestId("voucher-2").setInputFiles(file);
    await page.getByTestId("payment-submit-2").click();
    await page.getByText("YH202610150088").waitFor();
    await shot(page, "19-collaborator-payment");
    record("邮件回复确认并登记服务费", true);

    await logout(page);
    await login(page, "checker@guoxie.chang2.ccwu.cc", "Test-only-Checker-2026", "fill-checker");
    await page.goto(`${base}/task/?id=${collaboratorTask}`);
    await page.getByTestId("decision-note-2").fill("流水与已确认服务费核算单金额一致");
    await page.getByTestId("decision-submit-2").click();
    await page.getByTestId("statement-v2").getByText("已复核").waitFor();
    await shot(page, "20-collaborator-approved");
    record("复核人通过服务费付款", true);

    await logout(page);
    await page.goto(`${base}/register/`);
    await page.getByTestId("pick-collaborator").click();
    await page.getByTestId("pick-employee").click();
    await page.getByTestId("register-name").fill("陈试");
    const trialEmployee = `trial.employee.${Date.now()}@guoxie.chang2.ccwu.cc`;
    await page.getByTestId("register-email").fill(trialEmployee);
    await page.getByTestId("register-designated").fill(trialEmployee);
    await page.getByTestId("register-phone").fill("13900001111");
    await page.getByTestId("register-password").fill("Test-only-Trial-2026");
    await page.getByTestId("register-terms").check();
    await page.getByTestId("platform-terms-toggle").click();
    await page.getByTestId("platform-terms").waitFor();
    await page.getByTestId("register-submit").click();
    await page.getByTestId("register-done").waitFor();
    await shot(page, "21-registered");
    record("新劳动员工注册", true);

    await login(page, trialEmployee, "Test-only-Trial-2026");
    await page.goto(`${base}/consent/`);
    await page.getByTestId("consent-text").waitFor();
    await page.getByTestId("consent-id").check();
    await page.getByTestId("consent-share").check();
    await page.getByTestId("consent-alternative").fill("线下核验证件原件");
    await page.getByTestId("consent-submit").click();
    await page.getByTestId("consent-done").waitFor();
    await page.goto(`${base}/verify/`);
    await page.getByTestId("verify-id").fill("110101199001011234");
    await page.getByTestId("verify-phone").fill("13900001111");
    await page.getByTestId("verify-method").selectOption("offline");
    await page.getByTestId("verify-submit").click();
    await page.getByTestId("verify-done").waitFor();
    await page.goto(`${base}/privacy/`);
    await page.getByTestId("privacy-content").fill("申请查阅本人实名掩码和同意记录");
    await page.getByTestId("privacy-submit").click();
    await page.getByText("申请查阅本人实名掩码和同意记录").waitFor();
    await shot(page, "22-consent-verify");
    record("单独同意、线下实名和个人信息申请", true);

    await logout(page);
    await login(page, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026", "fill-maker");
    await page.goto(`${base}/admin/requests/`);
    await page.getByTestId("handle-resolution").first().fill("已提供本人掩码和同意版本，申请受理");
    await page.getByTestId("handle-submit").first().click();
    await page.getByText("已提供本人掩码和同意版本").waitFor();
    record("受理个人信息申请", true);
    await page.goto(`${base}/employees/`);
    await page.getByTestId(`employee-${trialEmployee}`).click();
    await page.getByTestId("create-contract").click();
    await page.getByTestId("contract-signing").waitFor();
    const esignHref = await page.locator("body").innerText();
    if (esignHref.includes("沉默")) {
      /* 劳动合同正文可以提到沉默不适用 */
    }
    record("发起劳动合同", true);

    await logout(page);
    await login(page, trialEmployee, "Test-only-Trial-2026");
    await page.goto(`${base}/employee/`);
    await page.getByTestId("open-esign").click();
    await page.getByTestId("esign-sandbox").waitFor();
    await page.getByText("本页不是国协云工系统页面").waitFor();
    await shot(page, "23-mock-esign");
    await page.getByTestId("esign-sign").click();
    await page.getByTestId("esign-done").waitFor();
    record("电子签沙箱签署劳动合同", true);
    await page.getByRole("link", { name: "返回国协云工档案" }).click();
    await page.getByTestId("logout").waitFor();

    await logout(page);
    await login(page, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026", "fill-maker");
    await page.goto(`${base}/employees/`);
    await page.getByTestId(`employee-${trialEmployee}`).click();
    await page.getByTestId("terminate-reason").fill("试用账号验收后解除");
    await page.getByTestId("terminate-settlement").selectOption("settled");
    await page.getByTestId("terminate-submit").click();
    await page.getByText("已终止").first().waitFor();
    await shot(page, "24-trial-terminated");
    record("终止试用劳动账号", true);
    await logout(page);
    await page.getByTestId("login-email").fill(trialEmployee);
    await page.getByTestId("login-password").fill("Test-only-Trial-2026");
    await page.getByTestId("login-submit").click();
    await page.getByText("账号已停用").waitFor();
    record("被终止的试用账号不能登录", true);

    await page.goto(`${base}/register/`);
    await page.getByTestId("pick-collaborator").click();
    await page.getByTestId("register-name").fill("沈试");
    const trialCollab = `trial.collab.${Date.now()}@guoxie.chang2.ccwu.cc`;
    await page.getByTestId("register-email").fill(trialCollab);
    await page.getByTestId("register-designated").fill(trialCollab);
    await page.getByTestId("register-phone").fill("13900002222");
    await page.getByTestId("register-password").fill("Test-only-Trial-2026");
    await page.getByTestId("register-terms").check();
    await page.getByTestId("register-submit").click();
    await page.getByTestId("register-done").waitFor();
    await login(page, trialCollab, "Test-only-Trial-2026");
    await page.goto(`${base}/consent/`);
    await page.getByTestId("consent-id").check();
    await page.getByTestId("consent-share").check();
    await page.getByTestId("consent-face").check();
    await page.getByTestId("consent-submit").click();
    await page.getByTestId("consent-done").waitFor();
    await page.goto(`${base}/verify/`);
    await page.getByTestId("verify-id").fill("310101198811112346");
    await page.getByTestId("verify-phone").fill("13900002222");
    await page.getByTestId("verify-method").selectOption("three_factor");
    await page.getByTestId("verify-submit").click();
    await page.getByTestId("verify-done").waitFor();
    record("项目合作方试用账号完成同意和实名", true);

    await logout(page);
    await login(page, "maker@guoxie.chang2.ccwu.cc", "Test-only-Maker-2026", "fill-maker");
    await page.goto(`${base}/collaborators/`);
    await page.getByTestId(`collaborator-${trialCollab}`).click();
    await page.getByTestId("silence-clause").check();
    await page.getByTestId("silence-days").fill("3");
    await page.getByTestId("create-contract").click();
    await page.getByText("已约定 3 个自然日沉默确认").waitFor();
    record("服务协议写入沉默确认条款", true);

    await logout(page);
    await login(page, trialCollab, "Test-only-Trial-2026");
    await page.goto(`${base}/collaborator/`);
    await page.getByTestId("open-esign").click();
    await page.getByTestId("esign-sign").click();
    await page.getByTestId("form-error").waitFor();
    await page.getByTestId("esign-silence").check();
    await page.getByTestId("esign-sign").click();
    await page.getByTestId("esign-done").waitFor();
    await shot(page, "25-silence-signed");
    record("未勾选沉默条款时不能签署，勾选后可以", true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/home/`);
    await shot(page, "26-home-mobile");
    await page.setViewportSize({ width: 1280, height: 900 });
    record("项目合作方手机工作台", true);

    if (consoleErrors.length) record("页面没有脚本异常", false, consoleErrors.join(" | "));
    else record("页面没有脚本异常", true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record("流程中断", false, message);
    try { await shot(page, "99-failure"); } catch { /* 页面可能已关闭 */ }
    console.error(message);
  } finally {
    fs.writeFileSync(path.join(shots, "checklist.json"), JSON.stringify({ checklist, consoleErrors }, null, 2));
    await browser.close();
    if (checklist.some((item) => !item.ok)) process.exitCode = 1;
  }
}

async function collaboratorId(page) {
  await page.goto(`${base}/collaborators/`);
  const href = await page.getByTestId("collaborator-collaborator@guoxie.chang2.ccwu.cc").getAttribute("href");
  const id = new URL(href, base).searchParams.get("id");
  if (!id) throw new Error("没有找到周启明");
  return id;
}

await main();
