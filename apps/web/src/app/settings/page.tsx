import { redirect } from "next/navigation";

/** /settings has no content of its own — it opens on the first section. */
export default function SettingsIndex() {
  redirect("/settings/profile");
}
