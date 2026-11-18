import { Readable } from "node:stream";
import { expect, test } from "vitest";
import { NodeAttachmentManager } from "../attachmentManager.ts";

// `e2e/node.feature` has a stream's attachment in a run; here, its content.
test("a stream's attachment: its whole content, as base64, once it ended", async () => {
  const attachments: unknown[] = [];
  const manager = new NodeAttachmentManager((attachment) => {
    attachments.push(attachment);
  });
  await manager.create(
    Readable.from([Buffer.from("str"), Buffer.from("eam")]),
    "text/plain",
  );
  expect(attachments).toEqual([
    {
      data: Buffer.from("stream").toString("base64"),
      media: { encoding: "BASE64", contentType: "text/plain" },
    },
  ]);
});
