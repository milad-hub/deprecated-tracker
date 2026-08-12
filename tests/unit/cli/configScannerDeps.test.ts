import {
  ignoresFromConfig,
  tagsFromConfig,
} from "../../../src/cli/configScannerDeps";

describe("tagsFromConfig", () => {
  it("returns undefined when no tags are configured", () => {
    expect(tagsFromConfig({})).toBeUndefined();
  });

  // undefined keeps the scanner on its clear-the-cache path; an empty source
  // would be a second way to say the same thing.
  it("returns undefined for an empty list", () => {
    expect(tagsFromConfig({ customTags: [] })).toBeUndefined();
  });

  it("exposes the configured tags to the scanner", () => {
    const source = tagsFromConfig({
      customTags: [{ tag: "@legacy", description: "Old" }],
    });

    expect(source?.getEnabledTags()).toEqual([
      { tag: "@legacy", description: "Old" },
    ]);
  });

  it("defaults a missing description to an empty string", () => {
    const source = tagsFromConfig({ customTags: [{ tag: "@legacy" }] });

    expect(source?.getEnabledTags()[0].description).toBe("");
  });
});

describe("ignoresFromConfig", () => {
  it("ignores nothing when no patterns are configured", () => {
    const ignores = ignoresFromConfig({});

    expect(ignores.isMethodIgnored("src/a.ts", "legacyThing")).toBe(false);
  });

  it("ignores a method matching a pattern", () => {
    const ignores = ignoresFromConfig({ ignoreMethods: ["^legacy[A-Z]"] });

    expect(ignores.isMethodIgnored("src/a.ts", "legacyThing")).toBe(true);
  });

  it("leaves a method that does not match", () => {
    const ignores = ignoresFromConfig({ ignoreMethods: ["^legacy[A-Z]"] });

    expect(ignores.isMethodIgnored("src/a.ts", "currentThing")).toBe(false);
  });

  // Matching the editor's method patterns, which are not scoped to a file.
  it("applies patterns in every file", () => {
    const ignores = ignoresFromConfig({ ignoreMethods: ["^internal_"] });

    expect(ignores.isMethodIgnored("a.ts", "internal_x")).toBe(true);
    expect(ignores.isMethodIgnored("b.ts", "internal_x")).toBe(true);
  });

  // excludePatterns already covers files, and the scanner applies it earlier.
  it("never ignores a whole file", () => {
    const ignores = ignoresFromConfig({ ignoreMethods: [".*"] });

    expect(ignores.isFileIgnored("src/a.ts")).toBe(false);
  });
});
