"use client";

import { Suspense } from "react";
import { Loading } from "@/components/bits";
import { PersonDesk } from "@/components/person-desk";

export default function EmployeePage() {
  return (
    <Suspense fallback={<Loading label="正在打开劳动员工档案" />}>
      <PersonDesk kind="employee" />
    </Suspense>
  );
}
