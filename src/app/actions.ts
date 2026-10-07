"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signInAction as signInDemoAccount } from "@/lib/demo-auth";

export async function signInAction(formData: FormData) {
  return signInDemoAccount(formData);
}

export async function signOutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("email-stats-session");
  redirect("/login");
}
