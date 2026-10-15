"use client";

import { useState } from "react";
import { Empty, ErrorNote, Loading, SectionTitle } from "@/components/bits";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type Mail = { id: string; to_email: string; subject: string; body: string; message_id: string; attachment_sha256: string | null; status: string; sent_at: string; provider: string };

export default function OutboxPage() {
  const { me } = useSession();
  const [rows, setRows] = useState<Mail[] | null>(null);
  const [error, setError] = useState("");
  const [booted, setBooted] = useState(false);
  if (me && !booted) {
    setBooted(true);
    void api<Mail[]>("/api/admin/outbox").then(setRows).catch((err: unknown) => setError(err instanceof Error ? err.message : "发件箱没有打开"));
  }
  if (!me) return <Loading />;
  return (
    <div className="grid gap-4" data-testid="outbox-page">
      <SectionTitle title="邮件存根" kicker="模拟发信 · 没有真正投递" />
      <p className="text-sm text-muted-foreground">确认链接写在正文里。正式环境改接企业邮箱，页面结构不变。</p>
      {error ? <ErrorNote error={error} /> : null}
      {!rows ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty>还没有发出的邮件</Empty> : null}
      <ul className="grid gap-3">
        {rows?.map((row) => (
          <li key={row.id} className="rounded-lg border p-3 text-sm" data-testid="outbox-item">
            <p className="font-medium">{row.subject}</p>
            <p className="text-muted-foreground">{row.to_email} · {row.sent_at} · {row.provider}</p>
            <pre className="mt-2 whitespace-pre-wrap text-xs" data-testid="outbox-body">{row.body}</pre>
          </li>
        ))}
      </ul>
    </div>
  );
}
