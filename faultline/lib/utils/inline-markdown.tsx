import { createElement } from 'react'

/**
 * Renders inline markdown (**bold**, *italic*) as React elements.
 * Handles **bold** first, then *italic* on remaining text segments.
 */
export function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Split on **bold** first
  const boldPattern = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderItalic(text.slice(lastIndex, match.index), parts.length))
    }
    parts.push(createElement('strong', { key: `b${parts.length}` }, match[1]))
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(...renderItalic(text.slice(lastIndex), parts.length))
  }

  return parts
}

function renderItalic(text: string, keyOffset: number): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const italicPattern = /\*(.+?)\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = italicPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(createElement('em', { key: `i${keyOffset + parts.length}` }, match[1]))
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}
