import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { TagsManager } from "../../../src/config/tagsManager";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { Scanner } from "../../../src/scanner/scanner";
import { PathUtils } from "../../../src/utils/pathUtils";

/**
 * Multi-root workspaces where one folder is nested inside another. Every 1.1.1
 * scanning bug lived here: a file reachable from two roots was reported twice,
 * progress restarted at each folder, and refresh silently dropped results from
 * every root but the first. These are scenario regressions, not environment
 * ones — the mocked `vscode` module is enough to catch all of them.
 */
describe("Scanner with overlapping workspace roots", () => {
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

  // types: [] keeps TypeScript from walking up to this repo's node_modules and
  // loading every @types package into each fixture program.
  const tsconfig = JSON.stringify({
    compilerOptions: { target: "ES2020", module: "commonjs", types: [] },
    include: ["**/*.ts"],
  });

  const write = (relative: string, content: string): string => {
    const fullPath = path.join(tempDir, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  };

  const folder = (relative: string): string =>
    vscode.Uri.file(path.join(tempDir, relative)).fsPath;

  const childDir = path.join("mono", "packages", "app");

  /** Parent root whose tsconfig also globs the child root's sources. */
  const buildNestedRoots = (): { parent: string; child: string; childFile: string } => {
    write(path.join("mono", "tsconfig.json"), tsconfig);
    write(path.join(childDir, "tsconfig.json"), tsconfig);
    const childFile = write(path.join(childDir, "sample.ts"), deprecatedSource);
    return { parent: folder("mono"), child: folder(childDir), childFile };
  };

  const identity = (items: { filePath: string; line: number; character: number; kind: string; name: string }[]): string[] =>
    items
      .map((item) => `${item.kind}:${item.name}:${item.filePath}:${item.line}:${item.character}`)
      .sort();

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
      "test-workspace-overlapping",
    );
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
      // Windows: live ts.Program instances hold handles into the fixture,
      // so a bare rmSync intermittently throws EPERM here.
      maxRetries: 5,
      retryDelay: 100,
    });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
      // Windows: live ts.Program instances hold handles into the fixture,
      // so a bare rmSync intermittently throws EPERM here.
      maxRetries: 5,
      retryDelay: 100,
    });
  });

  describe("scanWorkspace", () => {
    it("reports a file reachable from two roots exactly once", async () => {
      const { parent, child } = buildNestedRoots();

      const results = await scanner.scanWorkspace([parent, child]);

      // The 1.1.1 bug returned each item twice: once via the parent root's
      // tsconfig glob and once via the child root's own tsconfig.
      expect(identity(results)).toEqual([...new Set(identity(results))]);
      expect(
        results.filter((item) => item.name === "oldMethod" && item.kind !== "usage"),
      ).toHaveLength(1);
    });

    it("returns the same results regardless of folder order", async () => {
      const { parent, child } = buildNestedRoots();

      const forward = await scanner.scanWorkspace([parent, child]);
      const reversed = await scanner.scanWorkspace([child, parent]);

      // Guards anything re-binding behaviour to workspaceFolders[0].
      expect(identity(reversed)).toEqual(identity(forward));
    });

    it("counts progress monotonically across the whole workspace", async () => {
      const { parent, child } = buildNestedRoots();
      const progress: { current: number; total: number }[] = [];

      await scanner.scanWorkspace([parent, child], (_file, current, total) => {
        progress.push({ current, total });
      });

      // Scanning folder-by-folder restarted current at 1 for each folder, which
      // drove the progress bar backwards.
      expect(progress.length).toBeGreaterThan(0);
      expect(progress.map((entry) => entry.current)).toEqual(
        progress.map((_entry, index) => index + 1),
      );
      expect(new Set(progress.map((entry) => entry.total)).size).toBe(1);
    });

    it("still scans a child root that has no config of its own", async () => {
      write(path.join("mono", "tsconfig.json"), tsconfig);
      write(path.join(childDir, "sample.ts"), deprecatedSource);

      const results = await scanner.scanWorkspace([
        folder("mono"),
        folder(childDir),
      ]);

      expect(
        results.filter((item) => item.name === "oldMethod" && item.kind !== "usage"),
      ).toHaveLength(1);
    });
  });

  describe("refresh and targeted scans", () => {
    it("keeps results for a file that lives under a non-first root", async () => {
      const { parent, child, childFile } = buildNestedRoots();

      const results = await scanner.scanWorkspaceFiles(
        [parent, child],
        [childFile],
      );

      // Refresh used to resolve configs against workspaceFolders[0] only and
      // silently drop everything else.
      expect(results.length).toBeGreaterThan(0);
    });

    it("scans a folder under the child root, resolved the way the sidebar does", async () => {
      const { parent, child } = buildNestedRoots();
      const target = path.join(tempDir, childDir);

      // Mirrors treeProvider.scanFolder: resolve the owning folder first, fall
      // back to the first root. Passing the wrong root throws
      // "Target folder must be within workspace".
      const owning =
        [parent, child].find((root) => PathUtils.isWithin(root, target)) ??
        parent;
      const results = await scanner.scanFolder(owning, target);

      expect(results.length).toBeGreaterThan(0);
    });

    it("scans a single file under the child root", async () => {
      const { parent, child, childFile } = buildNestedRoots();

      const owning =
        [parent, child].find((root) => PathUtils.isWithin(root, childFile)) ??
        parent;
      const results = await scanner.scanSpecificFiles(owning, [childFile]);

      expect(results.length).toBeGreaterThan(0);
    });
  });
});
