import type { TestContext } from "vitest";
import { describe, test, TestRunner } from "vitest";
import { createError } from "./createError.ts";
import type { ResultItem, Results } from "./runCucumber.ts";

type ScenarioGroup = {
  scenarioId: string | undefined;
  scenarioName: string | null;
  scenarioLine: number | undefined;
  isOutline: boolean;
  items: ResultItem[];
};

const setLocation = (obj: object, line: number | undefined) => {
  if (line !== undefined) {
    (obj as { location?: { line: number; column: number } }).location = {
      line,
      column: 1,
    };
  }
};

export const annotateAttachments = async (
  ctx: Pick<TestContext, "annotate">,
  result: ResultItem,
) => {
  for (const attachment of result.attachments ?? []) {
    const isText = attachment.contentEncoding !== "BASE64";
    const suffix = isText
      ? `: ${attachment.body}`
      : attachment.fileName
        ? `: ${attachment.fileName}`
        : "";
    await ctx.annotate(`Attachment (${attachment.mediaType})${suffix}`, {
      body: attachment.body,
      contentType: attachment.mediaType,
      bodyEncoding: isText ? "utf-8" : "base64",
    });
  }
};

const registerTests = ({ id, group }: { id: string; group: ScenarioGroup }) => {
  for (const result of group.items) {
    test(
      result.name ?? "Unknown",
      async ({ skip, annotate }) => {
        await result.resolvers?.promise;
        await annotateAttachments({ annotate }, result);
        if (result.status === "SKIPPED") {
          skip();
          return;
        }
        if (result.status !== "PASSED") {
          throw createError({ id, result });
        }
      },
      0,
    );
    const line = group.isOutline
      ? result.lineage?.example?.location?.line
      : result.lineage?.scenario?.location?.line;
    const collector = TestRunner.getCurrentSuite();
    setLocation(collector.tasks[collector.tasks.length - 1] ?? {}, line);
  }
};

export type RegisterFeatureTestsParams = {
  id: string;
  featureName: string;
  results: Results;
};

export const registerWorkerCleanup = ({
  onCleanup: cleanupFn,
}: {
  onCleanup: () => void | Promise<void>;
}) => {
  const cleanupTest = test.extend(
    "hooks",
    { scope: "worker", auto: true },
    ({}, { onCleanup }) => {
      onCleanup(cleanupFn);
    },
  );
  cleanupTest.afterAll(() => null);
};

export const registerFeatureTests = ({
  id,
  featureName,
  results,
}: RegisterFeatureTestsParams): void => {
  if (results.size === 0) {
    test(featureName, ({ skip }) => {
      skip();
    });
    return;
  }
  describe(featureName, () => {
    const ruleGroups: { ruleName: string | null; items: ResultItem[] }[] = [];
    for (const result of results.values()) {
      const ruleName = result.lineage?.rule?.name ?? null;
      const last = ruleGroups.at(-1);
      if (last && last.ruleName === ruleName) {
        last.items.push(result);
      } else {
        ruleGroups.push({ ruleName, items: [result] });
      }
    }

    for (const { ruleName, items } of ruleGroups) {
      const defineTests = () => {
        // Sub-group consecutive outline examples by their scenario
        const scenarioGroups: ScenarioGroup[] = [];
        for (const result of items) {
          const isOutline = Boolean(result.lineage?.examples);
          const scenarioId = isOutline
            ? result.lineage?.scenario?.id
            : undefined;
          const last = scenarioGroups.at(-1);
          if (
            last &&
            scenarioId !== undefined &&
            last.scenarioId === scenarioId
          ) {
            last.items.push(result);
          } else {
            scenarioGroups.push({
              scenarioId,
              scenarioName: isOutline
                ? (result.lineage?.scenario?.name ?? null)
                : null,
              scenarioLine: result.lineage?.scenario?.location?.line,
              isOutline,
              items: [result],
            });
          }
        }

        for (const group of scenarioGroups) {
          if (group.isOutline && group.scenarioName !== null) {
            describe(group.scenarioName, () => {
              setLocation(
                TestRunner.getCurrentSuite().suite ?? {},
                group.scenarioLine,
              );
              registerTests({ id, group });
            });
          } else {
            registerTests({ id, group });
          }
        }
      };

      if (ruleName === null) {
        defineTests();
      } else {
        describe(ruleName, defineTests);
      }
    }
  });
};
