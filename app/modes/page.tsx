import { permanentRedirect } from "next/navigation";

// Browsers retain the original fragment on redirect, so existing #duels and
// #arena-rounds-title links land on the matching sections of the new playbook.
export default function ModesPage() {
  permanentRedirect("/features");
}
