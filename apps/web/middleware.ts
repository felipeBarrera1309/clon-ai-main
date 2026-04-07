import { getSessionCookie } from "better-auth/cookies"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

const signInRoutes = ["/sign-in", "/sign-up"]
const orgFreeRoutes = ["/sign-in", "/sign-up", "/org-selection"]

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Check if this is a sign-in route
  const isSignInRoute = signInRoutes.some((route) => pathname.startsWith(route))
  const isOrgFreeRoute = orgFreeRoutes.some((route) =>
    pathname.startsWith(route)
  )

  // Get session cookie (lightweight check, doesn't fetch full session)
  const sessionCookie = getSessionCookie(req)

  // If no session and not on sign-in route, redirect to sign-in
  if (!sessionCookie && !isSignInRoute) {
    const signInUrl = new URL("/sign-in", req.url)
    return NextResponse.redirect(signInUrl)
  }

  // If has session and on sign-in route, redirect to dashboard
  if (sessionCookie && isSignInRoute) {
    const dashboardUrl = new URL("/dashboard", req.url)
    return NextResponse.redirect(dashboardUrl)
  }

  // Organization checks are handled client-side by OrganizationGuard
  // This keeps the middleware lightweight

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    // Also skip api/auth routes for Better Auth
    "/((?!_next|api/auth|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
}
