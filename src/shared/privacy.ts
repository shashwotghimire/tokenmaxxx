const SECRET_PATTERNS = [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi, /(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}/gi, /(?:ghp|github_pat)_[A-Za-z0-9_]{12,}/gi, /\b(?:authorization|api[_-]?key|token|cookie|session(?:id)?)\s*[:=]\s*[^\s,;]+/gi];
export function redactSecrets(value: unknown): string { let text = String(value ?? ""); for (const p of SECRET_PATTERNS) text = text.replace(p, "[redacted]"); return text; }
export function sanitizeTitle(value: unknown, fallback = "Untitled session"): string {
  let text = redactSecrets(value).replace(/&(?:lt|gt|amp|quot|#39);/gi, " ").replace(/<[^>]*>/g, " ").replace(/!?\[[^\]]*\]\([^)]*\)/g, " ").replace(/(?:BEGIN|END)\s+[A-Z _-]+/gi, " ").replace(/^\s*[-#>*`]+\s*/gm, " ").replace(/\s+/g, " ").trim();
  if (!text || text === "[redacted]") return fallback; if (text.length > 96) text = text.slice(0, 93).trimEnd() + "…"; return text;
}
export function projectLabel(cwd: unknown): string { const clean = redactSecrets(cwd).replace(/[\\/]+$/, ""); return clean.split(/[\\/]/).filter(Boolean).pop() || "Unknown project"; }
export function redactPath(value: unknown): string | null { return value ? projectLabel(value) : null; }
