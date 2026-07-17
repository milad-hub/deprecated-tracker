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
});
