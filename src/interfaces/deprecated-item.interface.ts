export type DeprecatedItemKind =
  | "method"
  | "property"
  | "class"
  | "interface"
  | "function"
  | "usage";

export type DeprecationUrgency = "removed" | "scheduled" | "announced";

export interface DeprecationSchedule {
  urgency: DeprecationUrgency;
  sinceVersion?: string;
  sinceDate?: string;
  removalVersion?: string;
  removalDate?: string;
}

export interface DeprecatedItem {
  name: string;
  fileName: string;
  filePath: string;
  line: number;
  character: number;
  /**
   * Column just past the reported token, 1-based like `character`. Set for
   * usages, where `name` can fall back to the declaration's name and therefore
   * cannot be trusted to describe the width of the source text.
   */
  endCharacter?: number;
  kind: DeprecatedItemKind;
  deprecatedDeclaration?: {
    name: string;
    filePath: string;
    fileName: string;
    line: number;
  };
  severity?: "info" | "warning" | "error";
  deprecationReason?: string;
  deprecationSchedule?: DeprecationSchedule;
}
