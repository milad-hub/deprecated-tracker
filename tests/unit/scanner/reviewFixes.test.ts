import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Scanner } from "../../../src/scanner/scanner";
import { DeprecatedItem, DeprecatedTrackerConfig } from "../../../src/interfaces";

const ignore = { isFileIgnored: () => false, isMethodIgnored: () => false };
const strict = { strict: true, noEmit: true, target: "es2020" };

let root: string;

const write = (relative: string, text: string): void => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
};

const scanner = (config: DeprecatedTrackerConfig = {}): Scanner =>
  new Scanner(ignore, undefined, { trustedPackages: [], ...config });

const usages = (items: DeprecatedItem[]): string[] =>
  items
    .filter((item) => item.kind === "usage")
    .map(
      (item) =>
        `${path.relative(root, item.filePath).split(path.sep).join("/")}:${item.line}:${item.name}`,
    )
    .sort();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dt-review-"));
  write("package.json", "{}");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("scanner fixes from the deep review", () => {
  it("does not report a call to a healthy overload, and reports the deprecated one once", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: strict, include: ["src"] }));
    write(
      "src/lib.ts",
      "/** @deprecated string form */\nexport function over(x: string): void;\nexport function over(x: number): void;\nexport function over(x: unknown) { void x; }\n",
    );
    write("src/use.ts", 'import { over } from "./lib";\nover(1);\nover("a");\n');

    expect(usages(await scanner().scanProject(root))).toEqual(["src/use.ts:3:over"]);
  });

  it("reports an overloaded import only when every overload is deprecated", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: strict, include: ["src"] }));
    write(
      "src/lib.ts",
      "export const api = {\n  /** @deprecated a */\n  m(x: string): void;\n  /** @deprecated b */\n  m(x: number): void;\n} as unknown as { /** @deprecated a */ m(x: string): void; /** @deprecated b */ m(x: number): void };\n/** @deprecated a */\nexport function both(x: string): void;\n/** @deprecated b */\nexport function both(x: number): void;\n/** @deprecated c */\nexport function both(x: unknown) { void x; }\n",
    );
    write("src/use.ts", 'import { both } from "./lib";\nboth(1);\nconst ref = both;\nvoid ref;\n');

    expect(usages(await scanner().scanProject(root))).toEqual([
      "src/use.ts:1:both",
      "src/use.ts:2:both",
      "src/use.ts:3:both",
    ]);
  });

  it("keeps {@link} targets in the reason", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: strict, include: ["src"] }));
    write("src/lib.ts", "/** @deprecated Use {@link fresh} instead. */\nexport function old(): void {}\nexport function fresh(): void {}\n");

    const [declaration] = await scanner().scanProject(root);
    expect(declaration.deprecationReason).toBe("Use {@link fresh} instead.");
  });

  it("finds anonymous default exports, shorthand properties and constant keys", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: strict, include: ["src"] }));
    write("src/anon.ts", "/** @deprecated */\nexport default function () {}\n");
    write("src/obj.ts", "/** @deprecated */\nexport function legacy(): void {}\nexport const o = { legacy };\n");
    write(
      "src/key.ts",
      'export const api = {\n  /** @deprecated */\n  old: 1,\n  /** @deprecated */\n  0: 2,\n};\nconst key = "old";\nconst index = 0;\nexport const v = api[key];\nexport const w = api[index];\n',
    );
    write("src/use.ts", 'import anon from "./anon";\nanon();\n');

    expect(usages(await scanner().scanProject(root))).toEqual([
      "src/key.ts:10:0",
      "src/key.ts:9:old",
      "src/obj.ts:3:legacy",
      "src/use.ts:1:anon",
      "src/use.ts:2:anon",
    ]);
  });

  it("matches patterns against the path inside the project, not where it is checked out", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: strict, include: ["src", "../outside"] }));
    write("src/lib.ts", "/** @deprecated */\nexport function old(): void {}\n");
    write("src/use.ts", 'import { old } from "./lib";\nold();\n');
    fs.mkdirSync(path.join(root, "..", "outside"), { recursive: true });

    const items = await scanner({ excludePatterns: ["**/test/**", "/no/such/absolute/**"] }).scanProject(root);

    expect(usages(items)).toEqual(["src/use.ts:1:old", "src/use.ts:2:old"]);
  });

  it("matches files outside the project root against their full path", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "dt-outside-"));
    try {
      fs.writeFileSync(path.join(outside, "shared.ts"), "/** @deprecated */\nexport function shared(): void {}\nshared();\n");
      write("tsconfig.json", JSON.stringify({ compilerOptions: strict, files: [path.join(outside, "shared.ts")] }));

      const kept = await scanner({ excludePatterns: ["**/nothing/**"] }).scanProject(root);
      const dropped = await scanner({ excludePatterns: ["**/shared.ts"] }).scanProject(root);

      expect(kept.length).toBe(2);
      expect(dropped.length).toBe(0);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("still reports usages of code declared outside includePatterns", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: strict, include: ["src", "lib"] }));
    write("lib/legacy.ts", "/** @deprecated */\nexport function old(): void {}\n");
    write("src/app.ts", 'import { old } from "../lib/legacy";\nold();\n');

    const items = await scanner({ includePatterns: ["src/**/*.ts"] }).scanProject(root);

    expect(usages(items)).toEqual(["src/app.ts:1:old", "src/app.ts:2:old"]);
  });

  it("prefers the nearest tsconfig for a file two configs share", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: strict }));
    write(
      "packages/app/tsconfig.json",
      JSON.stringify({ compilerOptions: { ...strict, baseUrl: ".", paths: { "@lib/*": ["src/lib/*"] } }, include: ["src"] }),
    );
    write("packages/app/src/lib/api.ts", "/** @deprecated */\nexport function old(): void {}\n");
    write("packages/app/src/use.ts", "import { old } from '@lib/api';\nold();\n");

    expect(usages(await scanner().scanProject(root))).toEqual([
      "packages/app/src/use.ts:1:old",
      "packages/app/src/use.ts:2:old",
    ]);
  });

  it("scans every file of a folder, not only those a nested tsconfig owns", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: strict, include: ["packages"] }));
    write("packages/lib.ts", "/** @deprecated */\nexport function old(): void {}\n");
    write("packages/a/tsconfig.json", JSON.stringify({ compilerOptions: strict, include: ["src"] }));
    write("packages/a/src/x.ts", "import { old } from '../../lib';\nold();\n");
    write("packages/b/src/y.ts", "import { old } from '../../lib';\nold();\n");

    const items = await scanner().scanFolder(root, path.join(root, "packages"));

    expect(usages(items).filter((entry) => entry.endsWith(":2:old"))).toEqual([
      "packages/a/src/x.ts:2:old",
      "packages/b/src/y.ts:2:old",
    ]);
  });

  it("picks up an edit to an extended base config on the next scan", async () => {
    const base = (target: string): string =>
      JSON.stringify({ compilerOptions: { ...strict, baseUrl: ".", paths: { "@lib": [target] } } });
    write("tsconfig.base.json", base("src/v1.ts"));
    write("tsconfig.json", JSON.stringify({ extends: "./tsconfig.base.json", include: ["src"] }));
    write("src/v1.ts", "export function api(): void {}\n");
    write("src/v2.ts", "/** @deprecated */\nexport function api(): void {}\n");
    write("src/use.ts", "import { api } from '@lib';\napi();\n");
    const shared = scanner();

    expect(usages(await shared.scanProject(root))).toEqual([]);
    write("tsconfig.base.json", base("src/v2.ts"));
    fs.utimesSync(path.join(root, "tsconfig.base.json"), new Date(), new Date(Date.now() + 5000));

    expect(usages(await shared.scanProject(root))).toEqual(["src/use.ts:1:api", "src/use.ts:2:api"]);
  });

  it("leaves nested build output out of the built-in JavaScript config", async () => {
    write("packages/a/src/index.js", "/** @deprecated */\nexport function old() {}\nold();\n");
    write("packages/a/dist/index.js", "/** @deprecated */\nexport function old() {}\nold();\n");

    expect(usages(await scanner().scanProject(root))).toEqual(["packages/a/src/index.js:3:old"]);
  });

  it("keeps each Svelte component in its own scope", async () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: strict, include: ["src"] }));
    write("src/A.svelte", '<script lang="ts">\n  /** @deprecated */\n  function old(): void {}\n</script>\n');
    write("src/B.svelte", '<script lang="ts">\n  function old(): void {}\n  old();\n</script>\n');

    expect(usages(await scanner({ scanTemplates: true }).scanProject(root))).toEqual([]);
  });
});
