import * as fs from "fs";
import * as path from "path";
import { TagsManager } from "../../../src/config/tagsManager";
import { IgnoreManager } from "../../../src/scanner/ignoreManager";
import { Scanner } from "../../../src/scanner/scanner";

describe("JavaScript a tsconfig leaves out", () => {
  let scanner: Scanner;
  let tempDir: string;

  const write = (relative: string, content: string): void => {
    const fullPath = path.join(tempDir, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  };

  const tsconfig = (compilerOptions: object = {}): string =>
    JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        ...compilerOptions,
      },
      include: ["src"],
    });

  const deprecated =
    "/** @deprecated Use b */\nexport function a() { return 1; }\n";

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
      "test-workspace-skipped-js",
    );
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("counts every JavaScript flavour the program drops without allowJs", async () => {
    write("tsconfig.json", tsconfig());
    write("src/a.ts", deprecated);
    write("src/b.js", deprecated);
    write("src/c.mjs", deprecated);
    write("src/d.cjs", deprecated);
    write("src/e.jsx", deprecated);

    await scanner.scanProject(tempDir);

    expect(scanner.getSkippedJavaScriptCount()).toBe(4);
  });

  it("counts nothing when the project already enables allowJs", async () => {
    write("tsconfig.json", tsconfig({ allowJs: true }));
    write("src/a.ts", deprecated);
    write("src/b.js", deprecated);

    await scanner.scanProject(tempDir);

    expect(scanner.getSkippedJavaScriptCount()).toBe(0);
  });

  it("counts a file an explicit allowJs false shuts out", async () => {
    write("tsconfig.json", tsconfig({ allowJs: false }));
    write("src/b.js", deprecated);

    await scanner.scanProject(tempDir);

    expect(scanner.getSkippedJavaScriptCount()).toBe(1);
  });

  it("does not count a file another program in the scan did read", async () => {
    write(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { target: "ES2020" },
        include: ["**/*"],
      }),
    );
    write("src/b.js", deprecated);
    write("pkg/tsconfig.json", tsconfig({ allowJs: true }));
    write("pkg/src/x.js", deprecated);

    await scanner.scanProject(tempDir);

    expect(scanner.getSkippedJavaScriptCount()).toBe(1);
  });

  it("starts from zero on the next scan", async () => {
    write("tsconfig.json", tsconfig());
    write("src/b.js", deprecated);
    await scanner.scanProject(tempDir);

    fs.rmSync(path.join(tempDir, "src", "b.js"));
    write("src/a.ts", deprecated);
    await scanner.scanProject(tempDir);

    expect(scanner.getSkippedJavaScriptCount()).toBe(0);
  });
});
