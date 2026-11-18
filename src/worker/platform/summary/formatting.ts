// The summary's pieces of text, as `@cucumber/pretty-formatter` 4.1.0 formats them (a copy of its
// `TextBuilder.ts`, `utils.ts`'s helpers and the `formatting/` functions the summary uses), styled
// through our styler (`./style.ts`) instead of Node's `util.styleText`. Left out, as the summary
// never uses them: status icons, attachments, durations, the styles cucumber's theme doesn't set
// (step text, data tables, doc strings). A location's path is the plugin's: `/` on every platform
// (`../../../utils/locateStacks.ts`). Page-safe.
import type {
  Hook,
  PickleDocString,
  PickleStep,
  PickleStepArgument,
  PickleTable,
  SourceReference,
  StepDefinition,
  TestStep,
  TestStepResult,
  TestStepResultStatus,
  UndefinedParameterType,
} from "@cucumber/messages";
import type { Style, Styler } from "./style.ts";
import type { Theme } from "./theme.ts";

/** Pretty-formatter's `TextBuilder`: text appended, each part in its style, then styled as a whole. */
class TextBuilder {
  private text = "";
  private readonly style: Styler;

  constructor(style: Styler) {
    this.style = style;
  }

  space() {
    this.text += " ";
    return this;
  }

  line() {
    this.text += "\n";
    return this;
  }

  append(value: string | number, style?: Style) {
    this.text += this.style(value.toString(), style);
    return this;
  }

  build(style?: Style, styleEachLine = false) {
    if (styleEachLine) {
      return this.text
        .split("\n")
        .map((line) => this.style(line, style))
        .join("\n");
    }
    return this.style(this.text, style);
  }
}

export const join = (...originals: (string | undefined)[]) =>
  originals.filter((part) => !!part).join(" ");

export const indent = (original: string, by: number) =>
  original
    .split("\n")
    .map((line) => " ".repeat(by) + line)
    .join("\n");

/** A result's message to show: a failure's stack, a pending or skipped step's message. */
export const extractReportableMessage = ({
  status,
  exception,
  message,
}: TestStepResult) => {
  if (status === "FAILED") {
    return exception?.stackTrace || exception?.message || message;
  }
  if (status === "PENDING" || status === "SKIPPED") {
    return exception?.message || message;
  }
  return undefined;
};

const stepText = (
  testStep: TestStep,
  pickleStep: PickleStep,
  theme: Theme,
  style: Styler,
) => {
  const builder = new TextBuilder(style);
  const lists = testStep.stepMatchArgumentsLists;
  if (lists && lists.length === 1) {
    let currentIndex = 0;
    for (const { group } of lists[0]?.stepMatchArguments ?? []) {
      // Ignore absent values, or groups without a start.
      if (group.value !== undefined && group.start !== undefined) {
        const text = pickleStep.text.slice(currentIndex, group.start);
        currentIndex = group.start + group.value.length;
        builder.append(text).append(group.value, theme.step.argument);
      }
    }
    if (currentIndex !== pickleStep.text.length) {
      builder.append(pickleStep.text.slice(currentIndex));
    }
  } else {
    builder.append(pickleStep.text);
  }
  return builder.build();
};

/** A step's keyword and text (its arguments in bold), in its status's color. */
export const formatStepTitle = (
  testStep: TestStep,
  pickleStep: PickleStep,
  keyword: string,
  status: TestStepResultStatus,
  theme: Theme,
  style: Styler,
) =>
  new TextBuilder(style)
    .append(
      new TextBuilder(style)
        .append(keyword, theme.step.keyword)
        // The keyword includes a trailing space.
        .append(stepText(testStep, pickleStep, theme, style))
        .build(theme.status.all[status]),
    )
    .build();

const formatDocString = (docString: PickleDocString, style: Styler) => {
  const builder = new TextBuilder(style).append('"""');
  if (docString.mediaType) {
    builder.append(docString.mediaType);
  }
  builder.line();
  // Doc strings are normalized to \n by Gherkin.
  for (const line of docString.content.split("\n")) {
    builder.append(line).line();
  }
  builder.append('"""');
  return builder.build(undefined, true);
};

const formatDataTable = (dataTable: PickleTable, style: Styler) => {
  const columnWidths: number[] = [];
  for (const row of dataTable.rows) {
    row.cells.forEach(({ value }, index) => {
      if (
        columnWidths[index] === undefined ||
        value.length > columnWidths[index]
      ) {
        columnWidths[index] = value.length;
      }
    });
  }
  const builder = new TextBuilder(style);
  dataTable.rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      builder.line();
    }
    builder.append("|");
    row.cells.forEach(({ value }, cellIndex) => {
      builder
        .append(` ${value.padEnd(columnWidths[cellIndex] ?? 0)} `)
        .append("|");
    });
  });
  return builder.build(undefined, true);
};

/** A step's data table or doc string (both: in their order). */
export const formatPickleStepArgument = (
  argument: PickleStepArgument,
  style: Styler,
) => {
  const { docString, dataTable } = argument;
  if (docString && dataTable) {
    // As pretty-formatter's (its `argumentIndex`, which no message has today).
    const indexOf = (part: object) =>
      (part as { argumentIndex?: number }).argumentIndex || -1;
    return indexOf(dataTable) < indexOf(docString)
      ? `${formatDataTable(dataTable, style)}\n${formatDocString(docString, style)}`
      : `${formatDocString(docString, style)}\n${formatDataTable(dataTable, style)}`;
  }
  if (docString) {
    return formatDocString(docString, style);
  }
  if (dataTable) {
    return formatDataTable(dataTable, style);
  }
  throw new Error("PickleStepArgument must have one of dataTable or docString");
};

/** `# <uri>:<line>`. */
export const formatSourceReference = (
  { uri, location }: SourceReference,
  theme: Theme,
  style: Styler,
) => {
  const builder = new TextBuilder(style)
    .append("#")
    .space()
    .append(uri ?? "(unknown)");
  if (location) {
    builder.append(":").append(location.line);
  }
  return builder.build(theme.location);
};

/** An ambiguous step's matching definitions. */
export const formatAmbiguousStep = (
  stepDefinitions: readonly StepDefinition[],
  theme: Theme,
  style: Styler,
) => {
  const builder = new TextBuilder(style).append(
    "Multiple matching step definitions found:",
  );
  for (const stepDefinition of stepDefinitions) {
    builder.line().append(`  ${theme.symbol.bullet || " "} `);
    if (stepDefinition.pattern.source) {
      builder.append(stepDefinition.pattern.source);
    }
    const location = formatSourceReference(
      stepDefinition.sourceReference,
      theme,
      style,
    );
    if (location) {
      builder.space().append(location);
    }
  }
  return builder.build(undefined, true);
};

const hookLabels: Record<string, string> = {
  BEFORE_TEST_RUN: "BeforeAll",
  AFTER_TEST_RUN: "AfterAll",
  BEFORE_TEST_CASE: "Before",
  AFTER_TEST_CASE: "After",
  BEFORE_TEST_STEP: "BeforeStep",
  AFTER_TEST_STEP: "AfterStep",
};

/** A hook's kind (and name), in its status's color. */
export const formatHookTitle = (
  hook: Hook | undefined,
  status: TestStepResultStatus,
  theme: Theme,
  style: Styler,
) => {
  const builder = new TextBuilder(style).append(
    hook?.type ? (hookLabels[hook.type] ?? "Hook") : "Hook",
    theme.step.keyword,
  );
  if (hook?.name) {
    builder.append(` (${hook.name})`);
  }
  return builder.build(theme.status.all[status]);
};

/** A result's message, each line in its status's color. */
export const formatError = (
  message: string,
  status: TestStepResultStatus,
  theme: Theme,
  style: Styler,
) =>
  new TextBuilder(style)
    .append(message.trim())
    .build(theme.status.all[status], true);

/** `text` in `status`'s color. */
export const formatForStatus = (
  status: TestStepResultStatus,
  text: string,
  theme: Theme,
  style: Styler,
) => new TextBuilder(style).append(text).build(theme.status.all[status]);

/** `Pending`, `Undefined`, … */
export const formatStatusName = (status: string) =>
  `${status.charAt(0).toUpperCase()}${status.slice(1).toLowerCase()}`;

export const formatUndefinedParameterType = ({
  name,
  expression,
}: UndefinedParameterType) => `'${name}' in '${expression}'`;
