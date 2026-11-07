import * as ts from "typescript";
import {
  SCRIPT_BLOCK_SUFFIX,
  isScriptBlockHost,
  scriptBlocksOnly,
  toRealName,
  toVirtualName,
  withScriptBlocks,
} from "../../../src/scanner/scriptBlocks";

describe("scriptBlocksOnly", () => {
  it("keeps script bodies in place and blanks everything else", () => {
    const text =
      '<div>{x}</div>\n<script lang="ts">\n  const x = 1;\n</script>\n<p>hi</p>\n';
    const result = scriptBlocksOnly(text);

    expect(result).toHaveLength(text.length);
    expect(result.split("\n")).toEqual([
      "              ",
      "                  ",
      "  const x = 1;",
      "         ",
      "         ",
      "",
    ]);
  });

  it("keeps both the module and the instance script", () => {
    const text =
      '<script context="module">export const a = 1;</script>\n<script>const b = 2;</script>';
    const result = scriptBlocksOnly(text);

    expect(result.indexOf("export const a = 1;")).toBe(
      text.indexOf("export const a = 1;"),
    );
    expect(result.indexOf("const b = 2;")).toBe(text.indexOf("const b = 2;"));
    expect(result).not.toContain("<script");
  });

  it("reads past a > inside a quoted attribute such as generics", () => {
    const text =
      '<script lang="ts" generics="T extends Record<string, unknown>">let t: T;</script>';

    expect(scriptBlocksOnly(text).trim()).toBe("let t: T;");
  });

  it("keeps CRLF line breaks so line numbers still match", () => {
    const text = "<p>\r\n</p>\r\n<script>\r\nfoo();\r\n</script>";
    const result = scriptBlocksOnly(text);

    expect(result.split("\r\n")).toHaveLength(text.split("\r\n").length);
    expect(result.split("\r\n")[3]).toBe("foo();");
  });

  it("matches script tags in any letter case", () => {
    expect(scriptBlocksOnly('<SCRIPT lang="ts">run();</Script >').trim()).toBe(
      "run();",
    );
  });

  it("ignores a script written inside an HTML comment", () => {
    const text =
      "<!-- <script>old();</script> -->\n<script>current();</script>";

    expect(scriptBlocksOnly(text).trim()).toBe("current();");
  });

  it("treats an unclosed comment as running to the end of the file", () => {
    expect(scriptBlocksOnly("<!-- <script>old();</script>").trim()).toBe("");
  });

  it("blanks a file with no script at all", () => {
    expect(scriptBlocksOnly("<p>only markup</p>").trim()).toBe("");
  });
});

describe("virtual file names", () => {
  it("renames only files that carry script blocks", () => {
    expect(isScriptBlockHost("/a/App.svelte")).toBe(true);
    expect(isScriptBlockHost("/a/App.SVELTE")).toBe(true);
    expect(isScriptBlockHost("/a/state.svelte.ts")).toBe(false);
    expect(toVirtualName("/a/App.svelte")).toBe(
      `/a/App.svelte${SCRIPT_BLOCK_SUFFIX}`,
    );
    expect(toVirtualName("/a/state.svelte.ts")).toBe("/a/state.svelte.ts");
  });

  it("maps a virtual name back and leaves any other name alone", () => {
    expect(toRealName(`/a/App.svelte${SCRIPT_BLOCK_SUFFIX}`)).toBe(
      "/a/App.svelte",
    );
    expect(toRealName("/a/lib.ts")).toBe("/a/lib.ts");
  });
});

describe("withScriptBlocks", () => {
  const files: Record<string, string> = {
    "/p/App.svelte": "<script>const x = 1;</script>",
  };
  const readFile = (filePath: string): string | undefined => files[filePath];
  const base = {
    fileExists: jest.fn().mockReturnValue(true),
    getSourceFile: jest.fn().mockReturnValue("base-source"),
  } as unknown as ts.CompilerHost;
  const host = withScriptBlocks(base, readFile);
  const virtual = `/p/App.svelte${SCRIPT_BLOCK_SUFFIX}`;

  it("answers existence of a virtual file from the real one", () => {
    expect(host.fileExists(virtual)).toBe(true);
    expect(host.fileExists(`/p/Missing.svelte${SCRIPT_BLOCK_SUFFIX}`)).toBe(
      false,
    );
    expect(host.fileExists("/p/lib.ts")).toBe(true);
    expect(base.fileExists).toHaveBeenCalledWith("/p/lib.ts");
  });

  it("serves the blanked script as TypeScript under the virtual name", () => {
    const sourceFile = host.getSourceFile(virtual, ts.ScriptTarget.Latest);

    expect(sourceFile?.fileName).toBe(virtual);
    expect(sourceFile?.text.trim()).toBe("const x = 1;");
  });

  it("returns nothing for a virtual file whose real file is gone", () => {
    expect(
      host.getSourceFile(
        `/p/Gone.svelte${SCRIPT_BLOCK_SUFFIX}`,
        ts.ScriptTarget.Latest,
      ),
    ).toBeUndefined();
  });

  it("hands every other file to the original host", () => {
    expect(host.getSourceFile("/p/lib.ts", ts.ScriptTarget.Latest)).toBe(
      "base-source",
    );
  });
});
