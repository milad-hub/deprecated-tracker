import { pathKey } from "../../../src/utils/pathKey";

const withPlatform = (platform: string, assert: () => void): void => {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform });
  try {
    assert();
  } finally {
    if (original) {
      Object.defineProperty(process, "platform", original);
    }
  }
};

describe("pathKey", () => {
  it("folds case on Windows, where the filesystem does", () => {
    withPlatform("win32", () => {
      expect(pathKey("C:\\Repo\\Src\\A.ts")).toBe("c:\\repo\\src\\a.ts");
    });
  });

  // Foo.ts and foo.ts are two files on Linux. Folding would merge them, and
  // one of the two would silently drop out of the scan.
  it("preserves case elsewhere", () => {
    withPlatform("linux", () => {
      expect(pathKey("/repo/src/Foo.ts")).toBe("/repo/src/Foo.ts");
    });
  });

  it("keeps two case-different paths distinct off Windows", () => {
    withPlatform("darwin", () => {
      expect(pathKey("/repo/A.ts")).not.toBe(pathKey("/repo/a.ts"));
    });
  });
});
