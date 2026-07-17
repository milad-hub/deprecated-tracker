import * as fs from "fs";

describe("results webview asset", () => {
  const script = fs.readFileSync("src/webview/assets/main.js", "utf8");

  it("registers the document click listener once", () => {
    expect(script.match(/document\.addEventListener\('click'/g)).toHaveLength(1);
  });

  it("escapes usage file names and paths before rendering HTML", () => {
    expect(script).toContain("${escapeHtml(usage.fileName)}");
    expect(script).toContain("${escapeHtml(usage.filePath)}");
    expect(script).not.toContain("<strong>${usage.fileName}</strong>");
    expect(script).not.toContain("<small>${usage.filePath}</small>");
  });
});
