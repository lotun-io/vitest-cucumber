import type { Attachment, Envelope } from "@cucumber/messages";
import { AttachmentContentEncoding } from "@cucumber/messages";
import { describe, expect, test } from "vitest";
import { createQuery } from "../../../runner/query.ts";
import { annotationsOf } from "../annotations.ts";

/** A run's `attachment` message. */
const attached = (
  attachment: Partial<Attachment> & Pick<Attachment, "body" | "mediaType">,
): Envelope => ({
  attachment: {
    contentEncoding: AttachmentContentEncoding.IDENTITY,
    testCaseStartedId: "started",
    testStepId: "step",
    ...attachment,
  },
});

/** The annotations of a run of `envelopes`. */
const annotationsIn = (envelopes: Envelope[]) =>
  annotationsOf(createQuery(envelopes));

describe("annotationsOf", () => {
  test("a log, as its text", () => {
    expect(
      annotationsIn([
        attached({
          body: "a log line",
          mediaType: "text/x.cucumber.log+plain",
        }),
      ]),
    ).toEqual([{ message: "a log line", type: "log" }]);
  });

  test("a link, as its URL", () => {
    expect(
      annotationsIn([
        attached({
          body: "https://example.com/report",
          mediaType: "text/uri-list",
        }),
      ]),
    ).toEqual([{ message: "https://example.com/report", type: "link" }]);
  });

  test("a text attachment, its media type the message (not its text)", () => {
    expect(
      annotationsIn([
        attached({ body: '{"ok":true}', mediaType: "application/json" }),
      ]),
    ).toEqual([
      {
        message: "application/json",
        type: "attachment",
        attachment: {
          contentType: "application/json",
          body: '{"ok":true}',
          bodyEncoding: "utf-8",
        },
      },
    ]);
  });

  test("a named attachment, its file name the message", () => {
    expect(
      annotationsIn([
        attached({
          body: "named",
          mediaType: "text/plain",
          fileName: "report.txt",
        }),
      ]),
    ).toEqual([
      {
        message: "report.txt",
        type: "attachment",
        attachment: {
          contentType: "text/plain",
          body: "named",
          bodyEncoding: "utf-8",
        },
      },
    ]);
  });

  test("a binary attachment, its media type the message, its body base64", () => {
    expect(
      annotationsIn([
        attached({
          body: "iVBORw==",
          mediaType: "image/png",
          contentEncoding: AttachmentContentEncoding.BASE64,
        }),
      ]),
    ).toEqual([
      {
        message: "image/png",
        type: "attachment",
        attachment: {
          contentType: "image/png",
          body: "iVBORw==",
          bodyEncoding: "base64",
        },
      },
    ]);
  });

  test("a base64 log or link is an attachment (cucumber writes them as text)", () => {
    expect(
      annotationsIn([
        attached({
          body: "YQ==",
          mediaType: "text/x.cucumber.log+plain",
          contentEncoding: AttachmentContentEncoding.BASE64,
        }),
      ]).map(({ type }) => type),
    ).toEqual(["attachment"]);
  });

  test("in order, other messages left out", () => {
    expect(
      annotationsIn([
        { testCase: { id: "case", pickleId: "pickle", testSteps: [] } },
        attached({ body: "first", mediaType: "text/x.cucumber.log+plain" }),
        {
          testStepStarted: {
            testCaseStartedId: "started",
            testStepId: "step",
            timestamp: { seconds: 0, nanos: 0 },
          },
        },
        attached({ body: "second", mediaType: "text/x.cucumber.log+plain" }),
      ]).map(({ message }) => message),
    ).toEqual(["first", "second"]);
  });

  test("none without attachments", () => {
    expect(annotationsIn([])).toEqual([]);
  });
});
