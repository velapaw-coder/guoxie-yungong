"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Me } from "@/lib/api";
import { hasRole } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { Loading } from "./bits";
import { Logo } from "./logo";

type NavItem = { href: string; label: string; testid: string };
type NavGroup = { title: string; tone: string; items: NavItem[] };

function groupsFor(me: Me): NavGroup[] {
  const home: NavGroup = { title: "工作台", tone: "", items: [{ href: "/home/", label: "工作台", testid: "nav-home" }] };
  if (me.kind === "employee" || me.kind === "collaborator") {
    const employee = me.kind === "employee";
    return [
      home,
      { title: "人员", tone: "", items: [{ href: `/${employee ? "employee" : "collaborator"}/?id=${me.id}`, label: "我的档案与任务", testid: "nav-my-desk" }] },
      { title: "结算/核算单", tone: "", items: [employee ? { href: "/wage-slips/", label: "工资核算单", testid: "nav-wage-slips" } : { href: "/service-fees/", label: "服务费核算单", testid: "nav-service-fees" }] },
      { title: "付款", tone: "", items: [employee ? { href: "/wage-payments/", label: "工资发放登记", testid: "nav-wage-payments" } : { href: "/service-payments/", label: "服务费付款登记", testid: "nav-service-payments" }] },
      {
        title: "合规与留痕",
        tone: "",
        items: [
          { href: "/consent/", label: "单独同意", testid: "nav-consent" },
          { href: "/verify/", label: "实名认证", testid: "nav-verify" },
          { href: "/privacy/", label: "个人信息申请", testid: "nav-privacy" },
          { href: "/contact/", label: "联系与投诉", testid: "nav-contact" },
        ],
      },
    ];
  }
  const compliance: NavItem[] = [
    { href: "/admin/audit/", label: "审计日志与证据", testid: "nav-audit" },
    { href: "/admin/outbox/", label: "发件记录", testid: "nav-outbox" },
  ];
  if (hasRole(me.roles, "admin", "privacy_officer")) {
    compliance.push({ href: "/admin/requests/", label: "个人信息申请", testid: "nav-admin-requests" });
  }
  compliance.push({ href: "/contact/", label: "联系与投诉", testid: "nav-contact" });
  const groups: NavGroup[] = [
    home,
    {
      title: "人员",
      tone: "",
      items: [
        { href: "/employees/", label: "劳动员工", testid: "nav-employees" },
        { href: "/collaborators/", label: "项目合作方", testid: "nav-collaborators" },
      ],
    },
    {
      title: "结算/核算单",
      tone: "",
      items: [
        { href: "/wage-slips/", label: "工资核算单", testid: "nav-wage-slips" },
        { href: "/service-fees/", label: "服务费核算单", testid: "nav-service-fees" },
      ],
    },
    {
      title: "付款",
      tone: "",
      items: [
        { href: "/wage-payments/", label: "工资发放登记", testid: "nav-wage-payments" },
        { href: "/service-payments/", label: "服务费付款登记", testid: "nav-service-payments" },
      ],
    },
    { title: "合规与留痕", tone: "", items: compliance },
  ];
  if (hasRole(me.roles, "admin")) {
    groups.push({
      title: "系统",
      tone: "",
      items: [
        { href: "/admin/users/", label: "账号岗位", testid: "nav-users" },
        { href: "/admin/templates/", label: "合同模板", testid: "nav-templates" },
        { href: "/admin/backups/", label: "备份", testid: "nav-backups" },
      ],
    });
  }
  return groups;
}

const PAGE_TITLES: Record<string, string> = {
  "/employee/": "人员档案",
  "/collaborator/": "人员档案",
  "/task/": "任务详情",
};

function isPublic(pathname: string) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return path === "/" || path.startsWith("/login") || path.startsWith("/register") || path.startsWith("/confirm") || path.startsWith("/contact");
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!pub && me === null) router.replace("/login/");
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

  // 首页自带整页版式（页头、页脚），不套系统外框。
  if (pathname === "/" || pathname === "") return <>{children}</>;

  const groups = me ? groupsFor(me) : [];
  const roleLabel = me ? (me.kind === "employee" ? "劳动员工" : me.kind === "collaborator" ? "项目合作方" : "管理人员") : "";
  const current = `${pathname}`.replace(/\/?$/, "/");
  const activeGroup = groups.find((group) => group.items.some((item) => item.href.split("?")[0] === current));
  const activeItem = activeGroup?.items.find((item) => item.href.split("?")[0] === current);
  const pageTitle = activeItem?.label ?? PAGE_TITLES[current] ?? "国协云工";
  const footerNote = (
    <footer className="pb-8 text-xs leading-5 text-muted-foreground">
      投诉电话 010-66001800 · privacy@guoxie.chang2.ccwu.cc · 合同文本为法务初稿 V0.1，未经法务审核，不得对外使用。本平台不计算工资、个税、社保、公积金，也不划转资金。
    </footer>
  );

  // 未登录的公开页（登录、注册、联系、确认链接）：简洁页头。
  if (!me) {
    return (
      <div className="min-h-screen bg-[var(--gx-bg)]">
        <header className="sticky top-0 z-30 border-b border-[var(--gx-line)] bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
            <Logo href="/" />
            <div className="flex items-center gap-2 text-sm">
              <Link href="/" className="hidden min-h-11 items-center px-2 text-[var(--gx-text)] hover:text-[var(--gx-blue)] sm:inline-flex">
                首页
              </Link>
              <Button asChild>
                <Link href="/login/" data-testid="header-login">
                  登录
                </Link>
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto flex max-w-6xl min-w-0 flex-col gap-6 px-4 py-6">{children}</main>
        <div className="mx-auto max-w-6xl px-4">{footerNote}</div>
      </div>
    );
  }

  const userBlock = (
    <div className="flex items-center justify-between gap-2 border-t border-[var(--gx-line)] px-2 pt-3">
      <span data-testid="whoami" className="min-w-0 truncate text-sm">
        <span className="block truncate font-medium text-[var(--gx-ink)]">{me.name}</span>
        <span className="block text-xs text-muted-foreground">{roleLabel}</span>
      </span>
      <Button
        type="button"
        variant="outline"
        data-testid="logout"
        onClick={() => {
          void logout().then(() => router.replace("/login/"));
        }}
      >
        退出
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--gx-bg)]">
      {/* 左侧固定导航；窄屏为抽屉 */}
      {menuOpen ? <button type="button" aria-label="关闭菜单" className="fixed inset-0 z-30 bg-[#0f1d3a]/40 lg:hidden" onClick={() => setMenuOpen(false)} /> : null}
      <aside
        className={`${menuOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[var(--gx-line)] bg-white transition-transform lg:translate-x-0`}
        data-testid="main-nav"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--gx-line)] px-4">
          <Logo href="/home/" />
          <button type="button" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-[var(--gx-blue-50)] lg:hidden" aria-label="收起菜单" onClick={() => setMenuOpen(false)}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="功能导航">
          {groups.map((group) => (
            <div key={group.title} className="mb-4">
              {group.title !== "工作台" ? <p className="mb-1 px-3 text-xs font-medium tracking-wider text-muted-foreground">{group.title}</p> : null}
              <div className="grid gap-0.5">
                {group.items.map((item) => {
                  const active = activeItem?.testid === item.testid;
                  return (
                    <Link
                      key={item.testid}
                      href={item.href}
                      data-testid={item.testid}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={`relative flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors lg:min-h-10 ${active ? "bg-[var(--gx-blue-50)] font-medium text-[var(--gx-blue)] before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-[var(--gx-blue)]" : "text-[var(--gx-text)] hover:bg-[var(--gx-blue-50)] hover:text-[var(--gx-blue)]"}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="shrink-0 px-3 pb-4">{userBlock}</div>
      </aside>

      {/* 右侧内容区 */}
      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-[var(--gx-line)] bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
            <button
              type="button"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--gx-ink)] hover:bg-[var(--gx-blue-50)] lg:hidden"
              aria-label="打开菜单"
              aria-expanded={menuOpen}
              data-testid="menu-toggle"
              onClick={() => setMenuOpen(true)}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
            <div className="min-w-0 flex-1">
              <nav aria-label="面包屑" className="truncate text-xs text-muted-foreground">
                <Link href="/home/" className="hover:text-[var(--gx-blue)]">国协云工</Link>
                {activeGroup && activeGroup.title !== "工作台" ? <span> / {activeGroup.title}</span> : null}
                {pageTitle !== "国协云工" ? <span> / {pageTitle}</span> : null}
              </nav>
              <p className="truncate text-base font-semibold text-[var(--gx-ink)]" data-testid="page-title">{pageTitle}</p>
            </div>
            <span className="hidden text-sm text-muted-foreground md:inline">
              {me.name} · {roleLabel}
            </span>
          </div>
        </header>
        <main className="mx-auto flex max-w-6xl min-w-0 flex-col gap-6 px-4 py-6 lg:px-8">{children}</main>
        <div className="mx-auto max-w-6xl px-4 lg:px-8">{footerNote}</div>
      </div>
    </div>
  );
}
