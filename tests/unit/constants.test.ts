import {
  COMMAND_SCAN,
  COMMAND_SCAN_FILE,
  COMMAND_SCAN_FOLDER,
  ERROR_MESSAGES,
  MESSAGE_COMMANDS,
  STORAGE_KEY_IGNORE_RULES,
  TSCONFIG_FILE,
} from "../../src/constants";

describe("constants", () => {
  it("keeps command and storage identifiers namespaced", () => {
    for (const value of [COMMAND_SCAN, COMMAND_SCAN_FILE, COMMAND_SCAN_FOLDER]) {
      expect(value).toMatch(/^deprecatedTracker\./);
    }
    expect(STORAGE_KEY_IGNORE_RULES).toMatch(/^deprecatedTracker\./);
  });

  it("keeps message commands unique", () => {
    const values = Object.values(MESSAGE_COMMANDS);
    expect(new Set(values).size).toBe(values.length);
  });

  it("exposes scanner errors and the TypeScript config filename", () => {
    expect(TSCONFIG_FILE).toBe("tsconfig.json");
    expect(ERROR_MESSAGES.NO_WORKSPACE).toBe("No workspace folder found");
    expect(ERROR_MESSAGES.NO_TSCONFIG).toContain("tsconfig.json");
  });
});
