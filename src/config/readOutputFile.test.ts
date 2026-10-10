import { describe, expect, it } from "vitest";
import { readOutputFile } from "./readOutputFile";

describe("readOutputFile", () => {
  it.each([
    ["the value is null", "reporter:\n  format: console\n  outputFile: null\n"],
    ["the value is the YAML null sign", "reporter:\n  outputFile: ~\n"],
    ["the value is empty", "reporter:\n  outputFile:\n"],
    ["the key is absent", "reporter:\n  format: console\n"],
    ["the reporter section is absent", "version: 1\n"],
    ["the reporter section is null", "reporter: null\n"],
    ["the reporter section is not a mapping", "reporter: console\n"],
    ["the file is empty", ""],
  ])("gives not-set when %s", (_case, configText) => {
    expect(readOutputFile(configText)).toEqual({ kind: "not-set" });
  });

  it.each([
    ["a string", "reporter:\n  outputFile: report.json\n"],
    ["an empty string", 'reporter:\n  outputFile: ""\n'],
    ["the string null in quotes", 'reporter:\n  outputFile: "null"\n'],
    ["a boolean", "reporter:\n  outputFile: false\n"],
    ["a number", "reporter:\n  outputFile: 0\n"],
    ["a mapping", "reporter:\n  outputFile:\n    path: report.json\n"],
  ])("gives set when the value is %s", (_case, configText) => {
    expect(readOutputFile(configText)).toEqual({ kind: "set" });
  });

  it("gives unparsable with the parser error for YAML that cannot be parsed", () => {
    const setting = readOutputFile("reporter:\n  outputFile: [report.json\n");

    expect(setting.kind).toBe("unparsable");
    expect(setting).toHaveProperty("reason", expect.stringMatching(/YAML/));
  });

  it("gives unparsable for a tab indentation, which the YAML syntax does not allow", () => {
    expect(readOutputFile("reporter:\n\toutputFile: null\n").kind).toBe("unparsable");
  });
});
