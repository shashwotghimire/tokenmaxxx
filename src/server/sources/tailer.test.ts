import { test, expect, beforeEach } from "bun:test";
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileTailer } from "./tailer";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tailer-test-"));
  file = path.join(dir, "log.jsonl");
  writeFileSync(file, "line1\nline2\n");
});

test("reads all complete lines on first read", () => {
  const t = new FileTailer(file);
  expect(t.readNewLines()).toEqual(["line1", "line2"]);
  expect(t.readNewLines()).toEqual([]);
});

test("only returns appended lines on later reads", () => {
  const t = new FileTailer(file);
  t.readNewLines();
  appendFileSync(file, "line3\n");
  expect(t.readNewLines()).toEqual(["line3"]);
});

test("holds a partial trailing line until it is completed", () => {
  const t = new FileTailer(file);
  t.readNewLines();
  appendFileSync(file, "part");
  expect(t.readNewLines()).toEqual([]);
  appendFileSync(file, "ial\n");
  expect(t.readNewLines()).toEqual(["partial"]);
});

test("returns nothing for a missing file", () => {
  const t = new FileTailer(path.join(dir, "nope.jsonl"));
  expect(t.readNewLines()).toEqual([]);
});

test("recovers from truncation by re-reading from the top", () => {
  const t = new FileTailer(file);
  t.readNewLines();
  writeFileSync(file, "x\n");
  expect(t.readNewLines()).toEqual(["x"]);
});
