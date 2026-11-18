// A page's support code, imported (browser mode's pages, and Storybook's: story tests and its
// preview): the page's cucumber given its version first (main's: the page has no cucumber of its
// own). Page only.
import type { ImportSupport } from "../../types/feature.ts";
import { setVersion } from "../cucumber/page.ts";

export const importPageSupport = async (
  version: string,
  importSupport: ImportSupport,
) => {
  setVersion(version);
  await importSupport();
};
