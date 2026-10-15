export const STATUS_LABEL: Record<string, string> = {
  active: "在用",
  disabled: "已停用",
  none: "未认证",
  pending: "处理中",
  verified: "已核验",
  failed: "未通过",
  draft: "草稿",
  signing: "待签署",
  signed: "已签署",
  terminated: "已终止",
  open: "待交付",
  delivered: "待验收",
  rejected: "已驳回",
  accepted: "已通过",
  closed: "已关闭",
  sent: "待确认",
  confirmed: "已确认",
  objected: "已异议",
  void: "已作废",
  pending_check: "待复核",
  approved: "已复核",
  settled: "已结清",
  pending_settlement: "待结清",
  recorded: "已登记",
  submitted: "已提交",
  done: "已办结",
  access: "查阅",
  correction: "更正",
  deletion: "删除",
  complaint: "投诉",
  platform_click: "平台确认",
  email_reply: "邮件回复",
  silence: "沉默确认",
  labor: "劳动合同",
  service: "项目服务协议",
  privacy: "个人信息同意",
  platform: "平台服务协议",
  wage_slip: "工资核算单",
  service_fee: "服务费核算单",
  employee: "劳动员工",
  collaborator: "项目合作方",
  operator: "管理人员",
  offline: "线下核验",
  three_factor: "姓名、证件与手机号",
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  issuer: "发单",
  acceptor: "验收",
  payment_maker: "付款制单",
  payment_checker: "付款复核",
  privacy_officer: "个人信息",
  auditor: "审计",
};

export const ROLE_OPTIONS = Object.keys(ROLE_LABEL);

export function statusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return STATUS_LABEL[value] ?? value;
}

export function hasRole(roles: string[] | undefined, ...need: string[]): boolean {
  return Boolean(roles?.some((role) => need.includes(role)));
}
