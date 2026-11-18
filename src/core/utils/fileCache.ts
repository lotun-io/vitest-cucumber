// What's made from one file's text, kept under the file while its text is the same: the caller
// gives the file, the text it read and how to make the value, and gets the kept value unless the
// text is another. Texts are compared by their SHA-256 hash, so the cache keeps a hash and not
// the text. For the work on a file that only its text decides (`../feature/plans.ts`: a feature
// file's tags and its parse; `../storybook/stories/supportSteps.ts`, a support file's Storybook
// steps; `../storybook/stories/storiesFile.ts`, a stories file's stories), so it's never wrong
// and never dropped but with its file. One entry per file. Main only (`node:crypto`).
import { createHash } from "node:crypto";

/** The hash of `text`. */
const digestOf = (text: string) =>
  createHash("sha256").update(text).digest("hex");

/** A cache of values of one kind: each file's value, kept while its text is the same. */
export const fileCache = <T>() => {
  const entries = new Map<string, { digest: string; value: T }>();
  /** `file`'s value: the kept one if it was made from `text`, else `make`'s, kept. */
  const valueOf = (file: string, text: string, make: () => T): T => {
    const digest = digestOf(text);
    const entry = entries.get(file);
    if (entry?.digest === digest) {
      return entry.value;
    }
    const value = make();
    entries.set(file, { digest, value });
    return value;
  };
  return Object.assign(valueOf, {
    /** Drops `file`'s entry (a deleted file). */
    drop: (file: string) => {
      entries.delete(file);
    },
    /** Drops every entry. */
    clear: () => {
      entries.clear();
    },
  });
};
