import { redirect } from "next/navigation";

/** Moved: this page is now part of "voorspellen". */
export default function Moved() {
  redirect("/dashboard/customer/voorspellen");
}
