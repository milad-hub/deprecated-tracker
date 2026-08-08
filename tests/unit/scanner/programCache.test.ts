import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { TagsManager } from "../../../src/config/tagsManager";
import { MAX_CACHED_PROGRAMS } from "../../../src/constants";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { Scanner } from "../../../src/scanner/scanner";

/**
 * Guards the program-reuse win (~3.2 s -> ~0.6 s warm rescan) and the cache
 * bound that keeps it from leaking. Asserts the mechanism — program object
 * identity and cache size — rather than wall-clock milliseconds, which would
 * be flaky and prove nothing.
 */
describe("Scanner program cache", () => {
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

  const folder = (relative: string): string =>
    vscode.Uri.file(path.join(tempDir, relative)).fsPath;

  const cache = (): Map<string, { program: unknown }> =>
    (scanner as any).programCache;

  const onlyProgram = (): unknown => {
    const programs = [...cache().values()].map((entry) => entry.program);
    expect(programs).toHaveLength(1);
    return programs[0];
  };

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
      "test-workspace-programcache",
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

  describe("reuse across scans", () => {
    it("reuses the same ts.Program when nothing changed on disk", async () => {
      write(path.join("app", "tsconfig.json"), tsconfig);
      write(path.join("app", "sample.ts"), deprecatedSource);
      const root = folder("app");

      await scanner.scanProject(root);
      const first = onlyProgram();

      await scanner.scanProject(root);
      const second = onlyProgram();

      // Object identity is the reuse guarantee; a rebuild would allocate a new
      // ts.Program and hand back the slow path.
      expect(second).toBe(first);
    });

    it("rebuilds the program when a root file's mtime changes", async () => {
      write(path.join("app", "tsconfig.json"), tsconfig);
      const sourcePath = write(path.join("app", "sample.ts"), deprecatedSource);
      const root = folder("app");

      await scanner.scanProject(root);
      const first = onlyProgram();

      // utimesSync, not a rewrite: two writes inside the same millisecond can
      // produce an identical mtimeMs and silently not exercise invalidation.
      const future = new Date(Date.now() + 2000);
      fs.utimesSync(sourcePath, future, future);

      await scanner.scanProject(root);
      expect(onlyProgram()).not.toBe(first);
    });
  });

  describe("eviction", () => {
    // These tests assert cache bookkeeping, not type checking, and they build a
    // dozen programs each. noLib plus a two-line source keeps every program
    // cheap — with the full fixture this block alone ran ~30 s.
    // types: [] matters as much as noLib — the fixture lives inside this repo,
    // so without it TypeScript walks up to the root node_modules and loads
    // every @types package into all twelve programs.
    const lightTsconfig = JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        noLib: true,
        types: [],
      },
      include: ["**/*.ts"],
    });
    const lightSource = `/** @deprecated gone */\nexport const oldMethod = 1;\nexport const usesOld = oldMethod;\n`;

    const writeProjects = (count: number): string[] =>
      Array.from({ length: count }, (_, index) => {
        const name = `project${index}`;
        write(path.join(name, "tsconfig.json"), lightTsconfig);
        write(path.join(name, "sample.ts"), lightSource);
        return name;
      });

    it("bounds retention across separate scans", async () => {
      const projects = writeProjects(MAX_CACHED_PROGRAMS + 3);

      for (const [index, name] of projects.entries()) {
        await scanner.scanFolder(
          folder(name),
          path.join(tempDir, name),
        );
      }

      // Trimming happens at scan start, so the final scan's own config sits on
      // top of the cap. The property that matters is that retention does not
      // grow with the number of scans.
      expect(cache().size).toBeLessThanOrEqual(MAX_CACHED_PROGRAMS + 1);
      expect(cache().size).toBeLessThan(projects.length);

      const keys = [...cache().keys()].join("|").toLowerCase();
      expect(keys).toContain(projects[projects.length - 1]);
      expect(keys).not.toContain(`${projects[0]}${path.sep}`);
    });

    it("evicts by recency, not by insertion order", async () => {
      const projects = writeProjects(MAX_CACHED_PROGRAMS + 2);
      const scan = (name: string): Promise<unknown> =>
        scanner.scanFolder(folder(name), path.join(tempDir, name));

      // Fill the cache to exactly the cap: project0 is the oldest entry.
      for (const name of projects.slice(0, MAX_CACHED_PROGRAMS)) {
        await scan(name);
      }

      // Re-scan project0 with nothing changed. This is a cache *hit*, so the
      // entry is not re-inserted by a rebuild — only the LRU touch can move it
      // off the chopping block. Without the touch, project0 stays oldest.
      await scan(projects[0]);

      // Two more new configs: the first pushes size past the cap, the second
      // triggers the trim that evicts whatever is now oldest.
      await scan(projects[MAX_CACHED_PROGRAMS]);
      await scan(projects[MAX_CACHED_PROGRAMS + 1]);

      const keys = [...cache().keys()].join("|").toLowerCase();
      expect(keys).toContain(`project0${path.sep}`);
      expect(keys).not.toContain(`project1${path.sep}`);
    });

    it("keeps every program of a single scan even past the cap", async () => {
      const projects = writeProjects(MAX_CACHED_PROGRAMS + 3);
      write("tsconfig.json", JSON.stringify({ files: [] }));

      const results = await scanner.scanProject(folder("."));

      // Soft cap: one scan holds every program it discovered, so results must
      // be complete even though the cache is over its bound.
      expect(cache().size).toBeGreaterThan(MAX_CACHED_PROGRAMS);
      const declarations = results.filter(
        (item) => item.name === "oldMethod" && item.kind !== "usage",
      );
      expect(declarations).toHaveLength(projects.length);
    });

    it("trims back down on the next scan", async () => {
      writeProjects(MAX_CACHED_PROGRAMS + 3);
      write("tsconfig.json", JSON.stringify({ files: [] }));

      await scanner.scanProject(folder("."));
      expect(cache().size).toBeGreaterThan(MAX_CACHED_PROGRAMS);

      await scanner.scanFolder(
        folder("project0"),
        path.join(tempDir, "project0"),
      );
      expect(cache().size).toBeLessThanOrEqual(MAX_CACHED_PROGRAMS + 1);
    });
  });
});
