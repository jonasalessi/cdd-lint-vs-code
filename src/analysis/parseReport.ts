import type { CddFile, CddMetric, CddReport, CddUnit } from "./report";

type JsonObject = Record<string, unknown>;
type FieldType = "string" | "number" | "boolean";
type ItemGuard<Item> = (value: unknown) => value is Item;

const metricFields: Record<string, FieldType> = {
  metric: "string",
  count: "number",
  score: "number",
};

const unitFields: Record<string, FieldType> = {
  name: "string",
  kind: "string",
  line: "number",
  total: "number",
  limit: "number",
  exceeds: "boolean",
};

const reportFields: Record<string, FieldType> = { partial: "boolean", blocked: "boolean" };

// Validation covers only the fields that the extension reads (plan section 3.7).
export function parseReport(stdout: string): CddReport | undefined {
  const candidate = parseJson(stdout);
  return isReport(candidate) ? candidate : undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isReport(value: unknown): value is CddReport {
  return hasFields(value, reportFields) && isArrayOf(value.files, isFile);
}

function isFile(value: unknown): value is CddFile {
  return (
    hasFields(value, { path: "string" }) &&
    isArrayOf(value.units, isUnit) &&
    isOptionalWarnings(value.warnings)
  );
}

function isUnit(value: unknown): value is CddUnit {
  return hasFields(value, unitFields) && isArrayOf(value.metrics, isMetric);
}

function isMetric(value: unknown): value is CddMetric {
  return hasFields(value, metricFields);
}

function isOptionalWarnings(value: unknown): boolean {
  return value === undefined || isArrayOf(value, isString);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isArrayOf<Item>(value: unknown, isItem: ItemGuard<Item>): value is Item[] {
  return Array.isArray(value) && value.every(isItem);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFields(value: unknown, fieldTypes: Record<string, FieldType>): value is JsonObject {
  return (
    isObject(value) &&
    Object.entries(fieldTypes).every(([field, fieldType]) => typeof value[field] === fieldType)
  );
}
