import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as ts from "typescript";
import * as vscode from "vscode";
import { ConfigReader } from "../../src/config/configReader";
import { TagsManager } from "../../src/config/tagsManager";
import { IgnoreManager } from "../../src/scanner/ignoreManager";
import { Scanner } from "../../src/scanner/scanner";
import { matchesPattern } from "../../src/utils/patternMatcher";

const makeContext = (): vscode.ExtensionContext => {
  const workspaceState: { [key: string]: unknown } = {};
  return {
    subscriptions: [],
    workspaceState: {
      get: jest.fn((key: string) => workspaceState[key]),
      update: jest.fn((key: string, value: unknown) => {
        workspaceState[key] = value;
        return Promise.resolve();
      }),
      keys: jest.fn(() => Object.keys(workspaceState)),
    },
    globalState: { get: jest.fn(), update: jest.fn(), keys: jest.fn(() => []) },
    extensionPath: "/test/path",
    extensionUri: vscode.Uri.file("/test/path"),
    extensionMode: vscode.ExtensionMode.Test,
  } as unknown as vscode.ExtensionContext;
};

describe("coverage gaps", () => {
  let tempDir: string;
  let workspaceFolder: vscode.WorkspaceFolder;
  let mockContext: vscode.ExtensionContext;
  let ignoreManager: IgnoreManager;
  let tagsManager: TagsManager;
  let scanner: Scanner;

  const writeProject = (files: { [name: string]: string }) => {
    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "es2020", strict: false },
        include: ["**/*.ts"],
      }),
    );
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(tempDir, name), content);
    }
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dep-tracker-gaps-"));
    workspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: "test-workspace",
      index: 0,
    };
    mockContext = makeContext();
    ignoreManager = new IgnoreManager(mockContext);
    tagsManager = new TagsManager(mockContext);
    scanner = new Scanner(ignoreManager, tagsManager);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("scanner cancellation and input guards", () => {
    const cancelled = {
      isCancellationRequested: true,
      onCancellationRequested: jest.fn(),
    } as unknown as vscode.CancellationToken;

    it("scanProject aborts when already cancelled", async () => {
      writeProject({ "a.ts": "export const x = 1;" });
      await expect(
        scanner.scanProject(workspaceFolder, undefined, cancelled),
      ).rejects.toThrow("Scan cancelled by user");
    });

    it("scanFolder aborts when already cancelled", async () => {
      writeProject({ "a.ts": "export const x = 1;" });
      await expect(
        scanner.scanFolder(workspaceFolder, tempDir, undefined, cancelled),
      ).rejects.toThrow("Scan cancelled by user");
    });

    it("scanSourceFiles aborts between files when cancelled mid-scan", async () => {
      writeProject({ "a.ts": "export const x = 1;" });
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: jest.fn(),
      };
      const flipping = new Proxy(token, {
        get(target, prop) {
          if (prop === "isCancellationRequested") {
            return flipCount++ > 0;
          }
          return (target as any)[prop];
        },
      }) as unknown as vscode.CancellationToken;
      let flipCount = 0;
      await expect(
        scanner.scanProject(workspaceFolder, undefined, flipping),
      ).rejects.toThrow("Scan cancelled by user");
    });

    it("scanSpecificFiles handles a null file list", async () => {
      const results = await scanner.scanSpecificFiles(
        workspaceFolder,
        null as unknown as string[],
      );
      expect(results).toEqual([]);
    });

    it("scanSpecificFiles throws without a tsconfig", async () => {
      await expect(
        scanner.scanSpecificFiles(workspaceFolder, ["/nope/a.ts"]),
      ).rejects.toThrow();
    });

    it("throws a config-read error for invalid tsconfig JSON", async () => {
      fs.writeFileSync(path.join(tempDir, "tsconfig.json"), "{ not valid ");
      await expect(scanner.scanProject(workspaceFolder)).rejects.toThrow();
    });
  });

  describe("scanner private helpers", () => {
    const priv = () => scanner as any;

    it("getNameText handles undefined and unsupported nodes", () => {
      expect(priv().getNameText(undefined)).toBeNull();
      const source = ts.createSourceFile(
        "x.ts",
        "const a = {};",
        ts.ScriptTarget.Latest,
      );
      expect(priv().getNameText(source)).toBeNull();
    });

    it("getNameText reads computed property names", () => {
      const source = ts.createSourceFile(
        "x.ts",
        'class A { ["computed"]() {} }',
        ts.ScriptTarget.Latest,
        true,
      );
      const cls = source.statements[0] as ts.ClassDeclaration;
      const method = cls.members[0] as ts.MethodDeclaration;
      expect(priv().getNameText(method.name)).toBe("computed");
    });

    it("getTagName falls back to escapedText for non-identifier tag names", () => {
      expect(priv().getTagName({ tagName: { escapedText: "FOO" } })).toBe(
        "foo",
      );
      expect(priv().getTagName({ tagName: {} })).toBe("");
    });

    it("normalizeCustomTag strips a leading @ only when present", () => {
      expect(priv().normalizeCustomTag("@Legacy ")).toBe("legacy");
      expect(priv().normalizeCustomTag("Legacy")).toBe("legacy");
    });

    it("refreshCustomTagCache clears when no tags manager exists", async () => {
      const bare = new Scanner(ignoreManager);
      writeProject({
        "a.ts": "/** @deprecated old */ export const x = 1;\nconst y = x;",
      });
      const results = await bare.scanProject(workspaceFolder);
      expect(results.length).toBeGreaterThan(0);
    });

    it("getUsageNode unwraps call, new, property, element, and binding nodes", () => {
      const source = ts.createSourceFile(
        "x.ts",
        'new Foo(); foo.bar; foo["baz"]; const { a: b } = foo; plain;',
        ts.ScriptTarget.Latest,
        true,
      );
      const collect: ts.Node[] = [];
      const walk = (node: ts.Node) => {
        collect.push(node);
        ts.forEachChild(node, walk);
      };
      walk(source);
      const newExpr = collect.find(ts.isNewExpression)!;
      expect(ts.isIdentifier(priv().getUsageNode(newExpr))).toBe(true);
      const propAccess = collect.find(ts.isPropertyAccessExpression)!;
      expect(priv().getUsageNode(propAccess)).toBe(propAccess.name);
      const elemAccess = collect.find(ts.isElementAccessExpression)!;
      expect(priv().getUsageNode(elemAccess)).toBe(
        elemAccess.argumentExpression,
      );
      const binding = collect.find(ts.isBindingElement)!;
      expect(priv().getUsageNode(binding)).toBe(binding.propertyName);
      const plain = collect.find(
        (n) => ts.isIdentifier(n) && n.getText() === "plain",
      )!;
      expect(priv().getUsageNode(plain)).toBe(plain);
    });

    it("getPathKey preserves case on non-Windows platforms", () => {
      const original = process.platform;
      Object.defineProperty(process, "platform", { value: "linux" });
      try {
        expect(priv().getPathKey("/Foo/Bar.ts")).not.toBe(
          priv().getPathKey("/foo/bar.ts"),
        );
      } finally {
        Object.defineProperty(process, "platform", { value: original });
      }
    });

  });

  describe("scanner deprecation-marker coverage", () => {
    it("finds deprecation on variable statements and binding elements", async () => {
      writeProject({
        "a.ts": [
          "/** @deprecated use newVar */",
          "export const oldVar = 1;",
          "const holder = { prop: 1 };",
          "/** @deprecated */",
          "const { prop } = holder;",
          "const use = oldVar;",
        ].join("\n"),
      });
      const results = await scanner.scanProject(workspaceFolder);
      expect(
        results.some((r) => r.name === "oldVar" && r.kind !== "usage"),
      ).toBe(true);
    });

    it("respects ignoreDeprecatedInComments with real JSDoc", async () => {
      const withConfig = new Scanner(ignoreManager, tagsManager, {
        trustedPackages: [],
        excludePatterns: [],
        includePatterns: [],
        ignoreDeprecatedInComments: true,
        severity: "warning",
      } as any);
      writeProject({
        "a.ts": [
          "/** @deprecated real jsdoc */",
          "export function oldFn(): void {}",
          "// @deprecated fake line comment",
          "export function fineFn(): void {}",
          "oldFn();",
        ].join("\n"),
      });
      const results = await withConfig.scanProject(workspaceFolder);
      expect(results.some((r) => r.name === "oldFn")).toBe(true);
      expect(results.some((r) => r.name === "fineFn")).toBe(false);
    });

    it("uses custom tag descriptions when the tag has no comment", async () => {
      tagsManager.addTag({
        tag: "@sunset",
        label: "Sunset",
        description: "planned removal",
        enabled: true,
        color: "#ffffff",
      });
      const withTags = new Scanner(ignoreManager, tagsManager);
      writeProject({
        "a.ts": [
          "/** @sunset */",
          "export function fadingFn(): void {}",
          "fadingFn();",
        ].join("\n"),
      });
      const results = await withTags.scanProject(workspaceFolder);
      const declaration = results.find(
        (r) => r.name === "fadingFn" && r.kind !== "usage",
      );
      expect(declaration?.deprecationReason).toBe("planned removal");
    });

    it("reads deprecation decorators without call arguments", async () => {
      writeProject({
        "a.ts": [
          "function deprecated(target: any, key?: any): any {}",
          "class Api {",
          "  @deprecated",
          "  oldMethod(): void {}",
          "}",
          "new Api().oldMethod();",
        ].join("\n"),
      });
      const results = await scanner.scanProject(workspaceFolder);
      expect(
        results.some((r) => r.name === "oldMethod" && r.kind !== "usage"),
      ).toBe(true);
    });
  });

  describe("ignoreManager platform + defensive branches", () => {
    it("canonicalize preserves case off Windows", () => {
      const original = process.platform;
      Object.defineProperty(process, "platform", { value: "linux" });
      try {
        const manager = new IgnoreManager(makeContext());
        manager.ignoreFile("/Foo/Bar.ts");
        expect(manager.isFileIgnored("/foo/bar.ts")).toBe(false);
        expect(manager.isFileIgnored("/Foo/Bar.ts")).toBe(true);
      } finally {
        Object.defineProperty(process, "platform", { value: original });
      }
    });

    it("loads stored rules that already have every field", () => {
      const context = makeContext();
      (context.workspaceState.get as jest.Mock).mockReturnValue({
        files: ["/a.ts"],
        methods: { "/a.ts": ["m"] },
        filePatterns: ["spec"],
        methodPatterns: ["^get"],
      });
      const manager = new IgnoreManager(context);
      expect(manager.isFileIgnored("/a.ts")).toBe(true);
      expect(manager.isMethodIgnored("/a.ts", "m")).toBe(true);
    });

    it("removeMethodIgnore tolerates empty paths and unknown files", () => {
      ignoreManager.removeMethodIgnore("", "m");
      ignoreManager.removeMethodIgnore("/unknown.ts", "m");
      ignoreManager.ignoreMethod("/known.ts", "keep");
      ignoreManager.removeMethodIgnore("/known.ts", "other");
      expect(ignoreManager.isMethodIgnored("/known.ts", "keep")).toBe(true);
    });
  });

  describe("patternMatcher", () => {
    it("returns false for null pattern lists", () => {
      expect(matchesPattern("/a.ts", null as unknown as string[])).toBe(false);
    });

    it("anchors absolute patterns and caches compiled globs", () => {
      expect(matchesPattern("C:/proj/src/a.ts", ["C:/proj/**/*.ts"])).toBe(
        true,
      );
      // second call takes the cache-hit path
      expect(matchesPattern("C:/proj/src/b.ts", ["C:/proj/**/*.ts"])).toBe(
        true,
      );
      expect(matchesPattern("/rooted/a.ts", ["/rooted/*.ts"])).toBe(true);
    });
  });

  describe("tagsManager default branches", () => {
    it("keeps a provided id and applies defaults for optional fields", () => {
      const tag = tagsManager.addTag({
        id: "my-id",
        tag: "@fresh",
        label: "Fresh",
        description: undefined as unknown as string,
        enabled: undefined as unknown as boolean,
        color: undefined as unknown as string,
      });
      expect(tag.id).toBe("my-id");
      expect(tag.description).toBe("");
      expect(tag.enabled).toBe(true);
      expect(tag.color).toBe("#4ecdc4");
    });

    it("renames a tag", () => {
      const created = tagsManager.addTag({
        tag: "@renameme",
        label: "Rename",
        description: "",
        enabled: true,
        color: "#ffffff",
      });
      tagsManager.updateTag(created.id, { tag: "@renamed" });
      const updated = tagsManager.getAllTags().find((t) => t.id === created.id);
      expect(updated?.tag).toBe("@renamed");
    });
  });

  describe("scanner remaining branches", () => {
    const priv = () => scanner as any;

    it("scanFolder throws when no config exists anywhere", async () => {
      const sub = path.join(tempDir, "sub");
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, "a.ts"), "export const x = 1;");
      await expect(scanner.scanFolder(workspaceFolder, sub)).rejects.toThrow();
    });

    it("getNameText reads numeric computed property names", () => {
      const source = ts.createSourceFile(
        "x.ts",
        "class A { [42]() {} }",
        ts.ScriptTarget.Latest,
        true,
      );
      const cls = source.statements[0] as ts.ClassDeclaration;
      const method = cls.members[0] as ts.MethodDeclaration;
      expect(priv().getNameText(method.name)).toBe("42");
    });

    it("joins multi-part JSDoc comments into a reason", async () => {
      writeProject({
        "a.ts": [
          "/** @deprecated use {@link newFn} instead */",
          "export function oldFn(): void {}",
          "export function newFn(): void {}",
          "oldFn();",
        ].join("\n"),
      });
      const results = await scanner.scanProject(workspaceFolder);
      const decl = results.find(
        (r) => r.name === "oldFn" && r.kind !== "usage",
      );
      expect(decl?.deprecationReason).toContain("instead");
    });

    it("returns no reason for a custom tag with an empty description", async () => {
      tagsManager.addTag({
        tag: "@quiet",
        label: "Quiet",
        description: "",
        enabled: true,
        color: "#ffffff",
      });
      const withTags = new Scanner(ignoreManager, tagsManager);
      writeProject({
        "a.ts": ["/** @quiet */", "export function hushFn(): void {}"].join(
          "\n",
        ),
      });
      const results = await withTags.scanProject(workspaceFolder);
      const decl = results.find((r) => r.name === "hushFn");
      expect(decl?.deprecationReason).toBeUndefined();
    });

    it("getDecoratorName handles property, element, and opaque expressions", () => {
      const source = ts.createSourceFile(
        "x.ts",
        'ns.deprecated; obj["deprecated"]; obj[42]; (wrapped);',
        ts.ScriptTarget.Latest,
        true,
      );
      const expressions = source.statements.map(
        (statement) => (statement as ts.ExpressionStatement).expression,
      );
      expect(priv().getDecoratorName(expressions[0])).toBe("deprecated");
      expect(priv().getDecoratorName(expressions[1])).toBe("deprecated");
      expect(priv().getDecoratorName(expressions[2])).toBe("");
      expect(priv().getDecoratorName(expressions[3])).toBe("");
    });

    it("throws when the config file itself cannot be read", async () => {
      fs.writeFileSync(path.join(tempDir, "tsconfig.json"), "{ not json");
      await expect(scanner.scanProject(workspaceFolder)).rejects.toThrow(
        "Error reading config file",
      );
    });

    it("falls back to warning severity when the config omits it", async () => {
      const bare = new Scanner(ignoreManager, tagsManager, {} as any);
      writeProject({
        "a.ts": [
          "/** @deprecated gone */",
          "export function oldFn(): void {}",
          "oldFn();",
        ].join("\n"),
      });
      const results = await bare.scanProject(workspaceFolder);
      expect(results.length).toBeGreaterThanOrEqual(2);
      for (const item of results) {
        expect(item.severity).toBe("warning");
      }
    });

    it("skips usages whose declaration file is ignored", async () => {
      writeProject({
        "a.ts": [
          "/** @deprecated gone */",
          "export function oldFn(): void {}",
        ].join("\n"),
        "b.ts": 'import { oldFn } from "./a";\noldFn();',
      });
      ignoreManager.ignoreFile(path.join(tempDir, "a.ts"));
      const results = await scanner.scanProject(workspaceFolder);
      expect(results.filter((r) => r.kind === "usage")).toHaveLength(0);
    });

    it("covers unresolved identifiers, destructuring, and element access", async () => {
      writeProject({
        "a.ts": [
          "declare const missing: unknown;",
          "missing;",
          "const holder = {",
          "  /** @deprecated old prop */",
          "  prop: 1,",
          "  other: 2,",
          "};",
          "const { prop } = holder;",
          "const { other: renamed } = holder;",
          "const key = 'prop' as const;",
          "const dynamicKey: string = 'x';",
          "(holder as any)[dynamicKey];",
          "const arr = [1, 2];",
          "arr[0];",
          "arr[1 + 1];",
          "totallyUndeclared;",
        ].join("\n"),
      });
      const results = await scanner.scanProject(workspaceFolder);
      expect(Array.isArray(results)).toBe(true);
    });

    it("getReferencedDeclarations dedupes repeated declarations", () => {
      const source = ts.createSourceFile(
        "x.ts",
        'foo["bar"];',
        ts.ScriptTarget.Latest,
        true,
      );
      const decl = source.statements[0];
      const elem = (source.statements[0] as ts.ExpressionStatement)
        .expression as ts.ElementAccessExpression;
      const fakeChecker = {
        getSymbolAtLocation: () => undefined,
        getTypeAtLocation: () => ({
          flags: 0,
          getProperty: () => ({ getDeclarations: () => [decl, decl] }),
        }),
        getIndexInfoOfType: () => undefined,
      } as unknown as ts.TypeChecker;
      const result = priv().getReferencedDeclarations(elem, fakeChecker);
      expect(result).toHaveLength(1);
    });

    it("getReferencedDeclarations handles unresolved symbols and pattern bindings", () => {
      const source = ts.createSourceFile(
        "x.ts",
        "ghost; const [{ x }] = arr;",
        ts.ScriptTarget.Latest,
        true,
      );
      const collect: ts.Node[] = [];
      const walk = (node: ts.Node) => {
        collect.push(node);
        ts.forEachChild(node, walk);
      };
      walk(source);
      const fakeChecker = {
        getSymbolAtLocation: () => undefined,
        getTypeAtLocation: () => ({ getProperty: () => undefined }),
      } as unknown as ts.TypeChecker;
      const ghost = (source.statements[0] as ts.ExpressionStatement).expression;
      expect(priv().getReferencedDeclarations(ghost, fakeChecker)).toEqual([]);
      const patternBinding = collect
        .filter(ts.isBindingElement)
        .find((b) => !ts.isIdentifier(b.name))!;
      expect(patternBinding).toBeDefined();
      expect(
        priv().getReferencedDeclarations(patternBinding, fakeChecker),
      ).toEqual([]);
    });

    it("getUsageNode returns the name for shorthand binding elements", () => {
      const source = ts.createSourceFile(
        "x.ts",
        "const { shorthand } = foo;",
        ts.ScriptTarget.Latest,
        true,
      );
      const collect: ts.Node[] = [];
      const walk = (node: ts.Node) => {
        collect.push(node);
        ts.forEachChild(node, walk);
      };
      walk(source);
      const binding = collect.find(ts.isBindingElement)!;
      expect(priv().getUsageNode(binding)).toBe(binding.name);
    });
  });

  describe("barrel exports", () => {
    it("exposes runtime classes through the scanner and webview barrels", () => {
      const scannerBarrel = require("../../src/scanner");
      const webviewBarrel = require("../../src/webview");
      expect(scannerBarrel.Scanner).toBeDefined();
      expect(scannerBarrel.IgnoreManager).toBeDefined();
      expect(webviewBarrel.MainPanel).toBeDefined();
      expect(webviewBarrel.IgnorePanel).toBeDefined();
      expect(webviewBarrel.SettingsPanel).toBeDefined();
      expect(webviewBarrel.StatisticsPanel).toBeDefined();
    });
  });

  describe("configReader package.json failures", () => {
    it("warns and continues when package.json is unreadable", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      fs.writeFileSync(path.join(tempDir, "package.json"), "{ broken json");
      const reader = new ConfigReader();
      const config = await reader.loadConfiguration(tempDir);
      expect(config).toBeDefined();
      expect(warn).toHaveBeenCalledWith(
        "Failed to load configuration from package.json:",
        expect.anything(),
      );
      warn.mockRestore();
    });
  });
});
