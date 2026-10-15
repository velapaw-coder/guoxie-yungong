"use client";

import { useState } from "react";
import { CONSENT_VERSION } from "@domain";
import { ErrorNote, Field, Loading, SectionTitle } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function ConsentPage() {
  const { me } = useSession();
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [face, setFace] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  if (me && me.kind !== "operator" && !loaded) {
    setLoaded(true);
    void api<{ consentText: string }>("/api/meta", { token: null }).then((meta) => setText(meta.consentText)).catch(() => setText(""));
  }

  if (!me) return <Loading />;
  if (me.kind === "operator") return <ErrorNote error="管理人员不在此签署个人信息授权" />;

  return (
    <div className="grid gap-4">
      <SectionTitle kicker={CONSENT_VERSION} title="个人信息单独同意" />
      <p className="text-sm text-muted-foreground">这一页和平台服务协议分开。证件号码、向电子签服务商提供信息，必须各自勾选。人脸和银行卡可以不同意。</p>
      <Card>
        <CardContent className="pt-4">
          {text ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs" data-testid="consent-text">{text}</pre> : <Loading label="正在读取同意书" />}
        </CardContent>
      </Card>
      <form
        className="grid gap-3"
        data-testid="consent-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          void api("/api/consent", {
            json: {
              idNumberAgreed: form.get("idNumber") === "on",
              thirdPartyAgreed: form.get("thirdParty") === "on",
              faceAgreed: form.get("face") === "on",
              faceAlternative: form.get("face") === "on" ? null : String(form.get("alternative") ?? ""),
              bankAgreed: form.get("bank") === "on",
            },
          })
            .then(() => setDone(CONSENT_VERSION))
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "没有记下同意"))
            .finally(() => setBusy(false));
        }}
      >
        <label className="flex gap-2 text-sm"><input type="checkbox" name="idNumber" data-testid="consent-id" /> 我单独同意处理身份证号码，用于实名核验。</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="thirdParty" data-testid="consent-share" /> 我单独同意把签署所必需的信息提供给电子签服务商。</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="face" data-testid="consent-face" checked={face} onChange={(event) => setFace(event.target.checked)} /> 我同意人脸核验。不同意时必须填写线下替代方式。</label>
        {face ? null : (
          <Field label="不同意人脸时的替代方式">
            <Textarea name="alternative" data-testid="consent-alternative" placeholder="线下核验证件原件" />
          </Field>
        )}
        <label className="flex gap-2 text-sm"><input type="checkbox" name="bank" data-testid="consent-bank" /> 我同意处理银行卡信息。不同意不影响签署和发单。</label>
        <Button type="submit" disabled={busy} data-testid="consent-submit">记下这条同意</Button>
        <ErrorNote error={error} />
        {done ? <p data-testid="consent-done">已记录 {done}。这和平台服务协议是两件事。</p> : null}
      </form>
    </div>
  );
}
