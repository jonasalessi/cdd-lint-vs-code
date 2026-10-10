import * as vscode from "vscode";

// appendText escapes the Markdown syntax of a unit name. Two spaces before a line break keep
// each item on its own line.
export function markdownOfLines(lines: string[]): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  lines.forEach((line, index) => {
    markdown.appendMarkdown(index === 0 ? "" : "  \n");
    markdown.appendText(line);
  });
  return markdown;
}
