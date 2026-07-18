import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { TagsManager } from "../../../src/config/tagsManager";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { Scanner } from "../../../src/scanner/scanner";

describe("Scanner nested config discovery", () => {
  let scanner: Scanner;
  let tempDir: string;
  let workspaceFolder: vscode.WorkspaceFolder;

  const deprecatedSource = `
export class Sample {
  /** @deprecated Use newMethod instead */
  oldMethod() {}

  useOld() {
    this.oldMethod();
  }
}
`;

  const write = (relative: string, content: string): string => {
    const fullPath = path.join(tempDir, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  };

  const tsconfig = JSON.stringify({
    compilerOptions: { target: "ES2020", module: "commonjs", strict: true },
    include: ["**/*.ts"],
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
      "test-workspace-nested",
    );
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
    workspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: "test-workspace",
      index: 0,
    };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("scanProject finds items in a nested project when the root has no config", async () => {
    write(path.join("apps", "inner", "tsconfig.json"), tsconfig);
    write(path.join("apps", "inner", "src", "sample.ts"), deprecatedSource);

    const results = await scanner.scanProject(workspaceFolder);

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((item) => item.name === "oldMethod")).toBe(true);
  });

  it("scanProject scans nested projects excluded by the root config", async () => {
    write(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { target: "ES2020", module: "commonjs", strict: true },
        include: ["src/**/*.ts"],
        exclude: ["nested"],
      }),
    );
    write(path.join("src", "clean.ts"), "export const ok = 1;\n");
    write(path.join("nested", "project", "tsconfig.json"), tsconfig);
    write(path.join("nested", "project", "sample.ts"), deprecatedSource);

    const results = await scanner.scanProject(workspaceFolder);

    expect(results.some((item) => item.name === "oldMethod")).toBe(true);
  });

  it("scanFolder on a parent folder discovers configs beneath it", async () => {
    write(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { target: "ES2020", module: "commonjs", strict: true },
        include: ["src/**/*.ts"],
      }),
    );
    write(path.join("nested", "project", "tsconfig.json"), tsconfig);
    write(path.join("nested", "project", "sample.ts"), deprecatedSource);

    const results = await scanner.scanFolder(
      workspaceFolder,
      path.join(tempDir, "nested"),
    );

    expect(results.some((item) => item.name === "oldMethod")).toBe(true);
  });

  it("skips node_modules and dot-directories during discovery", async () => {
    write(path.join("apps", "inner", "tsconfig.json"), tsconfig);
    write(path.join("apps", "inner", "src", "sample.ts"), deprecatedSource);
    write(path.join("node_modules", "pkg", "tsconfig.json"), tsconfig);
    write(path.join("node_modules", "pkg", "bad.ts"), deprecatedSource);
    write(path.join(".hidden", "tsconfig.json"), tsconfig);
    write(path.join(".hidden", "hidden.ts"), deprecatedSource);

    const results = await scanner.scanProject(workspaceFolder);

    expect(results.some((item) => item.filePath.includes("node_modules"))).toBe(
      false,
    );
    expect(results.some((item) => item.filePath.includes(".hidden"))).toBe(
      false,
    );
    expect(results.some((item) => item.name === "oldMethod")).toBe(true);
  });

  it("tolerates unreadable directories during discovery", async () => {
    const missing = {
      uri: vscode.Uri.file(path.join(tempDir, "does-not-exist")),
      name: "missing",
      index: 0,
    } as vscode.WorkspaceFolder;

    await expect(scanner.scanProject(missing)).rejects.toThrow();
  });

  it("reuses cached programs on unchanged rescans and rebuilds after edits", async () => {
    write("tsconfig.json", tsconfig);
    const sampleFile = write(path.join("src", "sample.ts"), deprecatedSource);

    const first = await scanner.scanProject(workspaceFolder);
    const second = await scanner.scanProject(workspaceFolder);
    expect(second.length).toBe(first.length);

    await new Promise((resolveSleep) => setTimeout(resolveSleep, 20));
    fs.writeFileSync(
      sampleFile,
      deprecatedSource +
        "\n/** @deprecated gone */\nexport const extraOld = 1;\nvoid extraOld;\n",
    );
    const third = await scanner.scanProject(workspaceFolder);
    expect(third.length).toBeGreaterThan(second.length);

    await new Promise((resolveSleep) => setTimeout(resolveSleep, 20));
    write(
      path.join("src", "more.ts"),
      deprecatedSource
        .replace(/Sample/g, "Sample2")
        .replace(/oldMethod/g, "otherOldMethod"),
    );
    const fourth = await scanner.scanProject(workspaceFolder);
    expect(fourth.length).toBeGreaterThan(third.length);
  });

  it("cancels while building programs", async () => {
    write("tsconfig.json", tsconfig);
    write(path.join("src", "sample.ts"), deprecatedSource);
    let checks = 0;
    const token = {
      get isCancellationRequested() {
        checks += 1;
        return checks > 1;
      },
      onCancellationRequested: () => ({ dispose: () => undefined }),
    } as unknown as import("vscode").CancellationToken;

    await expect(
      scanner.scanProject(workspaceFolder, undefined, token),
    ).rejects.toThrow("cancelled");
  });

  it("cancels between files mid-scan", async () => {
    write("tsconfig.json", tsconfig);
    write(path.join("src", "one.ts"), deprecatedSource);
    write(
      path.join("src", "two.ts"),
      deprecatedSource
        .replace(/Sample/g, "Sample2")
        .replace(/oldMethod/g, "otherOldMethod"),
    );
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => undefined }),
    };

    await expect(
      scanner.scanProject(
        workspaceFolder,
        () => {
          token.isCancellationRequested = true;
        },
        token as unknown as import("vscode").CancellationToken,
      ),
    ).rejects.toThrow("cancelled");
  });

  it("scanSpecificFiles falls back to all configs for files outside config dirs", async () => {
    write(path.join("apps", "inner", "tsconfig.json"), tsconfig);
    write(path.join("apps", "inner", "src", "sample.ts"), deprecatedSource);
    const stray = write("stray.ts", "export const ok = 1;\n");

    const results = await scanner.scanSpecificFiles(workspaceFolder, [stray]);

    expect(results).toEqual([]);
  });

  it("still reports a missing config when no config exists anywhere", async () => {
    write(path.join("src", "plain.ts"), "export const ok = 1;\n");

    await expect(scanner.scanProject(workspaceFolder)).rejects.toThrow();
  });
});
