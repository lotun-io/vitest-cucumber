// Cucumber's compatibility kit (`@cucumber/compatibility-kit`, the version cucumber 13.3.0 is tested
// against): its samples, their step definitions rewritten for cucumber and for a page, native
// cucumber's results read from its messages, and the comparison with what Vitest reported (each
// scenario's result: its last attempt's worst status, as the Vitest state the plugin should report;
// its attachments: media type, file name, content; whether the run fails). The steps that use them:
// `../steps/compatibility.ts`.
//
// The samples' steps are the kit's own, written for its reference implementation
// (`@cucumber/fake-cucumber`): their import is cucumber's, and its `ParameterType` cucumber's
// `defineParameterType`. A file the steps read next to themselves is read from the kit's folder. In
// a page, `node:assert` is a stand-in on Vitest's `expect`, and an attachment a string: a file the
// steps stream, or a `Buffer`, is its content in base64.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "../..");

/** The kit's samples' folder. */
const kit = path.join(
  repo,
  "node_modules/@cucumber/compatibility-kit/features",
);

/** The kit's samples, by name. */
export const samples = () => readdirSync(kit).sort();

/** A sample's `--retry`, if its arguments have one. */
export const retryOf = (sample: string) => {
  const file = path.join(kit, sample, `${sample}.arguments.txt`);
  const retry =
    existsSync(file) && /--retry (\d+)/.exec(readFileSync(file, "utf8"))?.[1];
  return retry ? Number(retry) : undefined;
};

/**
 * A constructor's parameter properties (`constructor(public readonly from: string) {}`) as fields
 * and assignments: Node strips types, it doesn't transform them (`parameter-types`'s `Flight`).
 */
const withoutParameterProperties = (code: string) =>
  code.replaceAll(
    /constructor\(([^)]*\b(?:public|private|protected|readonly)\b[^)]*)\)\s*\{\}/g,
    (_, parameters: string) => {
      const names = [
        ...parameters.matchAll(
          /(?:public|private|protected|readonly)\s+(?:readonly\s+)?(\w+)\s*:\s*([^,]+)/g,
        ),
      ].map(([, name = "", type = ""]) => ({ name, type: type.trim() }));
      return [
        ...names.map(({ name, type }) => `readonly ${name}: ${type}`),
        `constructor(${names.map(({ name, type }) => `${name}: ${type}`).join(", ")}) {`,
        ...names.map(({ name }) => `  this.${name} = ${name}`),
        "}",
      ].join("\n  ");
    },
  );

/**
 * A sample's step definitions, for cucumber: its import and `ParameterType` cucumber's, and no
 * syntax Node can't strip. An import of fake-cucumber the rewrite missed (another quote, a path)
 * fails here, not in the run.
 */
const forCucumber = (code: string, file: string) => {
  const rewritten = withoutParameterProperties(code)
    .replaceAll("'@cucumber/fake-cucumber'", "'@cucumber/cucumber'")
    .replaceAll(/\bParameterType\b/g, "defineParameterType");
  if (rewritten.includes("fake-cucumber")) {
    throw new Error(`${file}: an import of fake-cucumber left`);
  }
  return rewritten;
};

/**
 * For a page, where an attachment is a string: a file the steps stream
 * (`fs.createReadStream(`${import.meta.dirname}/…`)`) as its content in base64, inlined, its
 * media type `base64:…`; a `Buffer` of bytes the same (`btoa`); no `node:fs`. No `node:assert`
 * either: a stand-in on Vitest's `expect`.
 */
const forPage = (code: string, dir: string) =>
  code
    // Each rewrite on as many lines as it replaces: the definitions keep their lines.
    .replace(
      /^import assert from 'node:assert'$/m,
      'import { expect } from "vitest"; const assert = Object.assign((value: unknown, message?: string) => expect(value, message).toBeTruthy(), { ok: (value: unknown, message?: string) => expect(value, message).toBeTruthy(), equal: (actual: unknown, expected: unknown) => expect(actual).toBe(expected), strictEqual: (actual: unknown, expected: unknown) => expect(actual).toBe(expected), deepEqual: (actual: unknown, expected: unknown) => expect(actual).toEqual(expected), deepStrictEqual: (actual: unknown, expected: unknown) => expect(actual).toStrictEqual(expected) });',
    )
    .replaceAll(
      /fs\.createReadStream\(`\$\{import\.meta\.dirname\}\/([^`]+)`\),(\s*)(\{\s*mediaType:\s*)?'/g,
      (_, file: string, space: string, options = "") =>
        `"${readFileSync(path.join(dir, file)).toString("base64")}",${space}${options}'base64:`,
    )
    .replace(
      /const buffer = Buffer\.from\(data\)(\s*)await this\.attach\(buffer, mediaType\)/,
      (_, space: string) =>
        `const buffer = null;${space}await this.attach(btoa(String.fromCharCode(...data)), \`base64:\${mediaType}\`)`,
    )
    .replace(/^import fs from 'node:fs'$/m, "");

/** A sample's files: its feature files, and its step definitions for cucumber and for a page. */
export const sampleFiles = (sample: string) => {
  const source = path.join(kit, sample);
  const features: { name: string; content: string }[] = [];
  const steps: { name: string; node: string; page: string }[] = [];
  for (const name of readdirSync(source)) {
    const file = path.join(source, name);
    if (/\.feature(\.md)?$/.test(name)) {
      features.push({ name, content: readFileSync(file, "utf8") });
    } else if (name.endsWith(".ts")) {
      const code = forCucumber(readFileSync(file, "utf8"), file);
      steps.push({
        name,
        // The files it reads, the kit's own (with `/`: a path in a template literal).
        node: code.replaceAll(
          "${import.meta.dirname}",
          source.replaceAll("\\", "/"),
        ),
        page: forPage(code, source),
      });
    }
  }
  return { features, steps };
};

/** Cucumber's statuses, least severe first. */
const severity = [
  "UNKNOWN",
  "PASSED",
  "SKIPPED",
  "PENDING",
  "UNDEFINED",
  "AMBIGUOUS",
  "FAILED",
];

/** An attachment to compare: its media type, its file name if named, its content as base64. */
interface Compared {
  mediaType: string;
  fileName?: string;
  base64: string;
}

const describeAttachment = ({ mediaType, fileName, base64 }: Compared) =>
  `${mediaType}${fileName ? ` ${fileName}` : ""} (${String(Buffer.from(base64, "base64").length)} B)`;

/** A scenario native cucumber ran: its last attempt's worst status, its attachments. */
interface NativeScenario {
  name: string;
  uri: string;
  line: number;
  status: string;
  attempts: number;
  attachments: Compared[];
}

/** Each scenario in native cucumber's messages. */
export const nativeResults = (ndjson: string): NativeScenario[] => {
  const pickles = new Map<
    string,
    { name: string; uri: string; line: number }
  >();
  const testCases = new Map<string, string>();
  const started = new Map<string, string>();
  const results = new Map<string, { status: string; attempts: number }>();
  const attachments = new Map<string, Compared[]>();
  for (const line of ndjson.split("\n").filter(Boolean)) {
    const { pickle, testCase, testCaseStarted, testStepFinished, attachment } =
      JSON.parse(line);
    if (pickle) {
      pickles.set(pickle.id, {
        name: pickle.name,
        // Cucumber's own, with the system's separators (`\` on Windows).
        uri: pickle.uri.split(path.sep).join("/"),
        line: pickle.location?.line,
      });
    }
    if (testCase) {
      testCases.set(testCase.id, testCase.pickleId);
    }
    if (testCaseStarted) {
      const pickleId = testCases.get(testCaseStarted.testCaseId) ?? "";
      started.set(testCaseStarted.id, pickleId);
      // A new attempt starts over.
      results.set(pickleId, {
        status: "PASSED",
        attempts: testCaseStarted.attempt + 1,
      });
      attachments.set(pickleId, []);
    }
    if (testStepFinished) {
      const result = results.get(
        started.get(testStepFinished.testCaseStartedId) ?? "",
      );
      if (!result) {
        throw new Error(
          "A test step finished in a test case that never started",
        );
      }
      const status = testStepFinished.testStepResult.status;
      if (severity.indexOf(status) > severity.indexOf(result.status)) {
        result.status = status;
      }
    }
    if (attachment?.testCaseStartedId) {
      attachments.get(started.get(attachment.testCaseStartedId) ?? "")?.push({
        mediaType: attachment.mediaType,
        ...(attachment.fileName && { fileName: attachment.fileName }),
        base64:
          attachment.contentEncoding === "BASE64"
            ? attachment.body
            : Buffer.from(attachment.body).toString("base64"),
      });
    }
  }
  return [...pickles].map(([id, pickle]) => ({
    ...pickle,
    ...(results.get(id) ?? { status: "NOT RUN", attempts: 0 }),
    attachments: attachments.get(id) ?? [],
  }));
};

/** The Vitest state the plugin should report for a native status (`strict`, the default). */
const expectedState = (status: string) =>
  status === "PASSED"
    ? "passed"
    : status === "SKIPPED" || status === "NOT RUN"
      ? "skipped"
      : "failed";

/** A test Vitest reported: its feature file, its scenario's name, its state, its attachments. */
interface PluginScenario {
  uri: string;
  name: string;
  state: string;
  attachments: (Compared & { message: string })[];
}

/** An annotation, as the attachment it stands for (a log's or a link's: its text). */
export const attachmentOf = (
  {
    type,
    message,
    contentType,
  }: { type: string; message: string; contentType?: string },
  content: string | undefined,
): Compared & { message: string } =>
  type === "log" || type === "link"
    ? {
        mediaType:
          type === "log" ? "text/x.cucumber.log+plain" : "text/uri-list",
        base64: Buffer.from(message).toString("base64"),
        message,
      }
    : { mediaType: contentType ?? "", base64: content ?? "", message };

/**
 * The differences between native cucumber's run and the plugin's (none if the plugin reports what
 * cucumber does), and the comparison as a report (Markdown).
 */
export const compare = (
  title: string,
  native: { exitCode: number; scenarios: NativeScenario[] },
  plugin: { exitCode: number; scenarios: PluginScenario[] },
) => {
  const differences: string[] = [];
  if ((native.exitCode === 0) !== (plugin.exitCode === 0)) {
    differences.push(
      `exit: native ${String(native.exitCode)}, plugin ${String(plugin.exitCode)}`,
    );
  }
  const tests = [...plugin.scenarios];
  const rows: string[] = [];
  for (const scenario of native.scenarios) {
    const index = tests.findIndex(
      ({ uri, name }) => uri === scenario.uri && name === scenario.name,
    );
    const [found] = index === -1 ? [] : tests.splice(index, 1);
    const stateAgrees = found?.state === expectedState(scenario.status);
    const pluginAttachments = found?.attachments ?? [];
    const attachmentDifferences = [
      ...scenario.attachments.flatMap((expected, at) => {
        const actual = pluginAttachments[at];
        return actual !== undefined &&
          actual.mediaType === expected.mediaType &&
          actual.base64 === expected.base64 &&
          (expected.fileName === undefined ||
            actual.message === expected.fileName)
          ? []
          : [
              `#${String(at + 1)}: ${describeAttachment(expected)} → ${actual ? describeAttachment(actual) : "missing"}`,
            ];
      }),
      ...pluginAttachments
        .slice(scenario.attachments.length)
        .map(
          (extra, at) =>
            `extra #${String(scenario.attachments.length + at + 1)}: ${describeAttachment(extra)}`,
        ),
    ];
    const name = `${scenario.uri}:${String(scenario.line)} ${scenario.name}`;
    if (!stateAgrees) {
      differences.push(
        `${name}: native ${scenario.status}, plugin ${found?.state ?? "(no test)"}`,
      );
    }
    if (attachmentDifferences.length > 0) {
      differences.push(
        `${name}: attachments ${attachmentDifferences.join("; ")}`,
      );
    }
    const attachmentsCell =
      scenario.attachments.length + pluginAttachments.length === 0
        ? ""
        : attachmentDifferences.length === 0
          ? `✓ ${String(scenario.attachments.length)}`
          : `**✗** ${attachmentDifferences.join("; ")}`;
    rows.push(
      `| ${name} | ${scenario.status} | ${String(scenario.attempts)} | ${found?.state ?? "(no test)"} | ${stateAgrees ? "✓" : "**✗**"} | ${attachmentsCell} |`,
    );
  }
  for (const extra of tests) {
    differences.push(`${extra.uri} ${extra.name}: no such scenario`);
    rows.push(
      `| ${extra.uri} ${extra.name} | (no scenario) | | ${extra.state} | **✗** | |`,
    );
  }
  const report = [
    `# ${title}`,
    "",
    `Exit: native ${String(native.exitCode)}, plugin ${String(plugin.exitCode)}`,
    "",
    "| scenario | native | attempts | plugin | | attachments |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
  return { differences, report };
};

/** Keys left out of a message (cucumber-js's compatibility check leaves them out too). */
const ignoredKeys = new Set([
  "timestamp",
  "duration",
  "workerId",
  // An error's text and stack: its frames are each runtime's own (its type and message stay).
  "stackTrace",
]);

/**
 * A snippet's code with its function an arrow function: the plugin writes a step's snippet that
 * way (`src/worker/runner/suggestion.ts`), cucumber as a `function`. The rest of it is compared
 * as it is: its expression, its parameters, its body.
 */
const asArrowSnippet = (code: string) =>
  code.replace(/', function \(([^)]*)\) \{\n/, "', ($1) => {\n");

/**
 * Whether `key` holds an id or ids (`id`, `pickleId`, `astNodeIds`, …): each implementation's own
 * values, compared as numbers (see `withIdsNumbered`). Not `workerId`, each runtime's own.
 */
const isId = (key: string) => key !== "workerId" && /^id$|Ids?$/.test(key);

/**
 * A stream with each id as the number of its first appearance (`#1`, `#2`, …), where it's given
 * and wherever a message refers to it: two streams whose messages are linked alike read alike,
 * whatever ids each implementation gives. A message's keys are read in their sorted order (each
 * implementation writes them in its own).
 */
const withIdsNumbered = (envelopes: readonly object[]) => {
  const numbers = new Map<string, string>();
  const numberOf = (id: string) => {
    const known = numbers.get(id);
    if (known) {
      return known;
    }
    const number = `#${String(numbers.size + 1)}`;
    numbers.set(id, number);
    return number;
  };
  const numbered = (value: unknown, key = ""): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => numbered(item, key));
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, item]) => [name, numbered(item, name)]),
      );
    }
    return typeof value === "string" && isId(key) ? numberOf(value) : value;
  };
  return envelopes.map((envelope) => numbered(envelope));
};

/** A message's value, as compared: times and frames left out (see `ignoredKeys`). */
const normalized = (value: unknown, key = "", inPage = false): unknown => {
  if (typeof value === "string") {
    return value.replaceAll("\\", "/");
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalized(item, "", inPage));
  }
  if (value !== null && typeof value === "object") {
    // Keys sorted: the same message, whatever order each implementation writes its keys in.
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([name, item]) => {
          if (ignoredKeys.has(name)) {
            return [];
          }
          // A result's message is its error, formatted with its stack (a step's, a BeforeAll's
          // or an AfterAll's).
          if (
            (key === "testStepResult" || key === "result") &&
            name === "message"
          ) {
            return [];
          }
          // In a page, an assertion's message is the kit's `node:assert` stand-in's (Vitest's
          // `expect`), not Node's: its type and its step's status still compared.
          if (inPage && key === "exception" && name === "message") {
            return [];
          }
          // An undefined step's snippet: cucumber's `function` as the plugin's arrow function.
          if (name === "code" && typeof item === "string") {
            return [[name, normalized(asArrowSnippet(item), name, inPage)]];
          }
          // A definition's file: its name (a page loads the steps' page copy, `steps-page/`).
          if (key === "sourceReference" && name === "uri") {
            return [[name, String(item).split(/[\\/]/).at(-1)]];
          }
          return [[name, normalized(item, name, inPage)]];
        }),
    );
  }
  return value;
};

/**
 * A stream's messages as compared: `meta` left out (each implementation's own), its ids numbered
 * (see `withIdsNumbered`), each normalized.
 */
const comparable = (envelopes: readonly object[], inPage: boolean) =>
  withIdsNumbered(envelopes.filter((envelope) => !("meta" in envelope))).map(
    (envelope) => JSON.stringify(normalized(envelope, "", inPage)),
  );

/**
 * Cucumber's stream with each test case where the plugin's has it: just before its first
 * `testCaseStarted` (cucumber sends every test case before any runs; the plugin, a scenario's as it
 * runs). A test case that never starts stays where it is.
 */
const testCasesAsStreamed = (envelopes: readonly object[]) => {
  const testCases = new Map<string, object>();
  for (const envelope of envelopes) {
    if ("testCase" in envelope) {
      testCases.set((envelope.testCase as { id: string }).id, envelope);
    }
  }
  const started = new Set(
    envelopes.flatMap((envelope) =>
      "testCaseStarted" in envelope
        ? [(envelope.testCaseStarted as { testCaseId: string }).testCaseId]
        : [],
    ),
  );
  return envelopes.flatMap((envelope) => {
    if ("testCase" in envelope) {
      return started.has((envelope.testCase as { id: string }).id)
        ? []
        : [envelope];
    }
    if ("testCaseStarted" in envelope) {
      const { testCaseId } = envelope.testCaseStarted as { testCaseId: string };
      const testCase = testCases.get(testCaseId);
      testCases.delete(testCaseId);
      return testCase ? [testCase, envelope] : [envelope];
    }
    return [envelope];
  });
};

/**
 * A stream with its test cases (each from its `testCase` to the next, attempts and all) in their
 * feature files' order, each file's in the order they ran: Vitest chooses which file runs first,
 * cucumber runs them in its own order.
 */
const testCasesByFeature = (envelopes: readonly object[]) => {
  const uris = new Map(
    envelopes.flatMap((envelope) =>
      "pickle" in envelope
        ? [
            [
              (envelope.pickle as { id: string }).id,
              (envelope.pickle as { uri: string }).uri,
            ] as const,
          ]
        : [],
    ),
  );
  const head: object[] = [];
  const testCases: { uri: string; envelopes: object[] }[] = [];
  const tail: object[] = [];
  for (const envelope of envelopes) {
    if (tail.length > 0 || (testCases.length > 0 && !inTestCase(envelope))) {
      tail.push(envelope);
    } else if ("testCase" in envelope) {
      const { pickleId } = envelope.testCase as { pickleId: string };
      testCases.push({ uri: uris.get(pickleId) ?? "", envelopes: [envelope] });
    } else if (testCases.length > 0) {
      testCases.at(-1)?.envelopes.push(envelope);
    } else {
      head.push(envelope);
    }
  }
  return [
    ...head,
    ...testCases
      .sort((a, b) => a.uri.localeCompare(b.uri))
      .flatMap(({ envelopes: own }) => own),
    ...tail,
  ];
};

/** Whether `envelope` is a test case's (not the run's AfterAll's, nor its end). */
const inTestCase = (envelope: object) =>
  !(
    "testRunHookStarted" in envelope ||
    "testRunHookFinished" in envelope ||
    "testRunFinished" in envelope
  );

/**
 * The differences between native cucumber's messages and the plugin's, message by message, after
 * numbering each's ids (see `withIdsNumbered`) and normalizing both (see `normalized`), cucumber's test cases where the plugin sends them (see
 * `testCasesAsStreamed`), both's in their feature files' order (see `testCasesByFeature`): none if
 * the plugin's stream is cucumber's.
 */
export const compareMessages = (
  native: readonly object[],
  plugin: readonly object[],
  { inPage }: { inPage: boolean },
) => {
  const expected = comparable(
    testCasesByFeature(testCasesAsStreamed(native)),
    inPage,
  );
  const actual = comparable(testCasesByFeature(plugin), inPage);
  const differences: string[] = [];
  for (let at = 0; at < Math.max(expected.length, actual.length); at++) {
    if (expected[at] !== actual[at]) {
      differences.push(
        `message #${String(at + 1)}:\n  native ${expected[at] ?? "(none)"}\n  plugin ${actual[at] ?? "(none)"}`,
      );
    }
  }
  return differences;
};
