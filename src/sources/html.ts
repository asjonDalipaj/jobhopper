/** Shared HTML-to-text helper for job descriptions from all sources. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert raw HTML into readable plain text while preserving paragraphs,
 * line breaks and list structure. Unlike stripHtml this does not collapse
 * everything to a single space, so multi-paragraph descriptions stay legible.
 */
export function htmlToPlainText(html: string): string {
  return (
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|ul|ol|h[1-6]|blockquote|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<\/li>/gi, '')
      .replace(/<h([1-6])[^>]*>/gi, '\n\n### ')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      // Trim each line and collapse runs of blank lines
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** Fetch a URL with a hard timeout so a hung request can't wedge a scan. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}