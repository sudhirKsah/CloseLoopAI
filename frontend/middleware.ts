import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PATHS = [
  "/dashboard",
  "/meetings",
  "/tasks",
  "/approvals",
  "/people",
  "/analytics",
  "/integrations",
  "/reports",
  "/settings",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // Check for token in cookies (set by client) or let the client handle redirect
  // Since we use localStorage (client-side), we do a lightweight check here:
  // The actual auth check happens in the AuthProvider on the client.
  // This middleware just prevents SSR flash of protected pages for logged-out users.
  const token = request.cookies.get("closeloop_token")?.value;
  if (!token) {
    // Redirect to login — client will also handle this via AuthProvider
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
