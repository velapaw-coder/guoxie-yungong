import Link from "next/link";

/** 国协云工标志：蓝色云形图标 + 字标。首页与系统页共用。 */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="gx-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4d8dff" />
          <stop offset="1" stopColor="#1559e0" />
        </linearGradient>
      </defs>
      <path
        d="M14 38h22a10 10 0 0 0 1.6-19.87A13 13 0 0 0 12.4 20.6 8.75 8.75 0 0 0 14 38Z"
        fill="none"
        stroke="url(#gx-logo)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M17 31.5c3-4.5 6.5-6.5 11.5-6.5" fill="none" stroke="url(#gx-logo)" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="flex min-h-11 shrink-0 items-center gap-2" aria-label="国协云工首页">
      <LogoMark />
      <span className={`text-xl font-bold tracking-wide ${light ? "text-white" : "text-[var(--gx-ink)]"}`}>国协云工</span>
    </Link>
  );
}
