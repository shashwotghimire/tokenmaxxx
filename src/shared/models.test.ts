import { expect, test } from "bun:test";
import { normalizeModel } from "./models";
test("verified dotted aliases aggregate under canonical hyphenated ids", () => {
  expect(normalizeModel("claude-sonnet-4.6")).toEqual({ rawModel: "claude-sonnet-4.6", model: "claude-sonnet-4-6" });
});
test("distinct versions remain distinct", () => { expect(normalizeModel("claude-sonnet-4-5").model).toBe("claude-sonnet-4-5"); });
