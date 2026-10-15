"use client";

import { Suspense } from "react";
import { Loading } from "@/components/bits";
import { PersonDesk } from "@/components/person-desk";

export default function CollaboratorPage() {
  return (
    <Suspense fallback={<Loading label="正在打开项目合作方档案" />}>
      <PersonDesk kind="collaborator" />
    </Suspense>
  );
}
