import type { OrchestrationMessageContext } from "@t3tools/contracts";

/** Preserve chip bindings when uploads acquire durable, thread-scoped attachment ids. */
export function remapComposerContextAttachments(
  context: OrchestrationMessageContext | undefined,
  before: ReadonlyArray<object>,
  after: ReadonlyArray<{ readonly id: string }>,
): OrchestrationMessageContext | undefined {
  if (context === undefined) return undefined;
  const ids = new Map(
    before.flatMap((attachment, index) => {
      const finalId = after[index]?.id;
      return !("id" in attachment) || typeof attachment.id !== "string" || finalId === undefined
        ? []
        : [[attachment.id, finalId] as const];
    }),
  );
  return {
    ...context,
    records: context.records.map((record) =>
      (record.kind === "image" || record.kind === "file") && "attachmentId" in record
        ? { ...record, attachmentId: ids.get(record.attachmentId) ?? record.attachmentId }
        : record,
    ),
  };
}
