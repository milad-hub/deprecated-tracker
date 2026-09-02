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
  return `::warning file=${escapeGithubProperty(file)},line=${item.line},col=${item.character}::${escapeGithub(describe(item))}`;
}

function azureLine(item: DeprecatedItem, root: string): string {
  const file = PathUtils.relativeTo(root, item.filePath);
  return `##vso[task.logissue type=warning;sourcepath=${escapeAzureProperty(file)};linenumber=${item.line};columnnumber=${item.character}]${escapeAzure(describe(item))}`;
}

/** Workflow commands are newline delimited and read %0A/%0D/%25 as escapes. */
function escapeGithub(message: string): string {
  return message
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

/**
 * A property value ends at the next comma, so a comma in a filename splits the
 * list: a file named `x,line=1,col=1` supplies its own line and column and
 * points the warning at code it did not come from.
 */
function escapeGithubProperty(value: string): string {
  return escapeGithub(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/**
 * Azure reads one logging command per line, so a newline in the message starts
 * a second one and `##vso[task.complete result=Succeeded]` inside a deprecation
 * reason would report the build as passed. Nothing escaped this before 2.7.1:
 * it was safe only because `describe` collapses whitespace, which is protection
 * living in an unrelated function that does not know it is load-bearing.
 */
function escapeAzure(message: string): string {
  return message
    .replace(/%/g, "%AZP25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

/** Properties are `;` delimited and the list itself ends at the first `]`. */
function escapeAzureProperty(value: string): string {
  return escapeAzure(value).replace(/;/g, "%3B").replace(/]/g, "%5D");
}
