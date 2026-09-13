import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { listJsonFiles, watchJsonFiles } from "./jsonFiles";

test("discovery reads only JSON/JSONL and detects folders created after startup", async () => {
  const root = path.join(mkdtempSync(path.join(tmpdir(), "json-watch-")), "not-yet-created");
  const received: any[] = [];
  const stop = watchJsonFiles([root], () => (json) => received.push(json));
  try {
    mkdirSync(root);
    writeFileSync(path.join(root, "ignored.sqlite"), '{"id":"database"}');
    writeFileSync(path.join(root, "message.json"), '{"id":"message","tokens":1}');
    writeFileSync(path.join(root, "rollout.jsonl"), '{"id":"first"}\n{"id":');
    await Bun.sleep(1100);
    expect(listJsonFiles(root)).toHaveLength(2);
    expect(received.map((r) => r.id).sort()).toEqual(["first", "message"]);
    appendFileSync(path.join(root, "rollout.jsonl"), '"second"}\n');
    writeFileSync(path.join(root, "message.json"), '{"id":"message","tokens":200}');
    await Bun.sleep(1100);
    expect(received).toHaveLength(4);
    expect(received.some((r) => r.id === "second")).toBe(true);
    expect(received.some((r) => r.tokens === 200)).toBe(true);
  } finally { stop?.(); }
});
