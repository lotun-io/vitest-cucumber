// The plugin's own modules by path, for whatever loads them that way (Vitest, Vite). Names are paths
// from `src/`; built, the same layout is under `dist/` as `.mjs`. Node only.
import path from "node:path";

/** The plugin's modules' root: its `src/`, or built, its `dist/` (this module is in `core/utils/`). */
export const ownRoot = path.join(import.meta.dirname, "..", "..");

/** The absolute path of module `name` (e.g. `worker/feature/runtime`). */
export const ownModule = (name: string) =>
  path.join(ownRoot, `${name}${path.extname(import.meta.filename)}`);
