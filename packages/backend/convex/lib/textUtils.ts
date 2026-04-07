export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

const thoughtWords =
  "think|thinking|thoughts|reasoning|analysis|reflection|planning|step"

export function rescueThoughtTags(text: string): string {
  const tagRegex = new RegExp(`</?(?:${thoughtWords})[^>]*>`, "gi")
  return text.replace(tagRegex, "").trim()
}

/**
 * Strips thought-related tags AND their content from text.
 * Intentionally aggressive: unclosed opening tags (e.g. "<think>hello")
 * cause ALL content after the tag to be stripped, returning "".
 * This is by design — the caller (messages.ts) handles empty results via
 * retry logic and falls back to rescueThoughtTags() which preserves content.
 */
export function stripThoughtTags(text: string): string {
  const tagRegex = new RegExp(`</?(?:${thoughtWords})[^>]*>`, "gi")

  const tags = Array.from(text.matchAll(tagRegex)).map((match) => ({
    match: match[0],
    index: match.index!,
    isClosing: match[0].startsWith("</"),
  }))

  if (tags.length === 0) return text.trim()

  const [firstTag] = tags
  if (tags.length === 1 && firstTag) {
    const textBefore = text.slice(0, firstTag.index).trim()
    const textAfter = text.slice(firstTag.index + firstTag.match.length).trim()

    if (firstTag.isClosing) {
      return textAfter
    } else if (textBefore.length > 0) {
      return textBefore
    } else {
      return ""
    }
  }

  const blocksToRemove: Array<{ start: number; end: number }> = []
  let insideThought = false
  let currentStart = 0

  for (const tag of tags) {
    if (!insideThought) {
      if (tag.isClosing) {
        blocksToRemove.push({ start: 0, end: tag.index + tag.match.length })
      } else {
        insideThought = true
        currentStart = tag.index
      }
    } else {
      if (tag.isClosing) {
        blocksToRemove.push({
          start: currentStart,
          end: tag.index + tag.match.length,
        })
        insideThought = false
      }
    }
  }

  if (insideThought) {
    blocksToRemove.push({ start: currentStart, end: text.length })
  }

  const mergedBlocks: Array<{ start: number; end: number }> = []
  blocksToRemove.sort((a, b) => a.start - b.start)
  for (const block of blocksToRemove) {
    const last = mergedBlocks[mergedBlocks.length - 1]
    if (last && block.start <= last.end) {
      last.end = Math.max(last.end, block.end)
    } else {
      mergedBlocks.push({ ...block })
    }
  }

  let result = text
  for (const block of mergedBlocks.reverse()) {
    result = result.substring(0, block.start) + result.substring(block.end)
  }

  return result.trim()
}

/**
 * Checks if a string contains any thought-related tags.
 */
export function containsThoughtTags(text: string): boolean {
  const tagRegex = new RegExp(`</?(?:${thoughtWords})[^>]*>`, "gi")
  return tagRegex.test(text)
}
