"use client";

import Link from "next/link";
import { useState } from "react";
import { COPY, type PersonKind } from "@domain";
import { ErrorNote, Field, Loading, SectionTitle } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const [kind, setKind] = useState<PersonKind | "">("");
  const [platformText, setPlatformText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loaded) {
    setLoaded(true);
    void api<{ platformText: string }>("/api/meta", { token: null }).then((meta) => setPlatformText(meta.platformText)).catch(() => setPlatformText("平台服务协议暂时没有加载出来，请稍后再试。"));
  }

  const copy = kind ? COPY[kind] : null;

  return (
    <div className="grid gap-6">
      <SectionTitle kicker="注册后不能更改身份" title="选择一种身份" />
      <div className="grid gap-4 md:grid-cols-2">
        <button type="button" data-testid="pick-employee" className={`rounded-xl border bg-card p-4 text-left kind-employee ${kind === "employee" ? "ring-2 ring-primary" : ""}`} onClick={() => setKind("employee")}>
          <p className="text-lg font-medium">劳动员工</p>
          <p className="mt-1 text-sm text-muted-foreground">签订劳动合同，按工资核算。不使用服务费，不打卡，也不把考勤当成合作。</p>
        </button>
        <button type="button" data-testid="pick-collaborator" className={`rounded-xl border bg-card p-4 text-left kind-collaborator ${kind === "collaborator" ? "ring-2 ring-primary" : ""}`} onClick={() => setKind("collaborator")}>
          <p className="text-lg font-medium">项目合作方</p>
          <p className="mt-1 text-sm text-muted-foreground">签订项目服务协议，按交付计服务费。没有工资、社保、公积金和固定月薪。</p>
        </button>
      </div>
      {!copy ? <p className="text-sm text-muted-foreground">先点上面的一张卡片。两张卡片不能同时成立。</p> : null}
      {copy ? (
        <Card className={kind === "employee" ? "kind-employee" : "kind-collaborator"}>
          <CardHeader>
            <CardTitle>登记为{copy.person}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3"
              data-testid="register-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setBusy(true);
                setError("");
                void api("/api/auth/register", {
                  token: null,
                  json: {
                    kind,
                    name: String(form.get("name") ?? ""),
                    email: String(form.get("email") ?? ""),
                    designatedEmail: String(form.get("designatedEmail") ?? ""),
                    phone: String(form.get("phone") ?? ""),
                    password: String(form.get("password") ?? ""),
                    platformAgreed: form.get("platformAgreed") === "on",
                  },
                })
                  .then(() => setDone(String(form.get("email") ?? "")))
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : "注册没有完成"))
                  .finally(() => setBusy(false));
              }}
            >
              <Field label="姓名">
                <Input name="name" required data-testid="register-name" />
              </Field>
              <Field label="登录邮箱">
                <Input name="email" type="email" required data-testid="register-email" />
              </Field>
              <Field label="指定确认邮箱（核算单发到这里）">
                <Input name="designatedEmail" type="email" required data-testid="register-designated" />
              </Field>
              <Field label="手机号">
                <Input name="phone" required inputMode="numeric" data-testid="register-phone" placeholder="11 位，1 开头" />
              </Field>
              <Field label="密码（至少 8 位）">
                <Input name="password" type="password" required minLength={8} data-testid="register-password" />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="platformAgreed" data-testid="register-terms" className="mt-1" />
                <span>我已阅读平台服务协议。这不是个人信息单独同意，实名和电子签授权要登录后再单独勾选。</span>
              </label>
              <details>
                <summary className="cursor-pointer text-sm" data-testid="platform-terms-toggle">阅读平台服务协议</summary>
                {platformText ? <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs" data-testid="platform-terms">{platformText}</pre> : <Loading label="正在读取协议" />}
              </details>
              <Button type="submit" disabled={busy} data-testid="register-submit">
                注册为{copy.person}
              </Button>
              <ErrorNote error={error} />
              {done ? (
                <p className="text-sm" data-testid="register-done">
                  {done} 已注册为{copy.person}。请{" "}
                  <Link href="/login/" className="underline">
                    返回登录
                  </Link>
                  ，再完成单独同意和实名。
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
