// The plugin's own files, served to a page wherever the plugin is: its folder added to Vite's
// `server.fs.allow`, after Vite resolved it (its default, the workspace root, kept; setting `allow`
// in a config would replace it). Vitest asks for a setup file by its path, which Vite serves only
// inside `allow`: the plugin's setup file (`../../worker/platform/setupFile.ts`) is outside it
// where the plugin isn't in the project's workspace (linked from elsewhere, or a monorepo package's
// own workspace without it). The plugin's other page modules are imported by modules Vite
// transformed, which it serves wherever they are. Main's.
import { slash } from "../../utils/slash.ts";
import { ownRoot } from "../utils/ownModule.ts";

/** Adds the plugin's own folder to a resolved config's `server.fs.allow` (once). */
export const serveOwnFiles = (config: {
  server: { fs: { allow: string[] } };
}) => {
  const own = slash(ownRoot);
  if (!config.server.fs.allow.includes(own)) {
    config.server.fs.allow.push(own);
  }
};
