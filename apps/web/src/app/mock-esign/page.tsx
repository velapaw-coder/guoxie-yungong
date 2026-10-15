"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ErrorNote, Loading } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type Contract = {
  id: string;
  title: string;
  body: string;
  status: string;
  silentConfirmAgreed: boolean;
  silentConfirmDays: number | null;
  personKind: "employee" | "collaborator";
  evidenceNo: string | null;
};

function Sandbox() {
  const ref = useSearchParams().get("ref") ?? "";
  const { me } = useSession();
  const [data, setData] = useState<Contract | null>(null);
  const [error, setError] = useState("");
  const [seen, setSeen] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  if (me && ref && seen !== ref) {
    setSeen(ref);
    void api<Contract>(`/api/mock/esign/${encodeURIComponent(ref)}`)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "签署链接无效"));
  }

  if (!me) return <Loading label="正在核对签署人" />;
  if (!ref) return <ErrorNote error="缺少服务商合同编号" />;
  if (!data && !error) return <Loading label="正在向沙箱读取合同" />;
  if (!data) return <ErrorNote error={error} />;

  return (
    <div className="grid gap-4 rounded-xl border border-[#9bb0bd] bg-white p-4" data-testid="esign-sandbox">
      <p className="text-xs uppercase tracking-[0.18em] text-[#3e6172]">Mock E-sign · {ref}</p>
      <h1 className="text-xl font-semibold">{data.title}</h1>
      <p className="text-sm text-[#3e6172]">签署人需与合同相对人一致。国协云工只接收回传，不在本页生成签名。</p>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap border border-[#d5e0e6] bg-[#f7fafb] p-3 text-xs" data-testid="esign-body">{data.body}</pre>
      {data.status === "signed" ? <p data-testid="esign-done">这份合同已经签署。存证编号 {data.evidenceNo}</p> : null}
      {data.status === "signing" ? (
        <form
          className="grid gap-3"
          data-testid="esign-form"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            void api(`/api/mock/esign/${encodeURIComponent(ref)}/complete`, { json: { silentAcknowledged: ack } })
              .then(() => setDone("沙箱已回传签署结果"))
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "签署没有完成"))
              .finally(() => setBusy(false));
          }}
        >
          {data.silentConfirmAgreed ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} data-testid="esign-silence" className="mt-1" />
              <span>我单独确认：服务费核算单发出后 {data.silentConfirmDays} 个自然日内未回复，可按协议视为确认。不勾选则本次不能完成签署。</span>
            </label>
          ) : (
            <p className="text-sm">本合同没有沉默确认条款。未回复不视为确认。</p>
          )}
          <Button type="submit" disabled={busy} data-testid="esign-sign" className="bg-[#12323f] text-white">
            在沙箱完成签署
          </Button>
          <ErrorNote error={error} />
          {done ? <p data-testid="esign-done">{done}</p> : null}
        </form>
      ) : null}
      <Link href={data.personKind === "employee" ? "/employee/" : "/collaborator/"} className="text-sm text-[#12323f] underline">
        返回国协云工档案
      </Link>
    </div>
  );
}

export default function MockEsignPage() {
  return (
    <Suspense fallback={<Loading label="正在打开电子签沙箱" />}>
      <Sandbox />
    </Suspense>
  );
}
