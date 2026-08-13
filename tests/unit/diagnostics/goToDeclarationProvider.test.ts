import * as path from "path";
import * as vscode from "vscode";
import {
  DIAGNOSTIC_CODE_DEPRECATED_USAGE,
  SCANNABLE_EXTENSIONS,
} from "../../../src/constants";
import {
  CODE_ACTION_SELECTOR,
  GoToDeclarationProvider,
} from "../../../src/diagnostics/goToDeclarationProvider";

const declarationPath = path.join(path.sep, "repo", "src", "api.ts");

const at = (line: number): vscode.Range =>
  new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 0));

const usage = (
  declarationLine = 41,
  file = declarationPath,
): vscode.Diagnostic => {
  const diagnostic = new vscode.Diagnostic(
    at(3),
    "'oldApi' is deprecated",
    vscode.DiagnosticSeverity.Warning,
  );
  diagnostic.code = DIAGNOSTIC_CODE_DEPRECATED_USAGE;
  diagnostic.relatedInformation = [
    new vscode.DiagnosticRelatedInformation(
      new vscode.Location(vscode.Uri.file(file), at(declarationLine)),
      "'oldApi' is declared here",
    ),
  ];
  return diagnostic;
};

const provide = (...diagnostics: vscode.Diagnostic[]): vscode.CodeAction[] =>
  new GoToDeclarationProvider().provideCodeActions(
    {} as vscode.TextDocument,
    at(3),
    { diagnostics } as unknown as vscode.CodeActionContext,
  );

describe("the go-to-declaration action", () => {
  it("navigates to the declaration the diagnostic points at", () => {
    const [action] = provide(usage());

    expect(action.command).toEqual({
      command: "vscode.open",
      title: action.title,
      arguments: [
        expect.objectContaining({ fsPath: declarationPath }),
        { selection: at(41) },
      ],
    });
  });

  // Nothing is applied, so an action that edited anything would be a bug.
  it("carries no workspace edit", () => {
    expect(provide(usage())[0]).not.toHaveProperty("edit", expect.anything());
  });

  it("names the file and line, so two usages at one position stay apart", () => {
    const titles = provide(usage(41), usage(7)).map((action) => action.title);

    expect(titles).toEqual([
      "Go to declaration (api.ts:42)",
      "Go to declaration (api.ts:8)",
    ]);
  });

  // Without this the lightbulb entry is orphaned from the problem it answers.
  it("attaches the diagnostic it came from", () => {
    const diagnostic = usage();

    expect(provide(diagnostic)[0].diagnostics).toEqual([diagnostic]);
  });

  it("offers it as a quick fix", () => {
    expect(provide(usage())[0].kind).toBe(vscode.CodeActionKind.QuickFix);
    expect(GoToDeclarationProvider.providedCodeActionKinds).toEqual([
      vscode.CodeActionKind.QuickFix,
    ]);
  });
});

describe("diagnostics it must leave alone", () => {
  // The provider is registered per document, so every other linter's findings
  // arrive in the same context.
  it("ignores a diagnostic that is not ours", () => {
    const other = new vscode.Diagnostic(at(3), "unused variable");
    other.code = "no-unused-vars";
    other.relatedInformation = [
      new vscode.DiagnosticRelatedInformation(
        new vscode.Location(vscode.Uri.file(declarationPath), at(1)),
        "declared here",
      ),
    ];

    expect(provide(other)).toEqual([]);
  });

  // A usage whose declaration the scanner could not resolve has nowhere to go.
  it("offers nothing when the diagnostic carries no location", () => {
    const bare = new vscode.Diagnostic(at(3), "'oldApi' is deprecated");
    bare.code = DIAGNOSTIC_CODE_DEPRECATED_USAGE;

    expect(provide(bare)).toEqual([]);
  });

  it("offers nothing when there are no diagnostics at all", () => {
    expect(provide()).toEqual([]);
  });
});

describe("where the action is offered", () => {
  it("covers every extension the scanner can parse, and nothing else", () => {
    const pattern = (CODE_ACTION_SELECTOR as { pattern: string }).pattern;

    for (const extension of SCANNABLE_EXTENSIONS) {
      expect(pattern).toContain(extension);
    }
    expect(pattern).toBe("**/*{.ts,.tsx,.js,.jsx}");
    expect(CODE_ACTION_SELECTOR).toMatchObject({ scheme: "file" });
  });
});
