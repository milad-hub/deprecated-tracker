export type RequirementActionId = "openFolder" | "createTsconfig" | "reload";

export interface RequirementResult {
  id: string;
  label: string;
  detail: string;
  met: boolean;
  blocking: boolean;
  requiresRestart: boolean;
  remedy: string;
  action?: RequirementActionId;
}

export interface RequirementReport {
  requirements: RequirementResult[];
  unmetBlocking: boolean;
}
