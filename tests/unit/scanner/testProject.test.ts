import * as path from "path";
import * as vscode from "vscode";
import { TagsManager } from "../../../src/config/tagsManager";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { Scanner } from "../../../src/scanner/scanner";
import { DeprecatedItem } from "../../../src/interfaces";

describe("Scanner test project fixture", () => {
  const fixturePath = path.resolve(__dirname, "../../fixtures/test-project");
  const libraryFile = path.join(
    fixturePath,
    "packages",
    "library",
    "src",
    "api.ts",
  );
  const componentFile = path.join(
    fixturePath,
    "packages",
    "app",
    "src",
    "component.ts",
  );
  const negativeFile = path.join(
    fixturePath,
    "packages",
    "app",
    "src",
    "negative.ts",
  );
  const taggedFile = path.join(
    fixturePath,
    "packages",
    "library",
    "src",
    "tagged.ts",
  );
  const strangeFile = path.join(
    fixturePath,
    "packages",
    "library",
    "src",
    "strange.ts",
  );
  const edgeFile = path.join(
    fixturePath,
    "packages",
    "app",
    "src",
    "edge-usages.ts",
  );
  const appSourcePath = path.dirname(componentFile);
  const workspaceFolder: vscode.WorkspaceFolder = {
    uri: vscode.Uri.file(fixturePath),
    name: "test-project",
    index: 0,
  };

  const createScanner = (): Scanner => {
    const extensionUri = vscode.Uri.file(fixturePath);
    const context = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => []),
      },
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => []),
      },
      extensionPath: fixturePath,
      extensionUri,
      storagePath: fixturePath,
      globalStoragePath: fixturePath,
      logPath: fixturePath,
      extensionMode: vscode.ExtensionMode.Test,
      secrets: {} as vscode.SecretStorage,
      environmentVariableCollection: {} as vscode.EnvironmentVariableCollection,
      asAbsolutePath: (relativePath: string) =>
        vscode.Uri.joinPath(extensionUri, relativePath).fsPath,
      storageUri: extensionUri,
      globalStorageUri: extensionUri,
      logUri: extensionUri,
      extension: undefined,
      languageModelAccessInformation: undefined,
    } as unknown as vscode.ExtensionContext;
    return new Scanner(new IgnoreManager(context), new TagsManager(context));
  };

  const getUsageDeclarationNames = (
    results: DeprecatedItem[],
    filePath: string,
  ): string[] =>
    results
      .filter(
        (item) => item.kind === "usage" && item.filePath === filePath,
      )
      .map((item) => item.deprecatedDeclaration?.name || "");

  it("covers supported declarations, usages, and negative cases", async () => {
    const results = await createScanner().scanProject(workspaceFolder.uri.fsPath);
    const componentUsages = getUsageDeclarationNames(results, componentFile);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "oldMethod", filePath: libraryFile, kind: "method" }),
        expect.objectContaining({ name: "oldProperty", filePath: libraryFile, kind: "property" }),
        expect.objectContaining({ name: "oldAccessor", filePath: libraryFile, kind: "property" }),
        expect.objectContaining({ name: "oldArrow", filePath: libraryFile, kind: "function" }),
        expect.objectContaining({ name: "OldType", filePath: libraryFile, kind: "interface" }),
        expect.objectContaining({ name: "OldEnum", filePath: libraryFile, kind: "class" }),
        expect.objectContaining({ name: "OldNamespace", filePath: libraryFile, kind: "class" }),
        expect.objectContaining({ name: "constructor", filePath: libraryFile, kind: "method" }),
        expect.objectContaining({ name: "call", filePath: libraryFile, kind: "method" }),
        expect.objectContaining({ name: "new", filePath: libraryFile, kind: "method" }),
        expect.objectContaining({ name: "[index]", filePath: libraryFile, kind: "property" }),
        expect.objectContaining({ name: "oldCustom", deprecationReason: "Code no longer in use" }),
        expect.objectContaining({ name: "oldParameter", filePath: libraryFile, kind: "property" }),
      ]),
    );
    expect(componentUsages).toEqual(
      expect.arrayContaining([
        "oldMethod",
        "oldProperty",
        "oldAccessor",
        "oldSetting",
        "oldCustom",
        "oldComputed",
        "oldObjectMethod",
        "OldType",
        "OldEnum",
        "OldMember",
        "OldNamespace",
        "oldFunction",
        "oldArrow",
        "oldValue",
        "constructor",
        "call",
        "new",
        "[index]",
        "oldAmbient",
        "oldInterfaceMethod",
        "oldBaseMethod",
      ]),
    );
    expect(getUsageDeclarationNames(results, libraryFile)).toContain(
      "oldParameter",
    );
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: componentFile,
          kind: "usage",
          deprecationReason: "Use newAccessor instead",
          deprecatedDeclaration: expect.objectContaining({ name: "oldAccessor" }),
        }),
        expect.objectContaining({
          filePath: componentFile,
          kind: "usage",
          deprecationReason: "Code no longer in use",
          deprecatedDeclaration: expect.objectContaining({ name: "oldCustom" }),
        }),
      ]),
    );
    expect(getUsageDeclarationNames(results, negativeFile)).toEqual([]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "obsoleteTaggedMethod",
          filePath: taggedFile,
          deprecationReason: "Use TaggedService.modernCall instead",
        }),
        expect.objectContaining({
          name: "legacyTaggedMethod",
          filePath: taggedFile,
          deprecationReason: "Old code for compatibility",
        }),
        expect.objectContaining({ name: "reasonlessMethod", filePath: taggedFile }),
        expect.objectContaining({
          name: "oldCompat",
          filePath: libraryFile,
          deprecationReason: "Use compatFree instead",
        }),
        expect.objectContaining({ name: "старыйМетод", filePath: strangeFile }),
        expect.objectContaining({ name: "old$Method$$", filePath: strangeFile }),
        expect.objectContaining({ name: "old method with spaces", filePath: strangeFile }),
        expect.objectContaining({ name: "old-kebab-case", filePath: strangeFile }),
        expect.objectContaining({ name: "twin", filePath: strangeFile }),
        expect.objectContaining({ name: "oldStatic", filePath: strangeFile }),
        expect.objectContaining({ name: "oldGeneric", filePath: strangeFile }),
        expect.objectContaining({
          name: "hostileReason",
          filePath: strangeFile,
          deprecationReason: expect.stringContaining("{{placeholders}}"),
        }),
        expect.objectContaining({ name: "oldAbstract", filePath: strangeFile }),
        expect.objectContaining({ name: "nestedDeprecated", filePath: strangeFile }),
      ]),
    );

    const edgeUsages = getUsageDeclarationNames(results, edgeFile);
    expect(edgeUsages).toEqual(
      expect.arrayContaining([
        "oldMethod",
        "obsoleteTaggedMethod",
        "legacyTaggedMethod",
        "reasonlessMethod",
        "old method with spaces",
        "old-kebab-case",
        "twin",
        "oldStatic",
        "oldGeneric",
        "hostileReason",
        "старыйМетод",
        "old$Method$$",
        "nestedDeprecated",
        "oldAbstract",
        "ancientCall",
        "connect",
      ]),
    );
    expect(edgeUsages).not.toContain("each");
    expect(edgeUsages).not.toContain("modernCall");
    expect(getUsageDeclarationNames(results, strangeFile)).toContain(
      "oldFunction",
    );
    expect(getUsageDeclarationNames(results, componentFile)).toContain(
      "oldCompat",
    );
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "usage",
          filePath: edgeFile,
          deprecatedDeclaration: expect.objectContaining({
            name: "ancientCall",
            filePath: expect.stringContaining("legacy-lib"),
          }),
        }),
      ]),
    );
    expect(
      results.some(
        (item) =>
          item.deprecatedDeclaration?.filePath?.includes("lodash") ||
          item.filePath.includes("lodash"),
      ),
    ).toBe(false);

    const resultKeys = results.map((item) =>
      [
        item.filePath,
        item.line,
        item.character,
        item.kind,
        item.deprecatedDeclaration?.filePath,
        item.deprecatedDeclaration?.line,
      ].join(":"),
    );
    expect(new Set(resultKeys).size).toBe(resultKeys.length);
  });

  it("keeps folder and specific-file scan output scoped to requested files", async () => {
    const scanner = createScanner();
    const [folderResults, fileResults] = await Promise.all([
      scanner.scanFolder(workspaceFolder.uri.fsPath, appSourcePath),
      scanner.scanSpecificFiles(workspaceFolder.uri.fsPath, [componentFile]),
    ]);

    expect(getUsageDeclarationNames(folderResults, componentFile)).toContain("oldMethod");
    expect(folderResults.some((item) => item.filePath === libraryFile)).toBe(false);
    expect(getUsageDeclarationNames(fileResults, componentFile)).toContain("oldMethod");
    expect(fileResults.every((item) => item.filePath === componentFile)).toBe(true);
  });
});
