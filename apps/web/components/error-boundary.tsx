"use client"

import * as Sentry from "@sentry/nextjs"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react"
import { type ReactNode, useEffect } from "react"

interface SentryErrorInfo {
  error: unknown
  componentStack: string
  eventId: string
  resetError(): void
}
function ErrorFallback({ error, resetError }: SentryErrorInfo) {
  const errorObj = error instanceof Error ? error : new Error(String(error))

  useEffect(() => {
    // Capture error in Sentry with additional context
    Sentry.captureException(errorObj, {
      tags: {
        component: "ErrorBoundary",
        section: "frontend",
      },
      extra: {
        errorMessage: errorObj.message,
        stack: errorObj.stack,
      },
    })
  }, [errorObj])

  const isNetworkError =
    errorObj.message.includes("fetch") || errorObj.message.includes("network")
  const isConvexError =
    errorObj.message.includes("ConvexError") ||
    errorObj.message.includes("CONVEX")
  const isAuthError =
    errorObj.message.includes("UNAUTHORIZED") ||
    errorObj.message.includes("Identidad no encontrada") ||
    errorObj.message.includes("IdentityNotFound") ||
    errorObj.message.includes("No estás autorizado")

  useEffect(() => {
    if (
      isAuthError &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/sign-in")
    ) {
      window.location.href = "/sign-in?reason=session-expired"
    }
  }, [isAuthError])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
            <AlertTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="font-semibold text-xl">
            ¡Ups! Algo salió mal
          </CardTitle>
          <CardDescription>
            {isNetworkError
              ? "Parece que hay un problema de conexión. Por favor, verifica tu internet e inténtalo de nuevo."
              : isAuthError
                ? "Tu sesión expiró. Te redirigiremos para iniciar sesión nuevamente."
                : isConvexError
                  ? "Ocurrió un error en el servidor. Nuestro equipo ha sido notificado."
                  : "Se produjo un error inesperado. Hemos registrado el problema para solucionarlo."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
            <p className="font-medium text-gray-600 text-sm dark:text-gray-400">
              Detalles técnicos:
            </p>
            <p className="mt-1 break-all font-mono text-gray-500 text-xs dark:text-gray-500">
              {errorObj.message}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={resetError} className="w-full">
              <RefreshCwIcon className="mr-2 h-4 w-4" />
              Intentar de nuevo
            </Button>

            <Button
              variant="outline"
              onClick={() => (window.location.href = "/")}
              className="w-full"
            >
              Volver al inicio
            </Button>
          </div>

          {process.env.NODE_ENV === "development" && (
            <details className="mt-4">
              <summary className="cursor-pointer text-gray-600 text-sm dark:text-gray-400">
                Stack trace (desarrollo)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-gray-500 text-xs dark:text-gray-500">
                {errorObj.stack}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface ErrorBoundaryProps {
  children: ReactNode
}

export function ErrorBoundary({ children }: ErrorBoundaryProps) {
  return (
    <Sentry.ErrorBoundary
      fallback={ErrorFallback}
      beforeCapture={(scope, error) => {
        // Add additional context to Sentry
        scope.setTag("component", "AppErrorBoundary")
        scope.setContext("error_boundary", {
          timestamp: new Date().toISOString(),
          url: typeof window !== "undefined" ? window.location.href : "unknown",
          userAgent:
            typeof window !== "undefined"
              ? window.navigator.userAgent
              : "unknown",
        })

        console.error("Error caught by ErrorBoundary:", error)
      }}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}

// Higher-order component using Sentry's withErrorBoundary
export const withErrorBoundary: typeof Sentry.withErrorBoundary =
  Sentry.withErrorBoundary
