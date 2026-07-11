const TOKEN_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+\b/g,
];

/** Removes common secret/PII shapes before diagnostics leave the process. */
export function sanitizeDiagnostic(value: unknown, max = 1000): string {
  const objectMessage =
    typeof value === "object" && value !== null && "message" in value
      ? (value as { message?: unknown }).message
      : undefined;
  let text = value instanceof Error
    ? value.message
    : typeof objectMessage === "string"
      ? objectMessage
      : String(value ?? "Unknown error");
  for (const pattern of TOKEN_PATTERNS) text = text.replace(pattern, "[redacted-token]");
  text = text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[redacted-url]";
      }
    })
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text.slice(0, max);
}

export function sanitizePath(path: string): string {
  return path.split(/[?#]/, 1)[0].slice(0, 300) || "/";
}
