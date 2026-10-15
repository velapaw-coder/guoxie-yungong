"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TEST_ACCOUNTS } from "@domain";
import { ErrorNote, Field } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loginWith, useSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { me, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="grid gap-4">
        <p className="text-xs tracking-[0.2em] text-muted-foreground">国协云工集团有限公司</p>
        <h1 className="text-3xl font-semibold tracking-tight">远程办公与项目合作，两条线分开办</h1>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          劳动员工走劳动合同和工资核算。项目合作方走服务协议和服务费。名册、合同、核算和付款登记互不混用。签署完成之前，不能发任务。
        </p>
        <Card>
          <CardHeader>
            <CardTitle>登录</CardTitle>
            <CardDescription>停用账号无法进入。</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3"
              data-testid="login-form"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                void loginWith(email, password, refresh)
                  .then(() => router.push("/home/"))
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : "登录没有完成"))
                  .finally(() => setBusy(false));
              }}
            >
              <Field label="邮箱">
                <Input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} data-testid="login-email" />
              </Field>
              <Field label="密码">
                <Input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} data-testid="login-password" />
              </Field>
              <Button type="submit" disabled={busy} data-testid="login-submit">
                登录
              </Button>
              <ErrorNote error={error} />
            </form>
            {me ? (
              <p className="mt-3 text-sm">
                当前已登录 {me.name}。{" "}
                <Link href="/home/" className="underline-offset-4 hover:underline">
                  进入工作台
                </Link>
              </p>
            ) : null}
            <p className="mt-3 text-sm">
              新的劳动员工或项目合作方请{" "}
              <Link href="/register/" className="underline-offset-4 hover:underline" data-testid="go-register">
                分开注册
              </Link>
              。管理人员账号由管理员开设。
            </p>
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>测试账号</CardTitle>
          <CardDescription>仅供测试。这些密码写在登录页，方便验收，不能用于正式环境。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {TEST_ACCOUNTS.map((account) => (
            <button
              key={account.key}
              type="button"
              data-testid={`fill-${account.key}`}
              className="rounded-lg border bg-background px-3 py-2 text-left hover:bg-muted"
              onClick={() => {
                setEmail(account.email);
                setPassword(account.password);
              }}
            >
              <span className="block text-sm font-medium">
                {account.role} · {account.name}
              </span>
              <span className="block text-xs text-muted-foreground">{account.email}</span>
              <span className="block text-xs">{account.password}</span>
              <span className="block text-xs text-muted-foreground">{account.duties}</span>
            </button>
          ))}
          <Link href="/contact/" className="text-sm underline-offset-4 hover:underline" data-testid="go-contact">
            投诉与个人信息联系方式
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
