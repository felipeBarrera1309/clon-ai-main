import axios from "axios"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const getSafeResponseData = (data: unknown) => {
  if (!isRecord(data)) {
    return undefined
  }

  const source = isRecord(data.error) ? data.error : data
  const safeError: Record<string, unknown> = {}

  if (typeof source.message === "string") {
    safeError.message = source.message
  }

  if (typeof source.type === "string") {
    safeError.type = source.type
  }

  if (typeof source.code === "number") {
    safeError.code = source.code
  }

  if (typeof source.error_subcode === "number") {
    safeError.error_subcode = source.error_subcode
  }

  if (typeof source.fbtrace_id === "string") {
    safeError.fbtrace_id = source.fbtrace_id
  }

  if (typeof source.details === "string") {
    safeError.details = source.details
  }

  if (isRecord(source.error_data)) {
    const safeErrorData: Record<string, string> = {}

    if (typeof source.error_data.messaging_product === "string") {
      safeErrorData.messaging_product = source.error_data.messaging_product
    }

    if (typeof source.error_data.details === "string") {
      safeErrorData.details = source.error_data.details
    }

    if (Object.keys(safeErrorData).length > 0) {
      safeError.error_data = safeErrorData
    }
  }

  if (Object.keys(safeError).length === 0) {
    return undefined
  }

  return isRecord(data.error) ? { error: safeError } : safeError
}

export const getSafeErrorDetails = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      data: getSafeResponseData(error.response?.data),
    }
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    }
  }

  return error
}
