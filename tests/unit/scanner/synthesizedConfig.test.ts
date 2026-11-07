import * as fs from "fs";
import * as path from "path";
import { ERROR_MESSAGES } from "../../../src/constants";
import { TagsManager } from "../../../src/config/tagsManager";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { Scanner } from "../../../src/scanner/scanner";

describe("a project with package.json and no tsconfig", () => {
  let scanner: Scanner;
  let tempDir: string;

  const write = (relative: string, content: string): string => {
    const fullPath = path.join(tempDir, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  };

  const library =
    "/** @deprecated Use newApi */\nfunction oldApi() { return 1; }\nmodule.exports = { oldApi };\n";
  const caller = 'const { oldApi } = require("./lib");\noldApi();\n';

  beforeEach(() => {
    const context = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn().mockReturnValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as any;
    scanner = new Scanner(new IgnoreManager(context), new TagsManager(context));
    tempDir = path.join(
      __dirname,
      "..",
      "..",
      "fixtures",
      "test-workspace-synthesized",
    );
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("scans the JavaScript with a built-in config and says so", async () => {
    write("package.json", JSON.stringify({ name: "plain" }));
    write("lib.js", library);
    write("index.js", caller);

    const results = await scanner.scanProject(tempDir);

    expect(results.some((item) => item.name === "oldApi")).toBe(true);
    expect(scanner.usedSynthesizedConfig()).toBe(true);
  });

  it("leaves build output and dependencies out", async () => {
    write("package.json", "{}");
    write("dist/lib.js", library);
    write("node_modules/dep/index.js", library);

    const results = await scanner.scanProject(tempDir);

    expect(results).toEqual([]);
  });

  it("never synthesizes beside a real config", async () => {
    write("package.json", "{}");
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { allowJs: true }, include: ["src"] }),
    );
    write("src/lib.js", library);

    await scanner.scanProject(tempDir);

    expect(scanner.usedSynthesizedConfig()).toBe(false);
  });

  it("still refuses a folder with neither a config nor a package.json", async () => {
    write("lib.js", library);

    await expect(scanner.scanProject(tempDir)).rejects.toThrow(
      ERROR_MESSAGES.NO_TSCONFIG,
    );
  });

  it("scans named files with the built-in config", async () => {
    write("package.json", "{}");
    write("lib.js", library);
    const target = write("index.js", caller);

    const results = await scanner.scanSpecificFiles(tempDir, [target]);

    expect(results.map((item) => item.name)).toContain("oldApi");
  });

  it("scans a folder with the built-in config", async () => {
    write("package.json", "{}");
    write("src/lib.js", library);
    write("src/index.js", caller.replace("./lib", "./lib.js"));

    const results = await scanner.scanFolder(
      tempDir,
      path.join(tempDir, "src"),
    );

    expect(results.some((item) => item.name === "oldApi")).toBe(true);
  });

  it("forgets the built-in config on the next scan", async () => {
    write("package.json", "{}");
    write("lib.js", library);
    await scanner.scanProject(tempDir);

    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { allowJs: true } }),
    );
    await scanner.scanProject(tempDir);

    expect(scanner.usedSynthesizedConfig()).toBe(false);
  });
});
