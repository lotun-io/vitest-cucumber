// A path with `/` on every platform (Windows' `\\` made `/`), as Vite and Vitest write paths.
// Page-safe.

/** `file` with `/`. */
export const slash = (file: string) => file.replaceAll("\\", "/");
