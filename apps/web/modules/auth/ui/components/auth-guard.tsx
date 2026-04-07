"use client"

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Loader } from "@/components/loader"

/**
 * Unified loading screen component
 * Used consistently across all authentication states
 */
function LoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader />
    </div>
  )
}

export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter()

  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>{children}</Authenticated>
      <Unauthenticated>
        <UnauthenticatedRedirect router={router} />
      </Unauthenticated>
    </>
  )
}

function UnauthenticatedRedirect({
  router,
}: {
  router: ReturnType<typeof useRouter>
}) {
  useEffect(() => {
    router.push("/sign-in")
  }, [router])

  return <LoadingScreen />
}
