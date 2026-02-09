import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/api/invite", "/api/debate"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|css|js|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  // Check invite cookie
  const cookie = request.cookies.get("crux-invite");
  if (cookie?.value === "valid") {
    return NextResponse.next();
  }

  // Redirect to landing page
  const url = request.nextUrl.clone();
  url.pathname = "/";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
