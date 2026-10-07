"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signInAction } from "@/lib/demo-auth";

export { signInAction };

export async function signOutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("email-stats-session");
  redirect("/login");
}
