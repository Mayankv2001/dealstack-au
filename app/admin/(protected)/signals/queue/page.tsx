import { redirect } from "next/navigation";

export default function LegacyFeedQueuePage(): never {
  redirect("/admin/review?tab=deals");
}
