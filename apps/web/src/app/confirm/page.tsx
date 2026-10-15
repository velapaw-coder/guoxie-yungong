"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ErrorNote, Field, Loading, Money, SectionTitle, StatusBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

type Preview = {
  labels: { statement: string; silence: string };
  personName: string;
  version: number;
  amountCents: number;
  periodLabel: string;
  status: string;
  sha256: string;
  silenceAllowed: boolean;
  silenceDeadlineAt: string | null;
  confirmMethod: string | null;
  confirmedAt: string | null;
  receiptText: string | null;
  objectionText: string | null;
};

function ConfirmInner() {
  const token = useSearchParams().get("token") ?? "";
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  if (token && loaded !== token) {
    setLoaded(token);
    void api<Preview>(`/api/confirm?token=${encodeURIComponent(token)}`, { token: null })
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "链接无效"));
  }

  if (!token) return <ErrorNote error="确认链接缺少令牌" />;
  if (!data && !error) return <Loading label="正在核对核算单" />;
  if (!data) return <ErrorNote error={error} />;

  return (
    <div className="grid max-w-xl gap-4" data-testid="confirm-page">
      <SectionTitle kicker="指定邮箱里的确认链接" title={data.labels.statement} />
      <p className="text-sm">
        {data.personName} · 第 {data.version} 版 · {data.periodLabel} · <Money cents={data.amountCents} />
      </p>
      <p>
        <StatusBadge value={data.status} />
      </p>
      <p className="break-all text-xs text-muted-foreground">附件 SHA-256 {data.sha256}</p>
      <p className="text-sm">{data.silenceAllowed ? `已事先约定，${data.silenceDeadlineAt ?? "期限届满"}前未回复可视为确认。` : data.labels.silence}</p>
      {data.receiptText ? <p className="text-sm">已有确认记录：{data.receiptText}</p> : null}
      {data.objectionText ? <p className="text-sm">已有异议：{data.objectionText}</p> : null}
      {data.status === "sent" ? (
        <div className="grid gap-4">
          <form className="grid gap-2" data-testid="link-confirm-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); void api("/api/confirm", { token: null, json: { token, action: "confirm", text: String(form.get("text") ?? "") } }).then(() => setDone("已确认")).catch((err: unknown) => setError(err instanceof Error ? err.message : "没有确认")).finally(() => setBusy(false)); }}>
            <Field label="确认说明">
              <Textarea name="text" data-testid="link-confirm-text" placeholder="确认" />
            </Field>
            <Button type="submit" disabled={busy} data-testid="link-confirm">确认这张核算单</Button>
          </form>
          <form className="grid gap-2" data-testid="link-object-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); void api("/api/confirm", { token: null, json: { token, action: "object", text: String(form.get("text") ?? "") } }).then(() => setDone("已记下异议")).catch((err: unknown) => setError(err instanceof Error ? err.message : "没有提交异议")).finally(() => setBusy(false)); }}>
            <Field label="异议">
              <Textarea name="text" required data-testid="link-object-text" />
            </Field>
            <Button type="submit" variant="outline" disabled={busy} data-testid="link-object">提交异议</Button>
          </form>
        </div>
      ) : null}
      <ErrorNote error={error} />
      {done ? <p data-testid="confirm-done">{done}</p> : null}
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<Loading label="正在打开确认页" />}>
      <ConfirmInner />
    </Suspense>
  );
}
