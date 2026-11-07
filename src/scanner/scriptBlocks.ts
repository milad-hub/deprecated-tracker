import * as ts from "typescript";

export const SCRIPT_BLOCK_SUFFIX = ".__dt_script.ts";

export const SCRIPT_BLOCK_EXTENSIONS: readonly ts.FileExtensionInfo[] = [
  {
    extension: ".svelte",
    isMixedContent: true,
    scriptKind: ts.ScriptKind.Deferred,
  },
];

const COMMENT_OR_SCRIPT_BLOCK =
  /<!--[\s\S]*?(?:--!?>|$)|(<script\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/script\b[^>]*>)/gi;

const blankOut = (text: string): string => text.replace(/[^\n\r]/g, " ");

export function scriptBlocksOnly(text: string): string {
  let result = "";
  let last = 0;
  for (const match of text.matchAll(COMMENT_OR_SCRIPT_BLOCK)) {
    const [whole, open, body, close] = match;
    result += blankOut(text.slice(last, match.index));
    result +=
      open === undefined
        ? blankOut(whole)
        : blankOut(open) + body + blankOut(close);
    last = match.index + whole.length;
  }
  return result + blankOut(text.slice(last));
}

export function isScriptBlockHost(fileName: string): boolean {
  return SCRIPT_BLOCK_EXTENSIONS.some(({ extension }) =>
    fileName.toLowerCase().endsWith(extension),
  );
}

export function toVirtualName(fileName: string): string {
  return isScriptBlockHost(fileName)
    ? fileName + SCRIPT_BLOCK_SUFFIX
    : fileName;
}

export function toRealName(fileName: string): string {
  return fileName.endsWith(SCRIPT_BLOCK_SUFFIX)
    ? fileName.slice(0, -SCRIPT_BLOCK_SUFFIX.length)
    : fileName;
}

export function withScriptBlocks(
  host: ts.CompilerHost,
  readFile: (filePath: string) => string | undefined,
): ts.CompilerHost {
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  return {
    ...host,
    fileExists: (fileName) =>
      fileName.endsWith(SCRIPT_BLOCK_SUFFIX)
        ? readFile(toRealName(fileName)) !== undefined
        : fileExists(fileName),
    getSourceFile: (fileName, languageVersion, onError, shouldCreate) => {
      if (!fileName.endsWith(SCRIPT_BLOCK_SUFFIX)) {
        return getSourceFile(fileName, languageVersion, onError, shouldCreate);
      }
      const text = readFile(toRealName(fileName));
      return text === undefined
        ? undefined
        : ts.createSourceFile(
            fileName,
            `${scriptBlocksOnly(text)}\nexport {};\n`,
            languageVersion,
            true,
            ts.ScriptKind.TS,
          );
    },
  };
}
