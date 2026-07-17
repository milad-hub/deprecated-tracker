import * as fs from "fs";
import * as path from "path";

describe("debug build configuration", () => {
  it("builds the extension bundle and webview assets before F5", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve("package.json"), "utf8"),
    ) as { main: string; scripts: Record<string, string> };
    const tasks = JSON.parse(
      fs.readFileSync(path.resolve(".vscode", "tasks.json"), "utf8"),
    ) as { tasks: Array<{ script: string; isBackground?: boolean }> };

    expect(packageJson.main).toBe("./out/extension.js");
    expect(packageJson.scripts.build).toContain("npm run bundle");
    expect(packageJson.scripts.bundle).toContain("npm run copy-assets");
    expect(tasks.tasks[0]).toMatchObject({ script: "build" });
    expect(tasks.tasks[0].isBackground).not.toBe(true);
  });

  it("contains no dead commands or duplicate runtime dependencies", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve("package.json"), "utf8"),
    ) as {
      contributes: {
        commands: Array<{ command: string }>;
        menus: Record<string, unknown>;
      };
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(packageJson.contributes.commands).not.toContainEqual(
      expect.objectContaining({ command: "deprecatedTracker.ignoreMethod" }),
    );
    expect(packageJson.contributes.menus).not.toHaveProperty("view/item/context");
    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.devDependencies).toHaveProperty("typescript");
    expect(packageJson.devDependencies).not.toHaveProperty("rxjs");
    expect(packageJson.devDependencies).not.toHaveProperty("sharp");
  });
});
