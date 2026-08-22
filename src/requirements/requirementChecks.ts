import * as vscode from "vscode";
import { MINIMUM_VSCODE_VERSION } from "../constants";
import {
  RequirementActionId,
  RequirementReport,
  RequirementResult,
} from "../interfaces";
import { findAllConfigFiles } from "../scanner/configDiscovery";
import { nodeDirectory } from "../scanner/nodeDirectory";

export interface RequirementCheck {
  id: string;
  label: string;
  blocking: boolean;
  requiresRestart: boolean;
  remedy: string;
  action?: RequirementActionId;
  check: () => { met: boolean; detail: string };
}

export function meetsMinimumVersion(
  actual: string | undefined,
  minimum: string,
): boolean {
  const parse = (value: string): number[] =>
    (value.match(/\d+/g) || []).slice(0, 3).map(Number);
  const actualParts = parse(actual || "");
  if (actualParts.length === 0) {
    return true;
  }
  const minimumParts = parse(minimum);
  for (let index = 0; index < minimumParts.length; index++) {
    const left = actualParts[index] === undefined ? 0 : actualParts[index];
    const right = minimumParts[index];
    if (left !== right) {
      return left > right;
    }
  }
  return true;
}

export const REQUIREMENT_CHECKS: RequirementCheck[] = [
  {
    id: "workspaceFolder",
    label: "A folder is open",
    blocking: false,
    requiresRestart: false,
    remedy:
      "Open the project you want to scan with File → Open Folder. Nothing to scan until then.",
    action: "openFolder",
    check: () => {
      const count = (vscode.workspace.workspaceFolders || []).length;
      return {
        met: count > 0,
        detail:
          count > 0
            ? `${count} folder${count === 1 ? "" : "s"} open`
            : "No folder or workspace is open",
      };
    },
  },
  {
    id: "workspaceTrust",
    label: "Workspace is trusted",
    blocking: true,
    requiresRestart: true,
    remedy:
      "Trust this workspace, then reload the window so the extension restarts with full access.",
    action: "reload",
    check: () => {
      const trusted = vscode.workspace.isTrusted !== false;
      return {
        met: trusted,
        detail: trusted
          ? "Workspace is trusted"
          : "VS Code restricts this extension in an untrusted workspace",
      };
    },
  },
  {
    id: "nodeHost",
    label: "Node-capable extension host",
    blocking: true,
    requiresRestart: false,
    remedy:
      "Open this project in the desktop VS Code app. The scanner reads files from disk and cannot run in a browser-only extension host.",
    check: () => {
      const runtime: { versions: { node?: string } } = globalThis.process || {
        versions: {},
      };
      const nodeVersion = runtime.versions.node;
      return {
        met: typeof nodeVersion === "string",
        detail:
          typeof nodeVersion === "string"
            ? `Node ${nodeVersion}`
            : "No Node runtime in this extension host",
      };
    },
  },
  {
    id: "hostVersion",
    label: `Editor version ${MINIMUM_VSCODE_VERSION} or newer`,
    blocking: true,
    requiresRestart: true,
    remedy: `Update your editor to ${MINIMUM_VSCODE_VERSION} or newer, then reload the window.`,
    action: "reload",
    check: () => {
      const met = meetsMinimumVersion(vscode.version, MINIMUM_VSCODE_VERSION);
      return {
        met,
        detail: met
          ? `Running ${vscode.version || "an unknown version"}`
          : `Running ${vscode.version}, which is older than ${MINIMUM_VSCODE_VERSION}`,
      };
    },
  },
  {
    id: "typescriptConfig",
    label: "tsconfig.json or jsconfig.json found",
    blocking: true,
    requiresRestart: false,
    remedy:
      "Add a tsconfig.json or jsconfig.json anywhere in the project. The scanner builds a TypeScript program from it and has nothing to scan without one.",
    action: "createTsconfig",
    check: () => {
      const folders = vscode.workspace.workspaceFolders || [];
      if (folders.length === 0) {
        return { met: true, detail: "Not checked — no folder is open" };
      }
      const configPaths = folders.flatMap((folder) =>
        findAllConfigFiles(folder.uri.fsPath, nodeDirectory),
      );
      return {
        met: configPaths.length > 0,
        detail:
          configPaths.length > 0
            ? `${configPaths.length} config file${configPaths.length === 1 ? "" : "s"} found`
            : "No tsconfig.json or jsconfig.json anywhere in the open folders",
      };
    },
  },
];

export function evaluateRequirements(): RequirementReport {
  const requirements: RequirementResult[] = REQUIREMENT_CHECKS.map(
    (requirement) => {
      const { met, detail } = requirement.check();
      return {
        id: requirement.id,
        label: requirement.label,
        detail,
        met,
        blocking: requirement.blocking,
        requiresRestart: requirement.requiresRestart,
        remedy: requirement.remedy,
        action: requirement.action,
      };
    },
  );

  return {
    requirements,
    unmetBlocking: requirements.some(
      (requirement) => !requirement.met && requirement.blocking,
    ),
  };
}
