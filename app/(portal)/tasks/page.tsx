import TasksClient, { type Task } from "./TasksClient";
import { fetchServerApiJson } from "@/lib/server-api";
import type { PageMeta } from "@/lib/pagination";

export default async function TasksPage() {
  const initialData = await fetchServerApiJson<{
    data?: Task[];
    meta?: PageMeta;
  }>("/api/tasks?page=1&pageSize=10");

  return <TasksClient initialData={initialData} />;
}
