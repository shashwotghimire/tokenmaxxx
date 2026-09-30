import { openSync, readSync, closeSync, statSync, existsSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";

const CHUNK_BYTES = 8 * 1024 * 1024;

/**
 * Reads a growing log file line-by-line, tracking a byte offset so we only
 * parse bytes appended since the last read. Survives truncation (offset
 * resets) and partial lines (kept in a buffer until completed).
 */
export class FileTailer {
  private position = 0;
  private buffer = "";
  private decoder = new StringDecoder("utf8");

  constructor(private readonly filePath: string) {}

  /** Read any new complete lines since the last call. Returns them unchanged. */
  readNewLines(): string[] {
    if (!existsSync(this.filePath)) return [];
    const size = statSync(this.filePath).size;
    if (size < this.position) {
      // File was truncated or replaced: restart from the beginning.
      this.position = 0;
      this.buffer = "";
      this.decoder = new StringDecoder("utf8");
    }
    if (size === this.position) return [];

    const lines: string[] = [];
    const fd = openSync(this.filePath, "r");
    try {
      while (this.position < size) {
        const length = Math.min(CHUNK_BYTES, size - this.position);
        const buf = Buffer.alloc(length);
        const read = readSync(fd, buf, 0, length, this.position);
        if (read <= 0) break;
        this.position += read;
        this.buffer += this.decoder.write(buf.subarray(0, read));
        const chunkLines = this.buffer.split("\n");
        this.buffer = chunkLines.pop() ?? "";
        for (const line of chunkLines) lines.push(line);
      }
    } finally {
      closeSync(fd);
    }
    return lines;
  }

  get offset(): number {
    return this.position;
  }
}
