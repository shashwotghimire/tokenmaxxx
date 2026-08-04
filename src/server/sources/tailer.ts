import { openSync, readSync, closeSync, statSync, existsSync } from "node:fs";

/**
 * Reads a growing log file line-by-line, tracking a byte offset so we only
 * parse bytes appended since the last read. Survives truncation (offset
 * resets) and partial lines (kept in a buffer until completed).
 */
export class FileTailer {
  private position = 0;
  private buffer = "";

  constructor(private readonly filePath: string) {}

  /** Read any new complete lines since the last call. Returns them unchanged. */
  readNewLines(): string[] {
    if (!existsSync(this.filePath)) return [];
    const size = statSync(this.filePath).size;
    if (size < this.position) {
      // File was truncated or replaced: restart from the beginning.
      this.position = 0;
      this.buffer = "";
    }
    if (size === this.position) return [];

    const length = size - this.position;
    const fd = openSync(this.filePath, "r");
    const buf = Buffer.alloc(length);
    try {
      readSync(fd, buf, 0, length, this.position);
    } finally {
      closeSync(fd);
    }
    this.position = size;

    this.buffer += buf.toString("utf8");
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    return lines;
  }

  get offset(): number {
    return this.position;
  }
}
