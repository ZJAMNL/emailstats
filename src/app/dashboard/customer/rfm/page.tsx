import { redirect } from "next/navigation";

/** Moved: this page is now part of "inzicht". */
export default function Moved() {
  redirect("/dashboard/customer/inzicht");
}
