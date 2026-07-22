import { redirect } from "next/navigation";

/** 声音复刻已并入「声音合成」同一页 */
export default function VoicesPageRedirect() {
  redirect("/voices/records");
}
