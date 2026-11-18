// Storybook's preview in `storybook dev`: the events of the page's request to the dev server to map
// its definition calls' frames, and of its answer (Vite's HMR connection: `import.meta.hot.send`, the
// preset's `server.ws`). Main and the page.

/** The page's request (`LocateRequest`). */
export const locateEvent = "@lotun/vitest-cucumber:locate";

/** The dev server's answer (`LocateResponse`). */
export const locatedEvent = "@lotun/vitest-cucumber:located";
