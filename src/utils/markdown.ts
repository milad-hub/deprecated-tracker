/**
 * Makes a value safe inside a Markdown table cell: an unescaped pipe ends the
 * column early and a newline ends the row, so one deprecation reason with a
 * line break in it would silently shift every cell after it.
 */
export function escapeMarkdownCell(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r\n|\r|\n/g, "<br>");
}
