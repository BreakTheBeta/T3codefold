import type { ComposerContextId } from "@t3tools/contracts";
import { formatComposerContextReference } from "@t3tools/shared/composerContextReferences";

/** Attach the original source, including tabs; displayed canvas rows may expand them. */
export function sourceSelectionContext(input: {
  readonly contents: string;
  readonly path: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly contextId: ComposerContextId;
}) {
  const lines = input.contents.replace(/\r\n?/g, "\n").split("\n");
  if (!Number.isInteger(input.startIndex) || !Number.isInteger(input.endIndex)) return null;
  const start = Math.min(input.startIndex, input.endIndex);
  const end = Math.max(input.startIndex, input.endIndex);
  if (start < 0 || end >= lines.length) return null;
  const text = lines.slice(start, end + 1).join("\n");
  const fenceLength = Array.from(text.matchAll(/`+/g)).reduce(
    (length, match) => Math.max(length, match[0].length + 1),
    3,
  );
  const fence = "`".repeat(fenceLength);
  const record = {
    version: 1 as const,
    kind: "mention" as const,
    contextId: input.contextId,
    path: input.path,
    label: `${input.path}:${start + 1}–${end + 1}`.slice(-255),
  };
  return {
    text: `${formatComposerContextReference(record)}\n${fence}\n${text}\n${fence}\n`,
    context: { version: 1 as const, records: [record] },
  };
}
