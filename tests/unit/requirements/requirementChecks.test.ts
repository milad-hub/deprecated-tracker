import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { MINIMUM_VSCODE_VERSION } from "../../../src/constants";
import {
  evaluateRequirements,
  meetsMinimumVersion,
} from "../../../src/requirements";

const workspaceMock = vscode.workspace as unknown as {
  workspaceFolders: Array<{ uri: vscode.Uri }> | undefined;
  isTrusted: boolean | undefined;
};

let tempRoot: string;

const requirement = (id: string) =>
  evaluateRequirements().requirements.find((entry) => entry.id === id)!;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dt-requirements-"));
  workspaceMock.workspaceFolders = undefined;
  workspaceMock.isTrusted = true;
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe("meetsMinimumVersion", () => {
  it("treats an unknown version as acceptable", () => {
    expect(meetsMinimumVersion(undefined, "1.74.0")).toBe(true);
    expect(meetsMinimumVersion("unreleased", "1.74.0")).toBe(true);
  });

  it("compares segment by segment", () => {
    expect(meetsMinimumVersion("1.74.0", "1.74.0")).toBe(true);
    expect(meetsMinimumVersion("1.90.2-insider", "1.74.0")).toBe(true);
    expect(meetsMinimumVersion("2.0.0", "1.74.0")).toBe(true);
    expect(meetsMinimumVersion("1.73.9", "1.74.0")).toBe(false);
    expect(meetsMinimumVersion("0.99.0", "1.74.0")).toBe(false);
  });

  it("treats missing trailing segments as zero", () => {
    expect(meetsMinimumVersion("1", "1.74.0")).toBe(false);
    expect(meetsMinimumVersion("1.74", "1.74.0")).toBe(true);
  });
});

describe("workspace folder requirement", () => {
  it("is unmet with no folder open", () => {
    const result = requirement("workspaceFolder");
    expect(result.met).toBe(false);
    expect(result.blocking).toBe(false);
    expect(result.detail).toContain("No folder");
    expect(result.action).toBe("openFolder");
  });

  it("counts one open folder in the singular", () => {
    workspaceMock.workspaceFolders = [{ uri: vscode.Uri.file(tempRoot) }];
    expect(requirement("workspaceFolder").detail).toBe("1 folder open");
  });

  it("counts several open folders in the plural", () => {
    workspaceMock.workspaceFolders = [
      { uri: vscode.Uri.file(tempRoot) },
      { uri: vscode.Uri.file(tempRoot) },
    ];
    const result = requirement("workspaceFolder");
    expect(result.met).toBe(true);
    expect(result.detail).toBe("2 folders open");
  });
});

describe("workspace trust requirement", () => {
  it("is met when the host does not report trust at all", () => {
    workspaceMock.isTrusted = undefined;
    expect(requirement("workspaceTrust").met).toBe(true);
  });

  it("is an unmet blocking requirement in an untrusted workspace", () => {
    workspaceMock.isTrusted = false;
    const result = requirement("workspaceTrust");
    expect(result.met).toBe(false);
    expect(result.blocking).toBe(true);
    expect(result.requiresRestart).toBe(true);
    expect(evaluateRequirements().unmetBlocking).toBe(true);
  });
});

describe("node host requirement", () => {
  it("reports the running Node version", () => {
    const result = requirement("nodeHost");
    expect(result.met).toBe(true);
    expect(result.detail).toBe(`Node ${process.versions.node}`);
  });

  it("is unmet when the host has no Node runtime", () => {
    jest.replaceProperty(
      globalThis,
      "process",
      undefined as unknown as NodeJS.Process,
    );
    const result = requirement("nodeHost");
    expect(result.met).toBe(false);
    expect(result.blocking).toBe(true);
    expect(result.detail).toContain("No Node runtime");
  });
});

describe("host version requirement", () => {
  it("passes on a supported host", () => {
    const result = requirement("hostVersion");
    expect(result.met).toBe(true);
    expect(result.detail).toBe(`Running ${vscode.version}`);
  });

  it("names the unknown version rather than printing undefined", () => {
    jest.replaceProperty(vscode, "version", undefined as unknown as string);
    expect(requirement("hostVersion").detail).toBe(
      "Running an unknown version",
    );
  });

  it("fails on a host older than the declared floor", () => {
    jest.replaceProperty(vscode, "version", "1.60.0");
    const result = requirement("hostVersion");
    expect(result.met).toBe(false);
    expect(result.detail).toBe(
      `Running 1.60.0, which is older than ${MINIMUM_VSCODE_VERSION}`,
    );
  });
});

describe("typescript config requirement", () => {
  it("is not checked when no folder is open", () => {
    const result = requirement("typescriptConfig");
    expect(result.met).toBe(true);
    expect(result.detail).toContain("no folder is open");
  });

  it("is an unmet blocking requirement when the folder has no config", () => {
    workspaceMock.workspaceFolders = [{ uri: vscode.Uri.file(tempRoot) }];
    const result = requirement("typescriptConfig");
    expect(result.met).toBe(false);
    expect(result.blocking).toBe(true);
    expect(result.action).toBe("createTsconfig");
  });

  it("finds a config nested below the folder root", () => {
    const nested = path.join(tempRoot, "packages", "app");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "jsconfig.json"), "{}");
    workspaceMock.workspaceFolders = [{ uri: vscode.Uri.file(tempRoot) }];
    const result = requirement("typescriptConfig");
    expect(result.met).toBe(true);
    expect(result.detail).toBe("1 config file found");
  });

  it("counts configs across every open folder", () => {
    const second = fs.mkdtempSync(path.join(os.tmpdir(), "dt-requirements-b-"));
    fs.writeFileSync(path.join(tempRoot, "tsconfig.json"), "{}");
    fs.writeFileSync(path.join(second, "tsconfig.json"), "{}");
    workspaceMock.workspaceFolders = [
      { uri: vscode.Uri.file(tempRoot) },
      { uri: vscode.Uri.file(second) },
    ];
    expect(requirement("typescriptConfig").detail).toBe("2 config files found");
    fs.rmSync(second, { recursive: true, force: true });
  });
});

describe("evaluateRequirements", () => {
  it("reports no blocking failure when only the folder check is unmet", () => {
    const report = evaluateRequirements();
    expect(report.requirements).toHaveLength(5);
    expect(report.requirements.filter((entry) => !entry.met)).toHaveLength(1);
    expect(report.unmetBlocking).toBe(false);
  });
});
