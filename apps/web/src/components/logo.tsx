import Link from "next/link";

/** 国协云工官方标志（透明底，/public/logo-128.png）。首页、登录注册与系统页共用。 */
export function LogoMark({ className = "h-9 w-auto" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo-128.png" alt="" width={210} height={128} className={className} />;
}

export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="flex min-h-11 shrink-0 items-center gap-2" aria-label="国协云工首页">
      <LogoMark />
      <span className={`text-xl font-bold tracking-wide ${light ? "text-white" : "text-[var(--gx-ink)]"}`}>国协云工</span>
    </Link>
  );
}
