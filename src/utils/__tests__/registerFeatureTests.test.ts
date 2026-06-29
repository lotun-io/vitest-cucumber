import type { Attachment } from "@cucumber/messages";
import { AttachmentContentEncoding } from "@cucumber/messages";
import type { TestContext } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { annotateAttachments } from "../registerFeatureTests.ts";

const ctx = () => {
  const annotate = vi.fn(async () => undefined);
  return { ctx: { annotate } as unknown as TestContext, annotate };
};

const attachment = (over: Partial<Attachment>): Attachment =>
  ({
    body: "",
    mediaType: "text/plain",
    contentEncoding: AttachmentContentEncoding.IDENTITY,
    ...over,
  }) as Attachment;

describe("annotateAttachments", () => {
  it("passes text through as utf-8 with the body in the title", async () => {
    const { ctx: c, annotate } = ctx();
    await annotateAttachments(c, {
      id: "0",
      attachments: [attachment({ body: "a plain text note" })],
    });
    expect(annotate).toHaveBeenCalledWith(
      "Attachment (text/plain): a plain text note",
      {
        body: "a plain text note",
        contentType: "text/plain",
        bodyEncoding: "utf-8",
      },
    );
  });

  it("keeps a binary base64 body with base64 encoding and uses the file name", async () => {
    const { ctx: c, annotate } = ctx();
    await annotateAttachments(c, {
      id: "0",
      attachments: [
        attachment({
          body: "AAAA",
          mediaType: "image/png",
          contentEncoding: AttachmentContentEncoding.BASE64,
          fileName: "shot.png",
        }),
      ],
    });
    expect(annotate).toHaveBeenCalledWith("Attachment (image/png): shot.png", {
      body: "AAAA",
      contentType: "image/png",
      bodyEncoding: "base64",
    });
  });

  it("does nothing when there are no attachments", async () => {
    const { ctx: c, annotate } = ctx();
    await annotateAttachments(c, { id: "0" });
    expect(annotate).not.toHaveBeenCalled();
  });
});
