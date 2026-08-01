import { matchesPattern } from "../../src/utils/patternMatcher";

describe("matchesPattern", () => {
  it("matches relative globs against absolute paths", () => {
    expect(matchesPattern("D:/project/src/file.ts", ["*.ts"])).toBe(true);
    expect(matchesPattern("D:/project/src/nested/file.ts", ["src/**"])).toBe(
      true,
    );
    expect(matchesPattern("D:/project/file.ts", ["**/*.ts"])).toBe(true);
    expect(matchesPattern("D:/project/src/file.js", ["*.ts"])).toBe(false);
  });

  it("normalizes separators and treats regex characters literally", () => {
    expect(matchesPattern("D:\\project\\src\\file(legacy)+.ts", [
      "src/file(legacy)+.ts",
    ])).toBe(true);
    expect(matchesPattern("D:/project/src/filelegacy.ts", [
      "src/file(legacy)+.ts",
    ])).toBe(false);
  });

  it("supports single-character globs", () => {
    expect(matchesPattern("/project/src/file1.ts", ["file?.ts"])).toBe(true);
    expect(matchesPattern("/project/src/file10.ts", ["file?.ts"])).toBe(false);
  });

  // Patterns are compiled once and cached, so each platform case needs its own
  // pattern string.
  describe("platform-dependent casing", () => {
    const withPlatform = (platform: string, run: () => void): void => {
      const original = process.platform;
      Object.defineProperty(process, "platform", { value: platform });
      try {
        run();
      } finally {
        Object.defineProperty(process, "platform", { value: original });
      }
    };

    it("ignores case on Windows", () => {
      withPlatform("win32", () => {
        expect(
          matchesPattern("D:/Project/SRC/Win.ts", ["src/win.ts"]),
        ).toBe(true);
      });
    });

    it("respects case elsewhere", () => {
      withPlatform("linux", () => {
        expect(
          matchesPattern("/project/SRC/Nix.ts", ["src/nix.ts"]),
        ).toBe(false);
        expect(
          matchesPattern("/project/src/nix2.ts", ["src/nix2.ts"]),
        ).toBe(true);
      });
    });
  });
});
