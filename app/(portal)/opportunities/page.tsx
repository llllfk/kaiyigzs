import OpportunitiesClient, { type Opp } from "./OpportunitiesClient";
import { fetchServerApiJson } from "@/lib/server-api";
import type { PageMeta } from "@/lib/pagination";

export default async function OpportunitiesPage() {
  const initialData = await fetchServerApiJson<{
          data?: Opp[];
          meta?: PageMeta;
  }>("/api/opportunities?page=1&pageSize=10");

  return <OpportunitiesClient initialData={initialData} />;
}
