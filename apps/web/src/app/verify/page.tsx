"use client";

import { useState } from "react";
import { ErrorNote, Field, SectionTitle } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { Loading } from "@/components/bits";
import { useSession } from "@/lib/session";

export default function VerifyPage() {
  const { me, refresh } = useSession();
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  if (!me) return <Loading />;
  if (me.kind === "operator") return <ErrorNote error="管理人员不进行用工实名" />;

  return (
    <div className="grid max-w-xl gap-4">
      <SectionTitle title="实名认证" kicker="模拟核验 · 不保存证件原图" />
      <p className="text-sm text-muted-foreground">
        当前服务商是 mock-identity。姓名必须与账号一致（{me.name}）。未单独同意人脸时，只能选线下核验。未满十六周岁不能登记。
      </p>
      <form
        className="grid gap-3"
        data-testid="verify-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          void api<{ status: string }>("/api/identity", {
            json: {
              legalName: String(form.get("legalName") ?? ""),
              idNumber: String(form.get("idNumber") ?? ""),
              phone: String(form.get("phone") ?? ""),
              method: String(form.get("method") ?? ""),
            },
          })
            .then(async (result) => {
              setDone(result.status);
              await refresh();
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "核验没有完成"))
            .finally(() => setBusy(false));
        }}
      >
        <Field label="姓名">
          <Input name="legalName" required defaultValue={me.name} data-testid="verify-name" />
        </Field>
        <Field label="身份证号">
          <Input name="idNumber" required data-testid="verify-id" autoComplete="off" />
        </Field>
        <Field label="手机号">
          <Input name="phone" required defaultValue={me.phone ?? ""} data-testid="verify-phone" />
        </Field>
        <Field label="核验方式">
          <select name="method" className="h-8 rounded-lg border bg-transparent px-2 text-sm" data-testid="verify-method" defaultValue="offline">
            <option value="offline">线下核验</option>
            <option value="three_factor">姓名、证件与手机号</option>
          </select>
        </Field>
        <Button type="submit" disabled={busy} data-testid="verify-submit">提交核验</Button>
        <ErrorNote error={error} />
        {done ? <p data-testid="verify-done">核验结果：{done === "verified" ? "已通过" : done}</p> : null}
      </form>
    </div>
  );
}
