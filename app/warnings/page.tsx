import { redirect } from "next/navigation";

export default function LegacyWarningsPage() {
  redirect("/bans");
}
