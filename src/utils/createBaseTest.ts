import { test as baseTest } from "vitest";

export type TestAPI = ReturnType<typeof createBaseTest>;

export const createBaseTest = ({
  onCleanup: cleanupFn,
}: {
  onCleanup: () => void | Promise<void>;
}) => {
  return baseTest.extend(
    "hooks",
    { scope: "worker", auto: true },
    ({}, { onCleanup }) => {
      onCleanup(cleanupFn);
    },
  );
};
