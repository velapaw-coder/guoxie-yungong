"use client";

import { Suspense } from "react";
import { Loading } from "@/components/bits";
import { TaskView } from "@/components/task-view";

export default function TaskPage() {
  return (
    <Suspense fallback={<Loading label="正在打开任务" />}>
      <TaskView />
    </Suspense>
  );
}
