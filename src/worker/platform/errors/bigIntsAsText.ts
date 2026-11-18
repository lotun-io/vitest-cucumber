// A page's errors with their BigInts as text: Vitest's browser RPC is JSON (flatted), which has none, so a
// BigInt anywhere in a test's error loses its file's results (a Vitest bug; node mode's workers carry
// them). On the host's own copy (`./serializedErrors.ts`'s `transform`: before an assertion's
// `expected` and `actual` are the user's originals again, which Vitest prints itself before sending),
// in place: each BigInt as its text (`10n`, as Vitest prints one). `visited`: each object done once
// (the copies keep cycles and shared objects, which flatted carries). Plain loops: one stack frame
// per level. Page-safe.

/** `value` with its BigInts as text (an object: in place). */
const asText = (value: unknown, visited: WeakSet<object>): unknown => {
  if (typeof value === "bigint") {
    return `${String(value)}n`;
  }
  if (typeof value !== "object" || value === null || visited.has(value)) {
    return value;
  }
  visited.add(value);
  for (const key of Object.keys(value)) {
    Reflect.set(value, key, asText(Reflect.get(value, key), visited));
  }
  return value;
};

/** A copy with its BigInts as text, in place. */
export const bigIntsAsText = (copy: unknown): unknown =>
  asText(copy, new WeakSet());
