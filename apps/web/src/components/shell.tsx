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

  return (
    <div className="min-h-screen bg-[var(--gx-bg)]">
      <header className="sticky top-0 z-30 border-b border-[var(--gx-line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            {me ? (
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-lg text-[var(--gx-ink)] hover:bg-[var(--gx-blue-50)] lg:hidden"
                aria-label={menuOpen ? "收起菜单" : "打开菜单"}
                aria-expanded={menuOpen}
                data-testid="menu-toggle"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
                </svg>
              </button>
            ) : null}
            <Logo href={me ? "/home/" : "/"} />
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            {me ? (
              <>
                <span data-testid="whoami" className="hidden min-w-0 truncate sm:inline">
                  <span className="font-medium">{me.name}</span>
                  <span className="text-muted-foreground"> · {roleLabel}</span>
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
              </>
            ) : (
              <>
                <Link href="/" className="hidden min-h-11 items-center px-2 text-[var(--gx-text)] hover:text-[var(--gx-blue)] sm:inline-flex">
                  首页
                </Link>
                <Button asChild>
                  <Link href="/login/" data-testid="header-login">
                    登录
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4">
        {me ? (
          <nav
            className={`${menuOpen ? "block" : "hidden"} fixed inset-x-0 top-16 bottom-0 z-20 overflow-y-auto bg-white px-4 py-4 lg:sticky lg:top-20 lg:block lg:h-[calc(100vh-6rem)] lg:w-60 lg:shrink-0 lg:rounded-2xl lg:border lg:border-[var(--gx-line)] lg:bg-white lg:px-3 lg:shadow-[var(--gx-shadow)] lg:my-4`}
            data-testid="main-nav"
          >
            <p className="mb-3 px-2 text-sm sm:hidden">
              <span className="font-medium">{me.name}</span>
              <span className="text-muted-foreground"> · {roleLabel}</span>
            </p>
            {groups.map((group) => (
              <div key={group.title} className="mb-4">
                <p className="mb-1 px-3 text-xs font-medium tracking-wider text-muted-foreground">{group.title}</p>
                <div className="grid gap-0.5">
                  {group.items.map((item) => {
                    const active = current === item.href.split("?")[0] && !(item.href.includes("?") && pathname === "/home/");
                    return (
                      <Link
                        key={item.testid}
                        href={item.href}
                        data-testid={item.testid}
                        onClick={() => setMenuOpen(false)}
                        className={`flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors lg:min-h-10 ${active ? "bg-[var(--gx-blue-50)] font-medium text-[var(--gx-blue)]" : "text-[var(--gx-text)] hover:bg-[var(--gx-blue-50)] hover:text-[var(--gx-blue)]"}`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        ) : null}
        <div className="min-w-0 flex-1">
          <main className="mx-auto flex max-w-6xl min-w-0 flex-col gap-6 py-6">{children}</main>
          <footer className="mx-auto max-w-6xl pb-8 text-xs leading-5 text-muted-foreground">
            投诉电话 010-66001800 · privacy@guoxie.chang2.ccwu.cc · 合同文本为法务初稿 V0.1，未经法务审核，不得对外使用。本平台不计算工资、个税、社保、公积金，也不划转资金。
          </footer>
        </div>
      </div>
    </div>
  );
}
