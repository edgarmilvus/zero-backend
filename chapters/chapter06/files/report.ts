/**
 * What one photo produced, and the two assertions a pipeline needs.
 *
 * A resize that makes the file bigger is a defect, and a metadata strip that leaves a tag is a
 * privacy incident. Both are cheap to check and both are easy to skip when the pipeline is written
 * as three chained promises.
 */

export type PhotoResult = {
  readonly name: string;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly decodeMs: number;
  readonly encodeMs: number;
  readonly metadataRemoved: number;
};

const PAD = 30;

export function renderResults(results: readonly PhotoResult[]): string {
  const lines = [
    `${"photo".padEnd(PAD)}${"in".padStart(9)}${"out".padStart(9)}${"ratio".padStart(8)}  format`,
    `${"-".repeat(PAD)}${"-".repeat(9)}${"-".repeat(9)}${"-".repeat(8)}  ------`,
  ];

  for (const result of results) {
    lines.push(
      `${result.name.padEnd(PAD)}${String(result.inputBytes).padStart(9)}` +
        `${String(result.outputBytes).padStart(9)}` +
        `${(result.inputBytes / result.outputBytes).toFixed(1).padStart(8)}x  ` +
        `${result.format} ${result.width}x${result.height}`,
    );
  }

  const input = results.reduce((sum, result) => sum + result.inputBytes, 0);
  const output = results.reduce((sum, result) => sum + result.outputBytes, 0);
  lines.push("");
  lines.push(
    `${results.length} photos, ${input} bytes in, ${output} out, ${
      output === 0 ? "0" : (input / output).toFixed(1)
    }x smaller`,
  );
  return lines.join("\n");
}

/**
 * The assertion that catches a resize pipeline that resized nothing.
 *
 * A photo at 160 pixels wide whose output is larger than its input means the encoder was given a
 * quality the format did not understand, or the resize never happened and the bytes went through a
 * lossless path.
 */
export function assertSmaller(result: PhotoResult): void {
  if (result.outputBytes >= result.inputBytes) {
    throw new Error(
      `${result.name}: output ${result.outputBytes} is not smaller than input ${result.inputBytes}`,
    );
  }
}

/** The assertion that catches a strip that stripped the wrong segment. */
export function assertNoMetadata(before: number, after: number): void {
  if (after > 0) throw new Error(`metadata: ${after} segments survived the strip`);
  if (before < 0) throw new Error("metadata: the input was never inspected");
}
