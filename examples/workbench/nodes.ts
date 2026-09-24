import { NodeRegistry } from "../../src/core/index.ts";
import type {
  JsonValue,
  NodeDefinition,
  PortDefinition,
} from "../../src/core/index.ts";
import type { EditorExtension, NodePresentation } from "../../src/index.ts";
import { Runner, SKIP } from "../../src/runtime/index.ts";

const input = (
  id: string,
  dataType: string,
  extra: Partial<PortDefinition> = {},
): PortDefinition => ({ id, dataType, direction: "input", ...extra });
const output = (id: string, dataType: string): PortDefinition => ({
  id,
  dataType,
  direction: "output",
});
export const orders = [
  { id: 1041, customer: "Oliver", total: 65 },
  { id: 1042, customer: "Ana", total: 180 },
  { id: 1043, customer: "Noah", total: 90 },
  { id: 1044, customer: "Luis", total: 240 },
  { id: 1045, customer: "Emma", total: 45 },
  { id: 1046, customer: "Maya", total: 125 },
];
const definitions: NodeDefinition[] = [
  {
    type: "orders",
    title: "Sample orders",
    category: "Sources",
    description: "A small, local dataset. No network requests.",
    defaults: { dataset: "orders" },
    ports: [output("orders", "records")],
  },
  {
    type: "filter",
    title: "Filter orders",
    category: "Transform",
    description: "Keep records that match a numeric rule.",
    defaults: { field: "total", rule: "greater", minimum: 100, enabled: true },
    ports: [input("orders", "records"), output("matches", "records")],
    validate: (data) => {
      if (!Number.isFinite(data.minimum)) {
        throw new Error("Minimum must be a finite number");
      }
    },
  },
  {
    type: "map",
    title: "Map fields",
    category: "Transform",
    description: "Choose the fields to include in each record.",
    defaults: { fields: "id, customer, total" },
    ports: [input("rows", "records"), output("mapped", "records")],
  },
  {
    type: "table",
    title: "Table output",
    category: "Outputs",
    description: "View incoming records in the output panel.",
    ports: [input("rows", "records")],
  },
  {
    type: "trigger",
    title: "Manual trigger",
    category: "Sources",
    description: "An explicit application event starts this flow.",
    defaults: { message: "New order received" },
    ports: [output("event", "event")],
  },
  {
    type: "condition",
    title: "Condition",
    category: "Transform",
    description: "Choose which branch should run.",
    defaults: { approved: true },
    ports: [
      input("event", "event"),
      output("yes", "event"),
      output("no", "event"),
    ],
  },
  {
    type: "delay",
    title: "Wait briefly",
    category: "Transform",
    description: "An asynchronous step that supports cancellation.",
    defaults: { milliseconds: 350 },
    ports: [input("event", "event"), output("done", "event")],
  },
  {
    type: "message",
    title: "Log message",
    category: "Outputs",
    description: "Write a message to the local run log.",
    defaults: { message: "Order approved" },
    ports: [input("event", "event")],
  },
  {
    type: "number",
    title: "Number",
    category: "Sources",
    defaults: { value: 12 },
    ports: [output("value", "number")],
  },
  {
    type: "math",
    title: "Calculate",
    category: "Transform",
    defaults: { operation: "multiply", b: 2 },
    ports: [
      input("a", "number"),
      input("b", "number", { required: false, defaultValue: 2 }),
      output("value", "number"),
    ],
  },
  {
    type: "result",
    title: "Result",
    category: "Outputs",
    ports: [input("value", "number")],
  },
  {
    type: "step",
    title: "Process step",
    category: "Diagram",
    defaults: { description: "Describe this step" },
    ports: [
      input("in", "any", { required: false, multiple: true }),
      output("out", "any"),
    ],
  },
  {
    type: "decision",
    title: "Decision",
    category: "Diagram",
    defaults: { description: "Ready to continue?" },
    ports: [
      input("in", "any", { required: false, multiple: true }),
      output("yes", "any"),
      output("no", "any"),
    ],
  },
  {
    type: "controls",
    title: "Control gallery",
    category: "Explore",
    defaults: {
      title: "Hello, canvas",
      notes: "Native text input.\nCanvas rendering.",
      count: 24,
      enabled: true,
      gain: 65,
      mode: "balanced",
      rating: 4,
    },
    ports: [input("in", "any", { required: false }), output("out", "any")],
  },
  {
    type: "benchmark",
    title: "Node",
    category: "Explore",
    defaults: {},
    ports: [
      input("in", "any", { required: false, multiple: true }),
      output("out", "any"),
    ],
  },
];
export const presentations: NodePresentation[] = [
  {
    type: "orders",
    icon: "database",
    color: "#70aef9",
    width: 244,
    summary: () => "6 records",
    controls: [
      {
        id: "dataset",
        key: "dataset",
        kind: "select",
        label: "Dataset",
        options: [{ label: "Orders", value: "orders" }],
      },
    ],
  },
  {
    type: "filter",
    icon: "filter",
    width: 252,
    controls: [
      {
        id: "field",
        key: "field",
        kind: "select",
        label: "Field",
        options: [
          { label: "total", value: "total" },
          { label: "id", value: "id" },
        ],
      },
      {
        id: "rule",
        key: "rule",
        kind: "select",
        label: "Rule",
        options: [
          { label: "Greater than", value: "greater" },
          { label: "Less than", value: "less" },
          { label: "Equal to", value: "equal" },
        ],
      },
      {
        id: "minimum",
        key: "minimum",
        kind: "number",
        label: "Minimum",
        step: 1,
      },
      { id: "enabled", key: "enabled", kind: "toggle", label: "Enabled" },
    ],
  },
  {
    type: "map",
    icon: "map",
    width: 248,
    portLayout: "row",
    controls: [{ id: "fields", key: "fields", kind: "text", label: "Fields" }],
  },
  {
    type: "table",
    icon: "table",
    width: 240,
    portLayout: "row",
    color: "#74c994",
    summary: (_, result) =>
      result?.status === "completed"
        ? `${
          (result.outputs.rows as unknown[] | undefined)?.length ?? 0
        } matching orders`
        : "Ready for records",
  },
  {
    type: "trigger",
    icon: "bolt",
    color: "#efc574",
    controls: [
      { id: "message", key: "message", kind: "text", label: "Event message" },
    ],
  },
  {
    type: "condition",
    icon: "filter",
    controls: [
      {
        id: "approved",
        key: "approved",
        kind: "toggle",
        label: "Approve order",
      },
    ],
  },
  {
    type: "delay",
    icon: "bolt",
    controls: [
      {
        id: "milliseconds",
        key: "milliseconds",
        kind: "number",
        label: "Milliseconds",
        min: 0,
        max: 5000,
      },
    ],
  },
  {
    type: "message",
    icon: "table",
    color: "#74c994",
    controls: [
      { id: "message", key: "message", kind: "text", label: "Message" },
    ],
  },
  {
    type: "number",
    icon: "number",
    controls: [{ id: "value", key: "value", kind: "number", label: "Value" }],
  },
  {
    type: "math",
    icon: "code",
    controls: [
      {
        id: "operation",
        key: "operation",
        kind: "select",
        label: "Operation",
        options: [
          { label: "Multiply", value: "multiply" },
          { label: "Add", value: "add" },
          { label: "Subtract", value: "subtract" },
        ],
      },
      { id: "b", key: "b", kind: "number", label: "Second operand" },
    ],
  },
  {
    type: "result",
    icon: "number",
    color: "#74c994",
    summary: (_, result) =>
      result ? `Result: ${result.outputs.value ?? "—"}` : "Run to calculate",
  },
  {
    type: "step",
    icon: "shape",
    controls: [
      {
        id: "description",
        key: "description",
        kind: "text",
        label: "Description",
      },
    ],
  },
  {
    type: "decision",
    icon: "filter",
    controls: [
      {
        id: "description",
        key: "description",
        kind: "text",
        label: "Question",
      },
    ],
  },
  {
    type: "controls",
    icon: "controls",
    width: 330,
    controls: [
      {
        id: "title",
        key: "title",
        kind: "text",
        label: "Text",
        validate: (value) => String(value).trim() ? undefined : "Enter a title",
      },
      { id: "notes", key: "notes", kind: "textarea", label: "Multiline text" },
      {
        id: "count",
        key: "count",
        kind: "number",
        label: "Number",
        min: 0,
        max: 100,
      },
      { id: "enabled", key: "enabled", kind: "toggle", label: "Enabled" },
      {
        id: "gain",
        key: "gain",
        kind: "slider",
        label: "Gain",
        min: 0,
        max: 100,
        step: 1,
      },
      {
        id: "mode",
        key: "mode",
        kind: "select",
        label: "Mode",
        options: [
          { label: "Balanced", value: "balanced" },
          { label: "Fast", value: "fast" },
          { label: "Precise", value: "precise" },
        ],
      },
      { id: "rating", key: "rating", kind: "rating", label: "Custom rating" },
      {
        id: "reset",
        kind: "button",
        label: "Reset controls",
        action: ({ document, nodeId, graphId }) =>
          document.dispatch({
            type: "update-node",
            nodeId,
            graphId,
            changes: {
              data: definitions.find(
                (definition) => definition.type === "controls",
              )!.defaults,
            },
          }),
      },
    ],
  },
  { type: "benchmark", icon: "shape" },
];
export const extension: EditorExtension = {
  presentations,
  controls: [
    {
      kind: "rating",
      height: 66,
      draw(context, bounds, value, theme) {
        context.font = `24px ${theme.font}`;
        context.textBaseline = "middle";
        for (let i = 0; i < 5; i++) {
          context.fillStyle = i < Number(value) ? theme.accent : theme.border;
          context.fillText(
            "★",
            bounds.x + (i * bounds.width) / 5,
            bounds.y + bounds.height / 2,
          );
        }
      },
      pointer: (point, bounds) =>
        Math.min(
          5,
          Math.max(1, Math.ceil(((point.x - bounds.x) / bounds.width) * 5)),
        ),
      key: (key, value) =>
        Math.max(
          1,
          Math.min(
            5,
            Number(value) +
              (key === "ArrowRight" || key === "ArrowUp" ? 1 : -1),
          ),
        ),
      accessibleValue: (value) => `${value} out of 5 stars`,
    },
  ],
};
export function createRegistry() {
  const registry = new NodeRegistry();
  definitions.forEach((definition) => registry.register(definition));
  return registry;
}
export function createRunner(registry: NodeRegistry): Runner {
  const runner = new Runner(registry);
  runner.register("orders", () => ({ orders }));
  runner.register("filter", ({ data, inputs }) => ({
    matches: (inputs.orders as typeof orders).filter(
      (row) =>
        !data.enabled ||
        (data.rule === "less"
          ? Number(row[data.field as keyof typeof row]) < Number(data.minimum)
          : data.rule === "equal"
          ? Number(row[data.field as keyof typeof row]) ===
            Number(data.minimum)
          : Number(row[data.field as keyof typeof row]) >
            Number(data.minimum)),
    ),
  }));
  runner.register("map", ({ data, inputs }) => ({
    mapped: (inputs.rows as Record<string, JsonValue>[]).map((row) =>
      Object.fromEntries(
        String(data.fields)
          .split(",")
          .map((field) => field.trim())
          .filter((field) => field in row)
          .map((field) => [field, row[field]]),
      )
    ),
  }));
  runner.register("table", ({ inputs }) => ({ rows: inputs.rows }));
  runner.register(
    "trigger",
    ({ data, triggerPayload }) => ({ event: triggerPayload ?? data.message }),
    { trigger: true },
  );
  runner.register("condition", ({ data, inputs }) => ({
    yes: data.approved ? inputs.event : SKIP,
    no: data.approved ? SKIP : inputs.event,
  }));
  runner.register("delay", async ({ data, inputs, signal }) => {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, Number(data.milliseconds));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    return { done: inputs.event };
  });
  runner.register("message", ({ data, log }) => {
    log(String(data.message));
    return { message: data.message };
  });
  runner.register("number", ({ data }) => ({ value: data.value }));
  runner.register("math", ({ data, inputs }) => ({
    value: data.operation === "add"
      ? Number(inputs.a) + Number(inputs.b)
      : data.operation === "subtract"
      ? Number(inputs.a) - Number(inputs.b)
      : Number(inputs.a) * Number(inputs.b),
  }));
  runner.register("result", ({ inputs }) => ({ value: inputs.value }));
  runner.register("controls", ({ data }) => ({ out: data }));
  runner.register("step", ({ data }) => ({ out: data.description }));
  runner.register("decision", ({ data }) => ({ yes: data.description }));
  runner.register("benchmark", () => ({ out: true }));
  return runner;
}
