"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { Me } from "@/lib/api";
import { hasRole } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { Loading } from "./bits";

type NavItem = { href: string; label: string; testid: string };
type NavGroup = { title: string; tone: string; items: NavItem[] };

function groupsFor(me: Me): NavGroup[] {
  if (me.kind === "employee") {
    return [
      {
        title: "劳动关系",
        tone: "kind-employee",
        items: [
          { href: "/home/", label: "工作台", testid: "nav-home" },
          { href: `/employee/?id=${me.id}`, label: "我的档案", testid: "nav-my-desk" },
          { href: "/wage-slips/", label: "工资核算单", testid: "nav-wage-slips" },
          { href: "/wage-payments/", label: "工资发放登记", testid: "nav-wage-payments" },
          { href: "/consent/", label: "单独同意", testid: "nav-consent" },
          { href: "/verify/", label: "实名认证", testid: "nav-verify" },
          { href: "/privacy/", label: "个人信息申请", testid: "nav-privacy" },
          { href: "/contact/", label: "联系与投诉", testid: "nav-contact" },
        ],
      },
    ];
  }
  if (me.kind === "collaborator") {
    return [
      {
        title: "项目合作",
        tone: "kind-collaborator",
        items: [
          { href: "/home/", label: "工作台", testid: "nav-home" },
          { href: `/collaborator/?id=${me.id}`, label: "我的档案", testid: "nav-my-desk" },
          { href: "/service-fees/", label: "服务费核算单", testid: "nav-service-fees" },
          { href: "/service-payments/", label: "服务费付款登记", testid: "nav-service-payments" },
          { href: "/consent/", label: "单独同意", testid: "nav-consent" },
          { href: "/verify/", label: "实名认证", testid: "nav-verify" },
          { href: "/privacy/", label: "个人信息申请", testid: "nav-privacy" },
          { href: "/contact/", label: "联系与投诉", testid: "nav-contact" },
        ],
      },
    ];
  }
  const admin: NavItem[] = [
    { href: "/admin/audit/", label: "审计日志", testid: "nav-audit" },
    { href: "/admin/outbox/", label: "邮件存根", testid: "nav-outbox" },
  ];
  if (hasRole(me.roles, "admin")) {
    admin.push(
      { href: "/admin/users/", label: "岗位", testid: "nav-users" },
      { href: "/admin/templates/", label: "合同模板", testid: "nav-templates" },
      { href: "/admin/backups/", label: "备份", testid: "nav-backups" },
    );
  }
  if (hasRole(me.roles, "admin", "privacy_officer")) {
    admin.push({ href: "/admin/requests/", label: "个人信息处理", testid: "nav-admin-requests" });
  }
  return [
    {
      title: "劳动关系",
      tone: "kind-employee",
      items: [
        { href: "/employees/", label: "劳动员工", testid: "nav-employees" },
        { href: "/wage-slips/", label: "工资核算单", testid: "nav-wage-slips" },
        { href: "/wage-payments/", label: "工资发放登记", testid: "nav-wage-payments" },
      ],
    },
    {
      title: "项目合作",
      tone: "kind-collaborator",
      items: [
        { href: "/collaborators/", label: "项目合作方", testid: "nav-collaborators" },
        { href: "/service-fees/", label: "服务费核算单", testid: "nav-service-fees" },
        { href: "/service-payments/", label: "服务费付款登记", testid: "nav-service-payments" },
      ],
    },
    {
      title: "平台管理",
      tone: "",
      items: [{ href: "/home/", label: "工作台", testid: "nav-home" }, { href: "/contact/", label: "联系与投诉", testid: "nav-contact" }, ...admin],
    },
  ];
}

function isPublic(pathname: string) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return path === "/" || path.startsWith("/register") || path.startsWith("/confirm") || path.startsWith("/contact");
}

function isSandbox(pathname: string) {
  return pathname.startsWith("/mock-esign");
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { me, logout } = useSession();
  const pub = isPublic(pathname);
  const sandbox = isSandbox(pathname);

  useEffect(() => {
    if (!pub && me === null) router.replace("/");
  }, [pub, sandbox, me, router]);

  if (sandbox) {
    return (
      <div className="min-h-screen bg-[#e7eef2] text-[#1c2b33]">
        <header className="border-b border-[#9bb0bd] bg-[#12323f] px-4 py-3 text-[#f4f7f8]">
          <p className="text-xs tracking-[0.16em]">电子签服务商沙箱（模拟）</p>
          <p className="text-sm">本页不是国协云工系统页面。签署结果由模拟服务商回传。</p>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </div>
    );
  }

  if (!pub && me === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Loading label="正在核对登录状态" />
      </div>
    );
  }

  if (!pub && !me) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link href={me ? "/home/" : "/"} className="flex items-center gap-3">
            <span className="seal text-xs">国协</span>
            <span>
              <span className="block text-lg font-semibold leading-none">国协云工</span>
              <span className="text-xs text-muted-foreground">国协云工集团有限公司 · 劳动与项目合作分开办理</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            {me ? (
              <>
                <span data-testid="whoami">
                  {me.name}
                  <span className="text-muted-foreground"> · {me.kind === "employee" ? "劳动员工" : me.kind === "collaborator" ? "项目合作方" : "管理人员"}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="logout"
                  onClick={() => {
                    void logout().then(() => router.replace("/"));
                  }}
                >
                  退出
                </Button>
              </>
            ) : (
              <Link href="/" className="underline-offset-4 hover:underline">
                登录
              </Link>
            )}
          </div>
        </div>
        {me ? (
          <nav className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pb-4 md:flex-row" data-testid="main-nav">
            {groupsFor(me).map((group) => (
              <div key={group.title} className={`min-w-0 flex-1 rounded-xl bg-background px-3 py-2 ${group.tone}`}>
                <p className="mb-1 text-xs text-muted-foreground">{group.title}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {group.items.map((item) => (
                    <Link key={item.testid} href={item.href} data-testid={item.testid} className="text-sm underline-offset-4 hover:underline">
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted-foreground">
        投诉电话 010-66001800 · privacy@guoxie.chang2.ccwu.cc · 合同文本为法务初稿 V0.1，未经法务审核，不得对外使用。本平台不计算工资、个税、社保、公积金，也不划转资金。
      </footer>
    </div>
  );
}
