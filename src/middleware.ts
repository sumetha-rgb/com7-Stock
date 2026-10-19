import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = token?.role as string | undefined;

    if (token?.revoked) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // /api/employees/sync และ /api/notifications/digest ตรวจสิทธิ์เองในตัว route (รองรับ Vercel Cron ที่ไม่มี session)
    if (path === "/api/employees/sync" || path === "/api/notifications/digest") return NextResponse.next();

    // API calls without a session get JSON 401 (not an HTML redirect that
    // makes res.json() throw on the client).
    if (!token && path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Admin2 can access everything
    if (role === "Admin2") {
      return NextResponse.next();
    }

    // Admin2 routes must be checked before /admin to avoid prefix overlap.
    if (path === "/admin2" || path.startsWith("/admin2/") || path.startsWith("/api/admin2/")) {
      if (role === "Admin2") {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL("/staff/requisition", req.url));
    }

    // Admin routes
    if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/")) {
      if (role === "Admin" || role === "Admin2") {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL("/staff/requisition", req.url));
    }

    // Staff routes - all authenticated
    if (path.startsWith("/staff") || path.startsWith("/api/requisitions") || path.startsWith("/api/products")) {
      return NextResponse.next();
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        // Public
        if (path === "/login" || path.startsWith("/api/auth")) {
          return true;
        }
        // API: let the middleware function above answer with JSON 401
        if (path.startsWith("/api/")) return true;
        return !!token && !token.revoked;
      },
    },
  }
);

export const config = {
  matcher: [
    "/staff/:path*",
    "/admin/:path*",
    "/admin2/:path*",
    "/api/products/:path*",
    "/api/requisitions/:path*",
    "/api/users/:path*",
    "/api/employees/:path*",
    "/api/bundles/:path*",
    "/api/dashboard/:path*",
  ],
};
