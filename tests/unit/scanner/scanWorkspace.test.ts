import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { TagsManager } from "../../../src/config/tagsManager";
import { ERROR_MESSAGES } from "../../../src/constants";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { Scanner } from "../../../src/scanner/scanner";

describe("Scanner.scanWorkspace", () => {
  let scanner: Scanner;
  let tempDir: string;

  const deprecatedSource = `
export class Sample {
  /** @deprecated Use newMethod instead */
  oldMethod() {}

  useOld() {
    this.oldMethod();
  }
}
`;

  const tsconfig = JSON.stringify({
    compilerOptions: { target: "ES2020", module: "commonjs", strict: true },
    include: ["**/*.ts"],
  });

  const write = (relative: string, content: string): string => {
    const fullPath = path.join(tempDir, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  };

  const folder = (relative: string, index: number): vscode.WorkspaceFolder => ({
    uri: vscode.Uri.file(path.join(tempDir, relative)),
    name: relative,
    index,
  });

  beforeEach(() => {
    const mockContext = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn().mockReturnValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as any;
    scanner = new Scanner(
      new IgnoreManager(mockContext),
      new TagsManager(mockContext),
    );
    tempDir = path.join(
      __dirname,
      "..",
      "..",
      "fixtures",
      "test-workspace-multiroot",
    );
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("aggregates results from every folder", async () => {
    write(path.join("alpha", "tsconfig.json"), tsconfig);
    write(path.join("alpha", "sample.ts"), deprecatedSource);
    write(path.join("beta", "tsconfig.json"), tsconfig);
    write(path.join("beta", "sample.ts"), deprecatedSource);

    const results = await scanner.scanWorkspace([
      folder("alpha", 0),
      folder("beta", 1),
    ]);

    const declarations = results.filter((item) => item.name === "oldMethod");
    expect(declarations.length).toBeGreaterThanOrEqual(2);
    expect(
      declarations.some((item) => item.filePath.includes("alpha")),
    ).toBe(true);
    expect(declarations.some((item) => item.filePath.includes("beta"))).toBe(
      true,
    );
  });

  it("reports a file once when two roots overlap", async () => {
    write(path.join("outer", "tsconfig.json"), tsconfig);
    write(path.join("outer", "inner", "tsconfig.json"), tsconfig);
    write(path.join("outer", "inner", "sample.ts"), deprecatedSource);

    const both = await scanner.scanWorkspace([
      folder("outer", 0),
      folder(path.join("outer", "inner"), 1),
    ]);
    const single = await scanner.scanWorkspace([folder("outer", 0)]);

    expect(both).toHaveLength(single.length);
  });

  it("skips a folder without a config in multi-root", async () => {
    write(path.join("alpha", "tsconfig.json"), tsconfig);
    write(path.join("alpha", "sample.ts"), deprecatedSource);
    fs.mkdirSync(path.join(tempDir, "no-config"), { recursive: true });

    const results = await scanner.scanWorkspace([
      folder("alpha", 0),
      folder("no-config", 1),
    ]);

    expect(results.some((item) => item.name === "oldMethod")).toBe(true);
  });

  it("throws when the only folder has no config", async () => {
    fs.mkdirSync(path.join(tempDir, "no-config"), { recursive: true });

    await expect(
      scanner.scanWorkspace([folder("no-config", 0)]),
    ).rejects.toThrow(ERROR_MESSAGES.NO_TSCONFIG);
  });

  it("re-throws cancellation instead of skipping the folder", async () => {
    write(path.join("alpha", "tsconfig.json"), tsconfig);
    write(path.join("alpha", "sample.ts"), deprecatedSource);
    write(path.join("beta", "tsconfig.json"), tsconfig);

    await expect(
      scanner.scanWorkspace(
        [folder("alpha", 0), folder("beta", 1)],
        undefined,
        { isCancellationRequested: true } as vscode.CancellationToken,
      ),
    ).rejects.toThrow(ERROR_MESSAGES.SCAN_CANCELLED);
  });

  describe("scanWorkspaceFiles", () => {
    it("keeps results from roots other than the first", async () => {
      write(path.join("alpha", "tsconfig.json"), tsconfig);
      const alphaFile = write(path.join("alpha", "sample.ts"), deprecatedSource);
      write(path.join("beta", "tsconfig.json"), tsconfig);
      const betaFile = write(path.join("beta", "sample.ts"), deprecatedSource);

      const results = await scanner.scanWorkspaceFiles(
        [folder("alpha", 0), folder("beta", 1)],
        [alphaFile, betaFile],
      );

      expect(results.some((item) => item.filePath.includes("alpha"))).toBe(
        true,
      );
      expect(results.some((item) => item.filePath.includes("beta"))).toBe(true);
    });

    it("does not build programs for roots that own none of the files", async () => {
      write(path.join("alpha", "tsconfig.json"), tsconfig);
      const alphaFile = write(path.join("alpha", "sample.ts"), deprecatedSource);
      write(path.join("beta", "tsconfig.json"), tsconfig);
      write(path.join("beta", "sample.ts"), deprecatedSource);

      const createProgramContexts = jest.spyOn(
        scanner as never,
        "createProgramContexts",
      );

      await scanner.scanWorkspaceFiles(
        [folder("alpha", 0), folder("beta", 1)],
        [alphaFile],
      );

      // Every config across every call, so a per-folder fallback that rebuilds
      // beta separately is caught rather than hidden behind the first call.
      const builtConfigs = createProgramContexts.mock.calls.flatMap(
        (call) => call[0] as string[],
      );
      expect(builtConfigs).toHaveLength(1);
      expect(builtConfigs[0]).toContain("alpha");
      expect(builtConfigs.some((config) => config.includes("beta"))).toBe(false);
    });

    it("falls back to every config only when none owns a target file", async () => {
      write(path.join("alpha", "tsconfig.json"), tsconfig);
      write(path.join("beta", "tsconfig.json"), tsconfig);

      const createProgramContexts = jest.spyOn(
        scanner as never,
        "createProgramContexts",
      );

      await scanner.scanWorkspaceFiles(
        [folder("alpha", 0), folder("beta", 1)],
        [path.join(tempDir, "outside", "orphan.ts")],
      );

      const builtConfigs = createProgramContexts.mock.calls.flatMap(
        (call) => call[0] as string[],
      );
      expect(builtConfigs).toHaveLength(2);
    });

    it("returns nothing for an empty file list", async () => {
      await expect(
        scanner.scanWorkspaceFiles([folder("alpha", 0)], []),
      ).resolves.toEqual([]);
    });

    it("skips a folder without a config in multi-root", async () => {
      write(path.join("alpha", "tsconfig.json"), tsconfig);
      const alphaFile = write(path.join("alpha", "sample.ts"), deprecatedSource);
      fs.mkdirSync(path.join(tempDir, "no-config"), { recursive: true });

      const results = await scanner.scanWorkspaceFiles(
        [folder("alpha", 0), folder("no-config", 1)],
        [alphaFile],
      );

      expect(results.some((item) => item.name === "oldMethod")).toBe(true);
    });

    it("throws when the only folder has no config", async () => {
      fs.mkdirSync(path.join(tempDir, "no-config"), { recursive: true });

      await expect(
        scanner.scanWorkspaceFiles(
          [folder("no-config", 0)],
          [path.join(tempDir, "no-config", "sample.ts")],
        ),
      ).rejects.toThrow(ERROR_MESSAGES.NO_TSCONFIG);
    });

    it("re-throws cancellation instead of skipping the folder", async () => {
      write(path.join("alpha", "tsconfig.json"), tsconfig);
      const alphaFile = write(path.join("alpha", "sample.ts"), deprecatedSource);
      write(path.join("beta", "tsconfig.json"), tsconfig);

      await expect(
        scanner.scanWorkspaceFiles(
          [folder("alpha", 0), folder("beta", 1)],
          [alphaFile],
          undefined,
          { isCancellationRequested: true } as vscode.CancellationToken,
        ),
      ).rejects.toThrow(ERROR_MESSAGES.SCAN_CANCELLED);
    });

    it("reports progress for the requested files", async () => {
      write(path.join("alpha", "tsconfig.json"), tsconfig);
      const alphaFile = write(path.join("alpha", "sample.ts"), deprecatedSource);

      const progress: Array<{ current: number; total: number }> = [];
      await scanner.scanWorkspaceFiles(
        [folder("alpha", 0)],
        [alphaFile],
        (current, total) => progress.push({ current, total }),
      );

      expect(progress).toEqual([{ current: 1, total: 1 }]);
    });
  });

  it("counts progress monotonically across folders", async () => {
    write(path.join("alpha", "tsconfig.json"), tsconfig);
    write(path.join("alpha", "sample.ts"), deprecatedSource);
    write(path.join("beta", "tsconfig.json"), tsconfig);
    write(path.join("beta", "sample.ts"), deprecatedSource);

    const progress: Array<{ current: number; total: number }> = [];
    await scanner.scanWorkspace(
      [folder("alpha", 0), folder("beta", 1)],
      (_filePath, current, total) => progress.push({ current, total }),
    );

    expect(progress.length).toBeGreaterThan(1);
    expect(new Set(progress.map((entry) => entry.total)).size).toBe(1);
    for (let index = 1; index < progress.length; index++) {
      expect(progress[index].current).toBeGreaterThan(
        progress[index - 1].current,
      );
    }
  });
});
