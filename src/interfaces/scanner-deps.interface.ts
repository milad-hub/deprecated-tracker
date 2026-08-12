import { CustomTag } from "./custom-tags.interface";

export interface IgnoreChecker {
  isFileIgnored(filePath: string): boolean;
  isMethodIgnored(filePath: string, methodName: string): boolean;
}

/**
 * The two fields the scanner reads off a tag. `label`, `color`, `id` and
 * `createdAt` exist for the settings page and never reach a scan, so a source
 * that has no editor behind it — a config file — is not made to invent them.
 */
export type ScannerCustomTag = Pick<CustomTag, "tag" | "description">;

export interface CustomTagSource {
  getEnabledTags(): ScannerCustomTag[];
}
