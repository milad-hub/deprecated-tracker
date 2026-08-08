import { CustomTag } from "./custom-tags.interface";

export interface IgnoreChecker {
  isFileIgnored(filePath: string): boolean;
  isMethodIgnored(filePath: string, methodName: string): boolean;
}

export interface CustomTagSource {
  getEnabledTags(): CustomTag[];
}
