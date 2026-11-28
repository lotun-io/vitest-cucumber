import { expect, test } from "vitest";
import { slash } from "../../../utils/slash.ts";
import { ownRoot } from "../../utils/ownModule.ts";
import { serveOwnFiles } from "../servedOwnFiles.ts";

test("the plugin's own folder is added to Vite's resolved `server.fs.allow`, once, after what it has", () => {
  const config = { server: { fs: { allow: ["/workspace"] } } };
  serveOwnFiles(config);
  serveOwnFiles(config);
  expect(config.server.fs.allow).toEqual(["/workspace", slash(ownRoot)]);
});
