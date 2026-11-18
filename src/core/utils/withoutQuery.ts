// A module id or URL without its query (Vite's `?import`, `?t=…`, the plugin's own). Main's.

/** `id` up to its first `?`. */
export const withoutQuery = (id: string) => id.split("?")[0] ?? id;
