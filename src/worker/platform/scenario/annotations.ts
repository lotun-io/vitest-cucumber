// A scenario's attachments, logs and links (cucumber's `attachment` messages, from `this.attach`,
// `this.log` and `this.link`) as Vitest's annotations of its test, in order. Vitest's terminal
// reporters print an annotation's message (the default reporter a failed test's only), the others
// (JUnit, HTML, UI, a custom reporter) its attachment too. Page-safe.
import type { Annotation } from "../../../types/platform.ts";
import type { Query } from "../../../types/query.ts";

/** Cucumber's media types for `this.log` and `this.link`. */
const LOG = "text/x.cucumber.log+plain";
const LINK = "text/uri-list";

/**
 * Each attachment in a run's messages: a log (`log`) or a link (`link`) as its text; any other as
 * `attachment`, its message the file name, else its media type (never its data, which a terminal
 * would print whole), with the attachment itself.
 */
export const annotationsOf = (query: Query): Annotation[] =>
  query
    .attachments()
    .map(({ body, contentEncoding, mediaType, fileName }): Annotation => {
      const text = contentEncoding === "IDENTITY";
      if (text && mediaType === LOG) {
        return { message: body, type: "log" };
      }
      if (text && mediaType === LINK) {
        return { message: body, type: "link" };
      }
      return {
        message: fileName ?? mediaType,
        type: "attachment",
        attachment: {
          contentType: mediaType,
          body,
          bodyEncoding: text ? "utf-8" : "base64",
        },
      };
    });
