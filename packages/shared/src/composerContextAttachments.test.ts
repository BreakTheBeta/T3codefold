import { describe, expect, it } from "vite-plus/test";
import { ComposerContextId, type OrchestrationMessageContext } from "@t3tools/contracts";
import { remapComposerContextAttachments } from "./composerContextAttachments.ts";

describe("attachment context identity", () => {
  it("keeps chip identity through upload and thread claim, including repeated references", () => {
    const context: OrchestrationMessageContext = {
      version: 1,
      records: [
        {
          version: 1,
          kind: "image",
          contextId: ComposerContextId.make("chip"),
          label: "Screenshot",
          attachmentId: "local",
          name: "shot.png",
          mimeType: "image/png",
          sizeBytes: 20,
        },
      ],
    };
    const uploaded = remapComposerContextAttachments(
      context,
      [{ id: "local" }],
      [{ id: "pending" }],
    );
    const claimed = remapComposerContextAttachments(
      uploaded,
      [{ id: "pending" }],
      [{ id: "durable" }],
    );
    expect(claimed?.records).toEqual([{ ...context.records[0], attachmentId: "durable" }]);
    expect(context.records[0]).toMatchObject({ attachmentId: "local", contextId: "chip" });
  });
  it("preserves bindings outside the uploaded batch and absent context", () => {
    expect(remapComposerContextAttachments(undefined, [], [])).toBeUndefined();
    const context: OrchestrationMessageContext = {
      version: 1,
      records: [
        {
          version: 1,
          kind: "file",
          contextId: ComposerContextId.make("file"),
          label: "Notes",
          attachmentId: "existing",
          name: "notes.txt",
          mimeType: "text/plain",
          sizeBytes: 20,
        },
      ],
    };
    expect(remapComposerContextAttachments(context, [{}], [{ id: "new" }])).toEqual(context);
  });
});
