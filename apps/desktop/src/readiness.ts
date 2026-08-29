/** Harness stdout framing and readiness parsing for the desktop supervisor. */

const READY_LINE = /^dsh web: (http:\/\/127\.0\.0\.1:\d+(?:\/?\?token=[A-Za-z0-9_-]+)?)(?: \(LAN: http:\/\/[^)]+\))?$/

/**
 * Parse the canonical URL from one complete Harness output line.
 * @param line - One output line without its newline.
 * @returns The loopback URL, or undefined when the line is not a readiness signal.
 */
export function parseHarnessReadyLine(line: string): string | undefined {
  return READY_LINE.exec(line.trimEnd())?.[1]
}

/** Incrementally splits process output without losing a trailing partial line. */
export class LineBuffer {
  #pending = ''

  /**
   * Add process output and return every newly completed line.
   * @param chunk - Decoded process output.
   * @returns Complete lines without newline delimiters.
   */
  push(chunk: string): string[] {
    this.#pending += chunk
    const parts = this.#pending.split(/\r?\n/)
    this.#pending = parts.pop() ?? ''
    return parts
  }

  /**
   * Return the final unterminated line, if present.
   * @returns The final line, or undefined when the buffer is empty.
   */
  flush(): string | undefined {
    if (this.#pending === '') return undefined
    const line = this.#pending
    this.#pending = ''
    return line
  }
}
