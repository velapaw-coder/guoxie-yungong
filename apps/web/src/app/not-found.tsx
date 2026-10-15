import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid gap-3 py-10">
      <h1 className="text-2xl font-semibold">没有这一页</h1>
      <p className="text-sm text-muted-foreground">劳动员工和项目合作方的页面是分开的，请从工作台进入。</p>
      <Link href="/login/" className="text-sm underline">
        返回登录
      </Link>
    </div>
  );
}
