import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { parseSkillFrontmatter, getSkills } = await import("./skills");

function write(dir: string, rel: string, content: string) {
  const full = path.join(dir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

test("parseSkillFrontmatter extracts name and quoted description", () => {
  const text = `---
name: hallmark
description: "Anti-slop design skill. Use for redesigns."
---
body`;
  expect(parseSkillFrontmatter(text)).toEqual({
    name: "hallmark",
    description: "Anti-slop design skill. Use for redesigns.",
  });
});

test("parseSkillFrontmatter tolerates missing or empty frontmatter", () => {
  expect(parseSkillFrontmatter("just a body, no frontmatter")).toEqual({});
  expect(parseSkillFrontmatter("---\n---\nbody")).toEqual({});
  expect(
    parseSkillFrontmatter("---\ntitle: ignored\nname: grill-me\ndescription: ask hard questions\n---\n"),
  ).toEqual({ name: "grill-me", description: "ask hard questions" });
});

test("getSkills discovers .claude/skills and .agents/skills across projects", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tokenmaxxx-skills-"));
  write(dir, "proj-a/.claude/skills/grill-me/SKILL.md", `---
name: grill-me
description: "Peer-review skill."
---
body`);
  write(dir, "proj-a/.claude/skills/grill-me/references/prompt-bank.md", "some extra context text");
  write(dir, "proj-b/.agents/skills/hallmark/SKILL.md", "---\nname: hallmark\ndescription: no quotes needed\n---\nbody");
  write(dir, "proj-b/.agents/skills/hallmark/references/slop-test.md", "a".repeat(400));

  const result = await getSkills(dir);
  expect(result.roots).toContain(dir);
  const names = result.skills.map((s) => s.name).sort();
  expect(names).toEqual(["grill-me", "hallmark"].sort());

  const grill = result.skills.find((s) => s.name === "grill-me")!;
  expect(grill.agent).toBe("claude-code");
  expect(grill.scope).toBe("project");
  expect(grill.projectRoot).toBe(path.join(dir, "proj-a"));
  expect(grill.files).toBe(2);
  expect(grill.references).toBe(1);

  const hallmark = result.skills.find((s) => s.name === "hallmark")!;
  expect(hallmark.agent).toBe("opencode");
  expect(hallmark.description).toBe("no quotes needed");
  const skMd = "---\nname: hallmark\ndescription: no quotes needed\n---\nbody";
  expect(hallmark.estTokens).toBe(Math.round((skMd.length + 400) / 4));
});

test("getSkills falls back to the folder name when there is no frontmatter", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tokenmaxxx-skills-nofm-"));
  write(dir, "repo/.claude/skills/my-skill/SKILL.md", "# My skill\n\nno frontmatter here");
  const result = await getSkills(dir);
  const skill = result.skills.find((s) => s.path.endsWith("my-skill"));
  expect(skill?.name).toBe("my-skill");
});
