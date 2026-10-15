export const PLATFORM_NAME = "国协云工";
export const ENTERPRISE_NAME = "国协云工集团有限公司";
export const CONSENT_VERSION = "PIPL-2026-10-15";
export const PUBLIC_ORIGIN = "https://guoxie.chang2.ccwu.cc";

export type PersonKind = "employee" | "collaborator";
export type UserKind = "operator" | PersonKind;

export type KindCopy = {
  kind: PersonKind;
  person: string;
  relationship: string;
  contract: string;
  task: string;
  deliverable: string;
  statement: string;
  payment: string;
  money: string;
  party: string;
  silence: string;
  howPaidHint: string;
  listPath: string;
  detailPath: string;
  statementPath: string;
  paymentPath: string;
};

export const COPY: Record<PersonKind, KindCopy> = {
  employee: {
    kind: "employee",
    person: "劳动员工",
    relationship: "劳动关系",
    contract: "劳动合同",
    task: "工作任务",
    deliverable: "工作成果",
    statement: "工资核算单",
    payment: "工资发放登记",
    money: "工资金额",
    party: "劳动者",
    silence: "未回复不视为确认。劳动报酬不因沉默而放弃。",
    howPaidHint: "填写劳动合同约定的工资构成。本平台不计算工资、个税、社保或公积金。",
    listPath: "/employees/",
    detailPath: "/employee/",
    statementPath: "/wage-slips/",
    paymentPath: "/wage-payments/",
  },
  collaborator: {
    kind: "collaborator",
    person: "项目合作方",
    relationship: "民事服务关系",
    contract: "项目服务协议",
    task: "项目任务单",
    deliverable: "交付物",
    statement: "服务费核算单",
    payment: "服务费付款登记",
    money: "服务费",
    party: "服务提供者",
    silence: "只有服务协议里事先勾选同意，逾期未回复才可以视为确认。",
    howPaidHint: "填写计费方式、单价和总额。本平台只登记服务费，不划转资金。",
    listPath: "/collaborators/",
    detailPath: "/collaborator/",
    statementPath: "/service-fees/",
    paymentPath: "/service-payments/",
  },
};

export const TEST_ACCOUNTS = [
  {
    key: "maker",
    role: "制单管理员",
    name: "梁淑敏",
    email: "maker@guoxie.chang2.ccwu.cc",
    password: "Test-only-Maker-2026",
    duties: "发单、上传核算单、登记付款",
  },
  {
    key: "checker",
    role: "复核管理员",
    name: "韩砺",
    email: "checker@guoxie.chang2.ccwu.cc",
    password: "Test-only-Checker-2026",
    duties: "验收、复核付款",
  },
  {
    key: "employee",
    role: "劳动员工",
    name: "林晓雯",
    email: "employee@guoxie.chang2.ccwu.cc",
    password: "Test-only-Employee-2026",
    duties: "签署劳动合同、提交工作成果、确认工资核算单",
  },
  {
    key: "collaborator",
    role: "项目合作方",
    name: "周启明",
    email: "collaborator@guoxie.chang2.ccwu.cc",
    password: "Test-only-Collaborator-2026",
    duties: "签署服务协议、提交交付物、确认服务费核算单",
  },
] as const;

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const yuan = Math.floor(abs / 100).toLocaleString("zh-CN");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${yuan}.${frac}`;
}

export function yuanToCents(input: string): number | null {
  const text = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [yuan, frac = ""] = text.split(".");
  if (yuan.length > 9) return null;
  return Number(yuan) * 100 + Number((frac + "00").slice(0, 2));
}

export function kindFromStatement(kind: string): PersonKind | null {
  if (kind === "wage_slip") return "employee";
  if (kind === "service_fee") return "collaborator";
  return null;
}
