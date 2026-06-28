export interface SerializedError {
  message: string;
  stack?: string;
  name?: string;
  [key: string]: unknown;
}

export const serializeError = (err: unknown): SerializedError => {
  if (typeof err !== "object" || err === null) {
    return { message: String(err) };
  }

  const e = err as Error;
  const serialized: SerializedError = {
    message: typeof e.message === "string" ? e.message : String(err),
  };
  if (typeof e.stack === "string") {
    serialized.stack = e.stack;
  }
  if (typeof e.name === "string") {
    serialized.name = e.name;
  }

  for (const [key, value] of Object.entries(e)) {
    if (key in serialized) {
      continue;
    }
    try {
      structuredClone(value);
      serialized[key] = value;
    } catch {
      // Non-serializable (function, symbol, …) — skip it.
    }
  }

  return serialized;
};
