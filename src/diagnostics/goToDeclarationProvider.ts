import * as path from "path";
import * as vscode from "vscode";
import {
  DIAGNOSTIC_CODE_DEPRECATED_USAGE,
  SCANNABLE_EXTENSIONS,
} from "../constants";

/**
 * Files the provider is offered for. Derived from the scanner's extension list
 * so the two cannot drift: a document this extension never scans has no
 * diagnostic of ours on it and therefore nothing to jump to.
 */
export const CODE_ACTION_SELECTOR: vscode.DocumentSelector = {
  scheme: "file",
  pattern: `**/*{${SCANNABLE_EXTENSIONS.join(",")}}`,
};

/**
 * Offers "go to declaration" on a deprecated usage.
 *
 * Registered as a quick fix because that is the menu users reach for, but it
 * edits nothing — it navigates. Guessing a replacement out of the prose in a
 * `@deprecated` tag is the half of that idea that stays parked.
 */
export class GoToDeclarationProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  public provideCodeActions(
    _document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.code !== DIAGNOSTIC_CODE_DEPRECATED_USAGE) {
        continue;
      }
      for (const related of diagnostic.relatedInformation || []) {
        actions.push(toAction(diagnostic, related.location));
      }
    }

    return actions;
  }
}

function toAction(
  diagnostic: vscode.Diagnostic,
  location: vscode.Location,
): vscode.CodeAction {
  // Naming the file and line keeps two usages resolved at the same cursor
  // position apart, which a bare "Go to declaration" would not.
  const title = `Go to declaration (${path.basename(location.uri.fsPath)}:${
    location.range.start.line + 1
  })`;
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  // The built-in open command rather than one of ours: it already takes a
  // selection to reveal, and a contributed command would show up in the
  // palette as something a user can run with no arguments.
  action.command = {
    command: "vscode.open",
    title,
    arguments: [location.uri, { selection: location.range }],
  };
  return action;
}
