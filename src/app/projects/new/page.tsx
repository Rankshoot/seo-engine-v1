import { redirect } from "next/navigation";

/** Legacy URL — full-page create flow removed; open the shared modal on the projects list. */
export default function NewProjectRedirectPage() {
  redirect("/projects?new=1");
}
