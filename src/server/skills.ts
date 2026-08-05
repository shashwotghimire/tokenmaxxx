import { Glob } from "bun";
import { homedir } from "node:os";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export interface SkillInfo {
  name: string;
  description: string | null;
  agent: "claude-code" | "opencode";
  scope: "global" | "project";
  projectRoot: string | null;
  path: string;
  mainFile: string;
  files: number;
  references: number;
  bytes: number;
  estTokens: number;
}

export interface SkillsResult {
  roots: string[];
  skills: SkillInfo[];
  scannedAt: number;
}

const MAIN_PATTERNS = [
  "**/.agents/skills/**/SKILL.md",
  "**/.agents/skills/**/skill.md",
  "**/.claude/skills/**/SKILL.md",
  "**/.claude/skills/**/skill.md",
];

/** Directories we never descend into: system/private dirs (macOS EPERM) and heavy ones. */
const SKIP_DIRS = new Set([".Trash", "Library", "Applications", ".git", "node_modules"]);

const TTL_MS = 60_000;
let cache: { at: number; result: SkillsResult } | null = null;

function resolveRoots(rootDir?: string): string[] {
  const primary = path.resolve(rootDir ?? process.env.TOKENMAXXX_SKILLS_ROOT ?? homedir());
  const roots = new Set<string>([primary]);
  const cwd = path.resolve(process.cwd());
  if (!rootDir && cwd !== primary && !cwd.startsWith(primary + path.sep)) roots.add(cwd);
  return [...roots];
}

function listChildDirs(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
      .map((e) => path.join(root, e.name));
  } catch {
    return [];
  }
}

function classify(
  mdPath: string,
  home: string,
): { agent: "claude-code" | "opencode"; scope: "global" | "project"; projectRoot: string | null } {
  const m = /^(.+?)[/\\](\.claude|\.agents)[/\\]skills[/\\]/.exec(mdPath);
  if (!m) return { agent: "opencode", scope: "project", projectRoot: path.dirname(mdPath) };
  const agent = m[2] === ".claude" ? "claude-code" : "opencode";
  const projectRoot = m[1];
  const scope = path.resolve(projectRoot) === path.resolve(home) ? "global" : "project";
  return { agent, scope, projectRoot };
}

function cleanScalar(v: string): string {
  let s = v.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    s = s.slice(1, -1);
  }
  return s;
}

export function parseSkillFrontmatter(text: string): { name?: string; description?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out: { name?: string; description?: string } = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    if (key === "name") out.name = cleanScalar(kv[2]!);
    else if (key === "description") out.description = cleanScalar(kv[2]!);
  }
  return out;
}

function measureSkill(skillDir: string, mainName: string): { files: number; references: number; bytes: number } {
  let files = 0;
  let references = 0;
  let bytes = 0;
  for (const rel of readdirSync(skillDir, { recursive: true })) {
    const full = path.join(skillDir, rel);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) continue;
    files++;
    if (path.basename(full) !== mainName) references++;
    bytes += st.size;
  }
  return { files, references, bytes };
}

async function inspectSkill(mdPath: string, home: string): Promise<SkillInfo | null> {
  try {
    const md = await Bun.file(mdPath).text();
    const fm = parseSkillFrontmatter(md);
    const skillDir = path.dirname(mdPath);
    const { agent, scope, projectRoot } = classify(mdPath, home);
    const { files, references, bytes } = measureSkill(skillDir, path.basename(mdPath));
    return {
      name: fm.name || path.basename(skillDir),
      description: fm.description || null,
      agent,
      scope,
      projectRoot,
      path: skillDir,
      mainFile: mdPath,
      files,
      references,
      bytes,
      estTokens: Math.round(bytes / 4),
    };
  } catch {
    return null;
  }
}

export async function getSkills(rootDir?: string): Promise<SkillsResult> {
  const now = Date.now();
  if (cache && !rootDir && now - cache.at < TTL_MS) return cache.result;
  const roots = resolveRoots(rootDir);
  const home = homedir();
  const seen = new Map<string, SkillInfo>();
  for (const root of roots) {
    for (const child of listChildDirs(root)) {
      try {
        for (const pattern of MAIN_PATTERNS) {
          const glob = new Glob(pattern);
          for await (const rel of glob.scan({ cwd: child, dot: true, onlyFiles: true })) {
            const mdPath = path.join(child, rel);
            const skillDir = path.dirname(mdPath);
            if (seen.has(skillDir)) continue;
            const info = await inspectSkill(mdPath, home);
            if (info) seen.set(skillDir, info);
          }
        }
      } catch (e) {
        console.warn(`[skills] skipping ${child}:`, e);
      }
    }
  }
  const skills = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  const result: SkillsResult = { roots, skills, scannedAt: now };
  cache = { at: now, result };
  return result;
}
