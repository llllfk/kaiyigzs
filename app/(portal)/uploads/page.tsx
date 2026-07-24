import UploadsClient, { type Media } from "./UploadsClient";
import { fetchServerApiJson } from "@/lib/server-api";
import type { PageMeta } from "@/lib/pagination";

export default async function UploadsPage() {
  const initialData = await fetchServerApiJson<{
    data?: Media[];
    meta?: PageMeta;
  }>("/api/uploads?page=1&pageSize=10");

  return <UploadsClient initialData={initialData} />;
}
