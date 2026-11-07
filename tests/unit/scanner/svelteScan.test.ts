import * as fs from "fs";
import * as path from "path";
import { TagsManager } from "../../../src/config/tagsManager";
import { DeprecatedTrackerConfig } from "../../../src/interfaces";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { Scanner } from "../../../src/scanner/scanner";

describe("Svelte script blocks", () => {
  let tempDir: string;

  const write = (relative: string, content: string): string => {
    const fullPath = path.join(tempDir, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  };

  const scanner = (config: DeprecatedTrackerConfig = {}): Scanner => {
    const context = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn().mockReturnValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as any;
    return new Scanner(
      new IgnoreManager(context),
      new TagsManager(context),
      config,
    );
  };

  const stores =
    "/** @deprecated Use state instead */\nexport const page = 1;\nexport const fresh = 2;\n";
  const component =
    '<div>{x}</div>\n<script lang="ts">\n  import { page } from "./stores";\n  const x = page;\n</script>\n';

  beforeEach(() => {
    tempDir = path.join(
      __dirname,
      "..",
      "..",
      "fixtures",
      "test-workspace-svelte",
    );
    fs.rmSync(tempDir, { recursive: true, force: true });
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src"] }),
    );
    write("src/stores.ts", stores);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not read .svelte files unless scanTemplates is on", async () => {
    write("src/App.svelte", component);

    const results = await scanner().scanProject(tempDir);

    expect(results.filter((item) => item.kind === "usage")).toEqual([]);
  });

  it("reports usages in a script block at their line and column in the .svelte file", async () => {
    const file = write("src/App.svelte", component);

    const usages = (
      await scanner({ scanTemplates: true }).scanProject(tempDir)
    ).filter((item) => item.kind === "usage");

    expect(
      usages.map(({ filePath, fileName, line, character }) => ({
        filePath,
        fileName,
        line,
        character,
      })),
    ).toEqual([
      {
        filePath: path.normalize(file),
        fileName: "App.svelte",
        line: 3,
        character: 12,
      },
      {
        filePath: path.normalize(file),
        fileName: "App.svelte",
        line: 4,
        character: 13,
      },
    ]);
  });

  it("reports a declaration made inside a .svelte file under its real name", async () => {
    write(
      "src/Widget.svelte",
      '<script context="module" lang="ts">\n  /** @deprecated Use next */\n  export function legacy() {}\n</script>\n<script lang="ts">\n  legacy();\n</script>\n',
    );

    const results = await scanner({ scanTemplates: true }).scanProject(tempDir);
    const usage = results.find(
      (item) => item.name === "legacy" && item.kind === "usage",
    );

    expect(usage?.deprecatedDeclaration?.fileName).toBe("Widget.svelte");
    expect(usage?.deprecatedDeclaration?.line).toBe(3);
  });

  it("scans a named .svelte file in hook mode", async () => {
    const file = write("src/App.svelte", component);

    const results = await scanner({ scanTemplates: true }).scanSpecificFiles(
      tempDir,
      [file],
    );

    expect(results.map((item) => item.fileName)).toEqual([
      "App.svelte",
      "App.svelte",
    ]);
  });

  it("scans .svelte files inside a folder scan", async () => {
    write("src/App.svelte", component);

    const results = await scanner({ scanTemplates: true }).scanFolder(
      tempDir,
      path.join(tempDir, "src"),
    );

    expect(results.some((item) => item.fileName === "App.svelte")).toBe(true);
  });

  it("rebuilds after a .svelte file changes instead of reusing the cached program", async () => {
    const file = write("src/App.svelte", component);
    const subject = scanner({ scanTemplates: true });
    await subject.scanProject(tempDir);

    fs.writeFileSync(
      file,
      '<script lang="ts">\n  import { fresh } from "./stores";\n</script>\n',
    );
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(file, future, future);
    const results = await subject.scanProject(tempDir);

    expect(results.filter((item) => item.kind === "usage")).toEqual([]);
  });

  it("reads .svelte files under the built-in config too", async () => {
    fs.rmSync(path.join(tempDir, "tsconfig.json"));
    write("package.json", "{}");
    write("src/App.svelte", component);

    const results = await scanner({ scanTemplates: true }).scanProject(tempDir);

    expect(results.some((item) => item.fileName === "App.svelte")).toBe(true);
  });
});
