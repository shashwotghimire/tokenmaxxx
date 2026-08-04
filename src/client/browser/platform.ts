export type OS = "macOS" | "Windows" | "Linux" | "Other";

export function detectOS(): OS {
  if (typeof navigator === "undefined") return "Other";
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return "macOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}

export interface DefaultPaths {
  claude: string;
  opencode: string;
  codex: string;
}

/** Expected default log locations for each agent, per OS. */
export function defaultPaths(os: OS): DefaultPaths {
  switch (os) {
    case "Windows":
      return {
        claude: `%USERPROFILE%\\.claude\\projects`,
        opencode: `%USERPROFILE%\\.local\\share\\opencode\\opencode.db`,
        codex: `%USERPROFILE%\\.codex\\state_*.sqlite`,
      };
    case "macOS":
    case "Linux":
      return {
        claude: `~/.claude/projects`,
        opencode: `~/.local/share/opencode/opencode.db`,
        codex: `~/.codex/state_*.sqlite`,
      };
    default:
      return { claude: "~/.claude/projects", opencode: "~/.local/share/opencode/opencode.db", codex: "~/.codex/state_*.sqlite" };
  }
}

export function describeOS(os: OS): string {
  return os;
}
