import { permanentRedirect } from "next/navigation";

export default function CratesPage() {
  permanentRedirect("/inventory");
}
