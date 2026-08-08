import { MAX_CI_ANNOTATIONS } from "../constants";
import { DeprecatedItem } from "../interfaces";
import { PathUtils } from "../utils";
import { AnnotationStyle } from "./args";
import { BaselineComparison } from "./baseline";
import { describe } from "./reporters";

/**
 * Annotates only the files whose count rose above the baseline. Annotating
 * everything would bury a two-line regression under the whole backlog, which
 * is the failure mode a ratchet exists to avoid. With no baseline there is
 * nothing to compare against, so every item is annotated.
 */
export function buildAnnotations(
  style: AnnotationStyle,
  items: DeprecatedItem[],
  comparison: BaselineComparison,
  root: string,
): string[] {
  if (style === "none") {
    return [];
  }

  const risen = new Set(comparison.risenFiles.map((file) => file.file));
  const relevant = comparison.hasBaseline
    ? items.filter((item) =>
        risen.has(PathUtils.relativeTo(root, item.filePath)),
      )
    : items;

  const lines = relevant
    .slice(0, MAX_CI_ANNOTATIONS)
    .map((item) =>
      style === "github" ? githubLine(item, root) : azureLine(item, root),
    );

  const hidden = relevant.length - lines.length;
  if (hidden > 0) {
    lines.push(
      style === "github"
        ? `::warning::${hidden} more deprecated item(s) not annotated`
        : `##vso[task.logissue type=warning]${hidden} more deprecated item(s) not annotated`,
    );
  }

  return lines;
}

function githubLine(item: DeprecatedItem, root: string): string {
  const file = PathUtils.relativeTo(root, item.filePath);
  return `::warning file=${file},line=${item.line},col=${item.character}::${escapeGithub(describe(item))}`;
}

function azureLine(item: DeprecatedItem, root: string): string {
  const file = PathUtils.relativeTo(root, item.filePath);
  return `##vso[task.logissue type=warning;sourcepath=${file};linenumber=${item.line};columnnumber=${item.character}]${describe(item)}`;
}

/** Workflow commands are newline delimited and read %0A/%0D/%25 as escapes. */
function escapeGithub(message: string): string {
  return message
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}
