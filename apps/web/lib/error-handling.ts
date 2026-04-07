import { ConvexError } from "convex/values"

export interface ErrorData {
  code: string
  message: string
}

export const handleConvexError = (error: unknown): string => {
  // Check whether the error is an application error
  if (error instanceof ConvexError) {
    // ConvexError stores the data in the constructor argument
    const errorData = error.data as ErrorData
    return errorData?.message || "Error de aplicación"
  }
  if (error instanceof Error) {
    return error.message
  }
  return "Error desconocido"
}

// Enhanced error handler that provides error codes for conditional UI handling
export const getErrorDetails = (error: unknown): ErrorData => {
  if (error instanceof ConvexError) {
    const errorData = error.data as ErrorData
    return {
      code: errorData?.code || "UNKNOWN_ERROR",
      message: errorData?.message || "Error de aplicación",
    }
  }
  if (error instanceof Error) {
    return {
      code: "CLIENT_ERROR",
      message: error.message,
    }
  }
  return {
    code: "UNKNOWN_ERROR",
    message: "Error desconocido",
  }
}

// Helper for conditional error handling based on error types
export const handleErrorByType = (
  error: unknown
): {
  isRetryable: boolean
  isUserError: boolean
  message: string
  code: string
} => {
  const { code, message } = getErrorDetails(error)

  const isRetryable = ["NETWORK_ERROR", "TIMEOUT", "SERVER_ERROR"].includes(
    code
  )
  const isUserError = ["BAD_REQUEST", "VALIDATION_ERROR", "FORBIDDEN"].includes(
    code
  )

  return {
    isRetryable,
    isUserError,
    message,
    code,
  }
}
