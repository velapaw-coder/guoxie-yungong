"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/session";

const steps = [
  { no: "一", title: "实名认证与电子签约", text: "完成个人信息单独同意和实名认证，通过持牌电子签名服务签署劳动合同或服务协议。签署完成之前，不发任务。" },
  { no: "二", title: "发布任务", text: "每项任务写明做什么、交付什么、怎么计酬、何时结算。" },
  { no: "三", title: "交付与验收", text: "在平台提交成果，验收人逐版通过或驳回，并写明理由。" },
  { no: "四", title: "核算单确认与付款登记", text: "核算单发送至本人指定邮箱确认；付款登记须经制单与复核两人办理。" },
];

const highlights = [
  { title: "持牌电子签名", text: "合同通过持牌第三方电子签名服务签署，签署结果回传平台留存。" },
  { title: "个人信息单独同意", text: "身份证件、人脸等敏感个人信息逐项单独征得同意，可以申请查阅、更正和删除。" },
  { title: "记录只增不改", text: "签约、任务、交付、验收、确认和付款登记全程留痕，记录只追加、不修改，可导出证据。" },
];

export default function HomePage() {
  const { me } = useSession();
  return (
    <div className="grid gap-10 py-2" data-testid="homepage">
      <section className="grid gap-4 border-b pb-8">
        <p className="text-xs tracking-[0.2em] text-muted-foreground">远程办公灵活用工管理平台</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">国协云工</h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          由用工单位自建的远程办公灵活用工管理平台。劳动员工与项目合作方分开签约、分开核算，线下约定、线上闭环，每一步有据可查。
        </p>
        <div className="flex flex-wrap gap-3">
          {me ? (
            <Button asChild><Link href="/home/" data-testid="home-enter">进入工作台</Link></Button>
          ) : (
            <Button asChild><Link href="/login/" data-testid="home-login">登录</Link></Button>
          )}
          <Button variant="outline" asChild><Link href="/contact/" data-testid="home-contact">联系与投诉</Link></Button>
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-xl font-semibold">两类人员，分开办理</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card data-testid="entry-employee">
            <CardHeader>
              <CardTitle>劳动员工</CardTitle>
              <CardDescription>与单位签订劳动合同，远程办公</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm leading-6">
              <p>按劳动合同管理，工资核算单发送至本人指定邮箱确认。工资、个税、社保和公积金由单位按规定在线下核算办理。</p>
              <Link href="/login/" className="underline-offset-4 hover:underline">劳动员工登录</Link>
            </CardContent>
          </Card>
          <Card data-testid="entry-collaborator">
            <CardHeader>
              <CardTitle>项目合作方</CardTitle>
              <CardDescription>独立提供服务，按验收结果结算服务费</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm leading-6">
              <p>签订服务协议，自主安排工作方式。交付物验收通过后，按协议结算服务费，服务费核算单发送至本人指定邮箱确认。</p>
              <Link href="/login/" className="underline-offset-4 hover:underline">项目合作方登录</Link>
            </CardContent>
          </Card>
        </div>
        <p className="text-sm text-muted-foreground">
          新人员请{" "}
          <Link href="/register/" className="underline-offset-4 hover:underline">分开注册</Link>
          。管理人员账号由单位管理员开设。
        </p>
      </section>

      <section className="grid gap-4">
        <h2 className="text-xl font-semibold">办理流程</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <li key={step.no} className="rounded-lg border bg-card p-4">
              <span className="text-xs text-muted-foreground">第{step.no}步</span>
              <p className="mt-1 font-medium">{step.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">以上每一步均记入审计日志，全程留痕。</p>
      </section>

      <section className="grid gap-4">
        <h2 className="text-xl font-semibold">合规要点</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {highlights.map((item) => (
            <div key={item.title} className="rounded-lg border bg-card p-4">
              <p className="font-medium">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="grid gap-2 border-t pt-6 text-sm text-muted-foreground" data-testid="home-footer">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/login/" className="underline-offset-4 hover:underline">登录</Link>
          <Link href="/contact/" className="underline-offset-4 hover:underline">联系与投诉</Link>
          <Link href="/privacy/" className="underline-offset-4 hover:underline">个人信息查阅与更正申请（登录后办理）</Link>
        </div>
        <p>运营单位：【运营单位】</p>
        <p>ICP备案号：【ICP备案号】</p>
      </footer>
    </div>
  );
}
