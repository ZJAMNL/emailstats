import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/** Ends a session whose beheerder rights were withdrawn (see requireAdmin). */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  cookieStore.delete("email-stats-session");
  return NextResponse.redirect(new URL("/login", request.url));
}
