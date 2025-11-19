import * as vscode from "vscode";

export class Navigation {
  public static async openFile(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    await vscode.window.showTextDocument(uri);
  }

  public static async openFileAtLine(
    filePath: string,
    line: number,
    character?: number,
  ): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.window.showTextDocument(uri);
    const position = new vscode.Position(
      Math.max(0, line - 1),
      character ? Math.max(0, character - 1) : 0,
    );
    const selection = new vscode.Selection(position, position);
    document.selection = selection;
    vscode.window.activeTextEditor?.revealRange(
      selection,
      vscode.TextEditorRevealType.InCenter,
    );
  }
}