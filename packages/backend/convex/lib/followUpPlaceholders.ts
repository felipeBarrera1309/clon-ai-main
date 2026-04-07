export type FollowUpPlaceholderContext = {
  customerName?: string
  restaurantName?: string
}

export function substituteFollowUpPlaceholders(
  template: string,
  context: FollowUpPlaceholderContext
): string {
  let result = template

  if (context.customerName) {
    result = result.replace(/\{customerName\}/g, context.customerName)
  } else {
    result = result.replace(/,?\s*\{customerName\}/g, "")
    result = result.replace(/\{customerName\},?\s*/g, "")
  }

  if (context.restaurantName) {
    result = result.replace(/\{restaurantName\}/g, context.restaurantName)
  } else {
    result = result.replace(/,?\s*\{restaurantName\}/g, "")
    result = result.replace(/\{restaurantName\},?\s*/g, "")
  }

  return result
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .replace(/^\s*,\s*/g, "")
    .replace(/\s*,\s*$/g, "")
    .trim()
}
