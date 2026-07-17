import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Loads a webview HTML template and fills in the standard placeholders
 * ({{cspSource}}, {{scriptUri}}, {{styleUri}}, plus any extras).
 * Tries the compiled template first (VS Code fs, then Node fs), then the
 * source tree, and finally falls back to a static error page.
 */
export async function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  context: vscode.ExtensionContext,
  assetName: string,
  extraReplacements?: Record<string, string>,
): Promise<string> {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      "out",
      "src",
      "webview",
      "assets",
      `${assetName}.js`,
    ),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      "out",
      "src",
      "webview",
      "assets",
      "style.css",
    ),
  );

  let html =
    (await loadTemplate(extensionUri, context, assetName)) ??
    getFallbackHtml(webview, assetName);

  // Function replacers keep dollar-sign patterns in values literal.
  html = html
    .replace(/{{cspSource}}/g, () => webview.cspSource)
    .replace(/{{scriptUri}}/g, () => scriptUri.toString())
    .replace(/{{styleUri}}/g, () => styleUri.toString());
  for (const [key, value] of Object.entries(extraReplacements || {})) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), () => value);
  }

  return html;
}

async function loadTemplate(
  extensionUri: vscode.Uri,
  context: vscode.ExtensionContext,
  assetName: string,
): Promise<string | null> {
  const compiledTemplateUri = vscode.Uri.joinPath(
    extensionUri,
    "out",
    "src",
    "webview",
    "assets",
    `${assetName}.html`,
  );
  const sourceTemplatePath = path.join(
    context.extensionPath,
    "src",
    "webview",
    "assets",
    `${assetName}.html`,
  );

  try {
    const fileData = await vscode.workspace.fs.readFile(compiledTemplateUri);
    return new TextDecoder().decode(fileData);
  } catch (error) {
    console.warn("Failed to load template using VS Code API:", error);
  }

  try {
    return fs.readFileSync(compiledTemplateUri.fsPath, "utf8");
  } catch (error) {
    console.warn("Failed to load template from compiled path:", error);
  }

  try {
    return fs.readFileSync(sourceTemplatePath, "utf8");
  } catch (error) {
    console.error("Failed to load template from all paths:", error);
    return null;
  }
}

function getFallbackHtml(webview: vscode.Webview, assetName: string): string {
  return `<!DOCTYPE html>
            <html lang="en">
              <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};"/>
                  <title>Deprecated Tracker - Error</title>
                  <style>
                      body { font-family: var(--vscode-font-family); background-color: var(--vscode-editor-background); color: var(--vscode-foreground); padding: 20px; }
                      .error-container { text-align: center; margin-top: 50px; }
                      .error-title { color: var(--vscode-errorForeground); font-size: 18px; margin-bottom: 10px; }
                      .error-message { color: var(--vscode-descriptionForeground); }
                  </style>
              </head>
              <body>
                  <div class="error-container">
                      <div class="error-title">Failed to load ${assetName} HTML template</div>
                      <div class="error-message">Please check the extension installation and try again.</div>
                  </div>
              </body>
            </html>`;
}
