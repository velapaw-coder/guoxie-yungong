"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ChartColumnIncreasing,
  Database,
  FileSignature,
  FileText,
  FolderOpen,
  Info,
  Landmark,
  Laptop,
  Network,
  ShieldCheck,
  User,
  UserRound,
  Users,
  ClipboardCheck,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useSession } from "@/lib/session";

const nav = [
  { label: "首页", href: "#top" },
  { label: "项目大厅", href: "#audience" },
  { label: "服务中心", href: "#services" },
  { label: "合作流程", href: "#process" },
  { label: "关于我们", href: "#about" },
];

const chips = [
  { icon: ShieldCheck, label: "国企运营" },
  { icon: Laptop, label: "远程办公" },
  { icon: Users, label: "灵活合作" },
  { icon: FileText, label: "电子签约" },
  { icon: ChartColumnIncreasing, label: "全程留痕" },
];

const audience = [
  { img: "/home/aud-employee.webp", title: "远程劳动员工", text: "与国企直接建立劳动关系，完成实名认证、劳动合同线上签署与合同查询；工资、个税、社保、公积金在线下依法办理。", href: "/register/" },
  { img: "/home/aud-collaborator.webp", title: "独立项目合作者", text: "按项目合作服务合同承接任务；明确成果标准，提交交付物，依据验收结果进行服务费核算与确认。", href: "/register/" },
  { img: "/home/aud-enterprise.webp", title: "平台项目管理人员", text: "进行项目发单、交付验收、核算单发送、付款登记、权限管理与审计追溯。", href: "/login/" },
];

const services = [
  { icon: User, title: "实名认证与入驻", text: "核实个人或企业主体身份，完成实名认证后再进入签约流程。" },
  { icon: FileSignature, title: "电子合同", text: "实名认证与电子签约先行，未签署合同不进入项目流程。" },
  { icon: FolderOpen, title: "项目协作与成果验收", text: "明确做什么、交付什么、报酬怎么算、何时结算；提交交付物，验收通过或说明驳回理由。" },
  { icon: Database, title: "核算确认与付款登记", text: "线下核算后邮件发送核算单，邮件回复或平台确认；平台登记线下付款凭证并双人审批。" },
];

const steps = [
  { icon: UserRound, title: "实名认证", text: "核实个人或企业主体身份" },
  { icon: FileSignature, title: "电子签合同", text: "签署项目合作服务合同，未签署不进入项目流程" },
  { icon: FileText, title: "项目发单", text: "明确做什么、交付什么、报酬怎么算、何时结算" },
  { icon: FolderOpen, title: "提交交付", text: "上传成果文件与说明" },
  { icon: ClipboardCheck, title: "成果验收", text: "验收通过或说明驳回理由；支持补充提交" },
  { icon: BadgeCheck, title: "核算单确认", text: "线下核算后邮件发送核算单，邮件回复或平台确认" },
  { icon: Database, title: "付款登记", text: "通过银行或合规渠道线下付款，平台登记凭证并双人审批" },
  { icon: Network, title: "终止与退出", text: "关闭账号、标记合同与未结款项状态" },
];

const reasons = [
  { icon: Landmark, title: "国企自建运营", text: "由国企自建、自运营，帮助双方明确合作关系。" },
  { icon: FileText, title: "合同先行", text: "采用电子签约，合作权利义务先明确。" },
  { icon: ShieldCheck, title: "结果清晰", text: "以服务约定和交付验收作为项目服务费依据。" },
  { icon: Users, title: "操作规范", text: "发单、验收、付款审批按岗位权限分离。" },
  { icon: ChartColumnIncreasing, title: "全程可追溯", text: "关键操作留痕，相关证据资料可查询导出。" },
];

const faqs = [
  { q: "加入平台后一定是劳动关系吗？", a: "不是。平台分为国企直招劳动员工和独立项目合作者两类，依据实际关系签署不同合同。" },
  { q: "项目服务费怎么结算？", a: "按照合同与验收结果线下核算，经邮件或平台书面确认后线下支付，平台仅登记付款记录。" },
  { q: "平台提供社保、公积金挂靠服务吗？", a: "不提供此类宣传服务。直招劳动员工的社保、公积金由实际用人单位依法在线下办理。" },
];

function IconBadge({ icon: Icon, size = "lg" }: { icon: typeof User; size?: "lg" | "md" }) {
  const box = size === "lg" ? "h-14 w-14" : "h-12 w-12";
  return (
    <span className={`grid ${box} shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#e3edff] to-[#cfe0ff]`}>
      <span className="grid h-[70%] w-[70%] place-items-center rounded-full bg-gradient-to-br from-[#4d8dff] to-[#1559e0] text-white shadow-md shadow-blue-600/30">
        <Icon className="h-[55%] w-[55%]" strokeWidth={2.2} />
      </span>
    </span>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
      <h2 className="text-2xl font-bold tracking-tight text-[var(--gx-ink)] sm:text-[28px]">{title}</h2>
      {note ? <p className="text-sm text-[var(--gx-text)]">{note}</p> : null}
    </div>
  );
}

export default function HomePage() {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const joinHref = me ? "/home/" : "/register/";

  return (
    <div id="top" className="min-h-screen overflow-x-hidden bg-white text-[var(--gx-ink)]" data-testid="homepage">
      {/* 页头 */}
      <header className="sticky top-0 z-40 border-b border-[var(--gx-line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-8 lg:flex" aria-label="首页导航">
            {nav.map((item, index) => (
              <a
                key={item.label}
                href={item.href}
                className={`relative flex h-16 items-center text-[15px] ${index === 0 ? "font-medium text-[var(--gx-blue)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded after:bg-[var(--gx-blue)]" : "text-[var(--gx-ink)] hover:text-[var(--gx-blue)]"}`}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-3 lg:flex">
            <Link href={me ? "/home/" : "/login/"} className="px-2 text-sm text-[var(--gx-text)] hover:text-[var(--gx-blue)]" data-testid="home-login">
              {me ? "进入工作台" : "登录"}
            </Link>
            <Link href="/register/" className="rounded-md bg-[var(--gx-blue)] px-5 py-2 text-sm font-medium text-white shadow-sm shadow-blue-600/30 hover:bg-[var(--gx-blue-600)]" data-testid="home-register">
              立即注册
            </Link>
            <a href="#process" className="rounded-md border border-[var(--gx-blue)] px-5 py-[7px] text-sm font-medium text-[var(--gx-blue)] hover:bg-[var(--gx-blue-50)]">
              了解合作模式
            </a>
          </div>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-lg hover:bg-[var(--gx-blue-50)] lg:hidden"
            aria-label={open ? "收起菜单" : "打开菜单"}
            aria-expanded={open}
            data-testid="home-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        {open ? (
          <div className="border-t border-[var(--gx-line)] bg-white px-4 pb-4 lg:hidden">
            <nav className="grid py-2" aria-label="首页导航">
              {nav.map((item) => (
                <a key={item.label} href={item.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center border-b border-[var(--gx-line)] text-[15px]">
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Link href="/register/" className="flex min-h-11 items-center justify-center rounded-md bg-[var(--gx-blue)] text-sm font-medium text-white">
                立即注册
              </Link>
              <Link href={me ? "/home/" : "/login/"} className="flex min-h-11 items-center justify-center rounded-md border border-[var(--gx-blue)] text-sm font-medium text-[var(--gx-blue)]" data-testid="home-login-mobile">
                {me ? "进入工作台" : "登录"}
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      {/* 首屏 */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#eef4ff] via-[#f5f9ff] to-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(77,141,255,0.16),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-6 px-4 pt-8 pb-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:pt-10 lg:pb-12">
          <div className="min-w-0">
            <h1 className="text-[34px] leading-[1.25] font-extrabold tracking-tight text-[var(--gx-ink)] sm:text-5xl lg:text-[52px]">
              让工作更灵活，
              <br />
              让合作<span className="text-[var(--gx-blue)]">更规范</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-[var(--gx-text)]">
              国企运营的远程办公与灵活用工服务平台。连接专业人才与真实项目需求，以身份认证、电子签约、项目履约、验收确认和过程留痕，建立清晰可信的数字化合作流程。
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {chips.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-1.5 rounded-lg border border-[var(--gx-line)] bg-white px-2.5 py-2 text-[13px] shadow-sm">
                  <Icon className="h-4 w-4 text-[var(--gx-blue)]" />
                  {label}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href={joinHref}
                className="flex min-h-12 items-center justify-center gap-3 rounded-lg bg-[var(--gx-blue)] px-7 text-[15px] font-medium text-white shadow-lg shadow-blue-600/25 hover:bg-[var(--gx-blue-600)]"
                data-testid="hero-join"
              >
                <User className="h-5 w-5" />
                我是求职 / 合作者
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#services"
                className="flex min-h-12 items-center justify-center gap-3 rounded-lg border border-[var(--gx-blue)] bg-white px-7 text-[15px] font-medium text-[var(--gx-blue)] hover:bg-[var(--gx-blue-50)]"
              >
                <Building2 className="h-5 w-5" />
                了解企业用工服务
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
          <div className="relative min-w-0">
            <img
              src="/home/hero.webp"
              alt="远程协作、项目管理与电子合同示意图"
              className="w-full"
              style={{
                maskImage: "linear-gradient(to right, transparent, #000 16%), linear-gradient(to bottom, transparent, #000 8%, #000 85%, transparent)",
                WebkitMaskImage: "linear-gradient(to right, transparent, #000 16%), linear-gradient(to bottom, transparent, #000 8%, #000 85%, transparent)",
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
              }}
              width={1208}
              height={646}
            />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1200px] px-4 sm:px-6">
        {/* 平台服务对象 */}
        <section id="audience" className="scroll-mt-20 pt-10">
          <SectionHead title="平台服务对象" note="多方协同，构建更高效、更可信的远程合作生态" />
          <div className="grid gap-4 md:grid-cols-3">
            {audience.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="group flex min-w-0 items-stretch gap-3 overflow-hidden rounded-2xl border border-[var(--gx-line)] bg-gradient-to-br from-[#f4f8ff] to-white shadow-[var(--gx-shadow)] transition hover:-translate-y-0.5"
              >
                <img src={item.img} alt="" className="w-[38%] max-w-[140px] shrink-0 object-cover object-bottom" width={252} height={304} />
                <div className="flex min-w-0 flex-1 flex-col py-5 pr-4">
                  <h3 className="text-lg font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--gx-text)]">{item.text}</p>
                  <span className="mt-auto self-end pt-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--gx-blue)] shadow-md group-hover:bg-[var(--gx-blue)] group-hover:text-white">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* 核心服务 */}
        <section id="services" className="scroll-mt-20 pt-12">
          <SectionHead title="核心服务" note="实名认证与电子签约先行；项目任务、成果验收和结算确认均有记录" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((item) => (
              <div key={item.title} className="flex min-w-0 gap-4 rounded-2xl border border-[var(--gx-line)] bg-white p-5 shadow-[var(--gx-shadow)]">
                <IconBadge icon={item.icon} />
                <div className="min-w-0">
                  <h3 className="font-bold">{item.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--gx-text)]">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-start gap-2 text-[13px] leading-6 text-[var(--gx-text)]">
            <Info className="mt-1 h-4 w-4 shrink-0 text-[var(--gx-blue)]" />
            平台登记线下付款结果，不直接托管或经手资金。
          </p>
        </section>

        {/* 合作流程 */}
        <section id="process" className="scroll-mt-20 pt-12">
          <SectionHead title="合作流程：简单清晰，全程有据" note="从身份核验到最终结算，每一步有依据，重要文件可留存" />
          <ol className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4 lg:gap-x-4 lg:gap-y-6">
            {steps.map((step, index) => (
              <li key={step.title} className="relative flex min-w-0 items-start gap-3 rounded-2xl bg-white p-3 shadow-[var(--gx-shadow)] lg:bg-transparent lg:p-0 lg:shadow-none">
                <IconBadge icon={step.icon} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--gx-blue)]">{String(index + 1).padStart(2, "0")}</p>
                  <p className="font-bold">{step.title}</p>
                  <p className="mt-1 text-[13px] leading-5 text-[var(--gx-text)]">{step.text}</p>
                </div>
                {index % 4 !== 3 ? <ArrowRight className="absolute top-5 -right-3 hidden h-4 w-4 text-[var(--gx-blue)] lg:block" /> : null}
              </li>
            ))}
          </ol>
          <p className="mt-5 flex items-start justify-center gap-2 rounded-xl bg-[var(--gx-blue-50)] px-4 py-3 text-[13px] leading-6 text-[var(--gx-text)]">
            <Info className="mt-1 h-4 w-4 shrink-0 text-[var(--gx-blue)]" />
            以上为独立项目合作流程。劳动员工另走独立的签约与留痕流程，不采用项目验收结算工资。
          </p>
        </section>

        {/* 为什么选择国协云工 */}
        <section id="about" className="scroll-mt-20 pt-12 pb-12">
          <SectionHead title="为什么选择国协云工" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {reasons.map((item) => (
              <div key={item.title} className="flex min-w-0 gap-3 rounded-2xl border border-[var(--gx-line)] bg-white p-4 shadow-[var(--gx-shadow)]">
                <IconBadge icon={item.icon} size="md" />
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold">{item.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-5 text-[var(--gx-text)]">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 平台介绍与常见问题 */}
        <section id="faq" className="scroll-mt-20 pb-12">
          <SectionHead title="平台介绍与常见问题" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="rounded-2xl border border-[var(--gx-line)] bg-gradient-to-br from-[#f4f8ff] to-white p-6 shadow-[var(--gx-shadow)]">
              <h3 className="text-lg font-bold">平台介绍</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--gx-text)]">
                国协云工是由国企自建、自运营的远程办公灵活用工平台，服务两类人员：国企直接招用的远程劳动员工，以及依法按项目开展服务合作的独立服务者。平台帮助双方明确合作关系、规范签约、记录履约和确认结算。
              </p>
            </div>
            <div className="grid gap-3">
              {faqs.map((item) => (
                <div key={item.q} className="rounded-2xl border border-[var(--gx-line)] bg-white p-4 shadow-[var(--gx-shadow)]">
                  <p className="font-bold">
                    <span className="mr-2 text-[var(--gx-blue)]">Q</span>
                    {item.q}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-6 text-[var(--gx-text)]">
                    <span className="mr-2 font-bold text-[var(--gx-blue)]">A</span>
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* 底部号召 */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#eaf2ff] via-[#f1f6ff] to-[#dce9ff]">
        <img src="/home/skyline.webp" alt="" className="pointer-events-none absolute right-0 bottom-0 hidden h-full w-auto max-w-none md:block [mask-image:linear-gradient(to_right,transparent,black_25%)]" width={1104} height={356} />
        <div className="relative mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
          <h2 className="text-2xl font-bold sm:text-[28px]">开启更灵活、更规范的工作合作方式</h2>
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-[var(--gx-text)]">加入国协云工，了解远程工作与项目合作机会，让每一份合作有约定、有记录、有保障依据。</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href={joinHref} className="flex min-h-12 items-center justify-center gap-3 rounded-lg bg-[var(--gx-blue)] px-8 text-[15px] font-medium text-white shadow-lg shadow-blue-600/25 hover:bg-[var(--gx-blue-600)]">
              注册加入平台 <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/contact/" className="flex min-h-12 items-center justify-center gap-3 rounded-lg border border-[var(--gx-blue)] bg-white px-8 text-[15px] font-medium text-[var(--gx-blue)] hover:bg-[var(--gx-blue-50)]" data-testid="home-contact">
              联系我们 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <img src="/home/skyline.webp" alt="" className="block w-full md:hidden [mask-image:linear-gradient(to_bottom,transparent,black_30%)]" width={1104} height={356} />
      </section>

      {/* 页脚 */}
      <footer className="bg-[var(--gx-navy)] text-[13px] text-white/75" data-testid="home-footer">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
            <Logo light />
            <nav className="flex flex-wrap gap-x-6 gap-y-1 lg:border-l lg:border-white/20 lg:pl-6" aria-label="页脚链接">
              <a href="#about" className="flex min-h-11 items-center hover:text-white">关于我们</a>
              <Link href="/register/" className="flex min-h-11 items-center hover:text-white">平台协议</Link>
              <Link href="/contact/" className="flex min-h-11 items-center hover:text-white">隐私政策</Link>
              <Link href="/contact/" className="flex min-h-11 items-center hover:text-white">联系我们</Link>
              <Link href="/privacy/" className="flex min-h-11 items-center hover:text-white">投诉与个人信息申请入口</Link>
            </nav>
          </div>
          <div className="text-white/60 lg:text-right">
            <p>运营单位：【运营单位】</p>
            <p>ICP备案号：【ICP备案号】</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
