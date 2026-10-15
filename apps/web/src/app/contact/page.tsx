"use client";

import { SectionTitle } from "@/components/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LINES = [
  ["投诉电话", "010-66001800"],
  ["个人信息", "privacy@guoxie.chang2.ccwu.cc"],
  ["人力资源", "hr@guoxie.chang2.ccwu.cc"],
  ["项目合作", "project@guoxie.chang2.ccwu.cc"],
  ["资金登记", "finance@guoxie.chang2.ccwu.cc"],
  ["通知", "notice@guoxie.chang2.ccwu.cc"],
];

export default function ContactPage() {
  return (
    <div className="grid gap-4">
      <SectionTitle title="联系与投诉" kicker="国协云工集团有限公司" />
      <p className="text-sm text-muted-foreground">住所：北京市西城区国协路 8 号。统一社会信用代码 91110000MA01GY8X7K。法定代表人江衡。</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {LINES.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle>{label}</CardTitle>
            </CardHeader>
            <CardContent data-testid={`contact-${label}`}>{value}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
