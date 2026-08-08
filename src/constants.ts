import { CustomTag } from "./interfaces";

export const COMMAND_SCAN = "deprecatedTracker.scan";
export const COMMAND_SCAN_FOLDER = "deprecatedTracker.scanFolder";
export const COMMAND_SCAN_FILE = "deprecatedTracker.scanFile";
export const COMMAND_CHECK_REQUIREMENTS =
  "deprecatedTracker.checkRequirements";
export const STORAGE_KEY_IGNORE_RULES = "deprecatedTracker.ignoreRules";

export const SETTINGS_PANEL_ID = "deprecatedTrackerSettings";

export const OPEN_SETTINGS = "openSettings";
export const GET_CUSTOM_TAGS = "getCustomTags";
export const ADD_CUSTOM_TAG = "addCustomTag";
export const UPDATE_CUSTOM_TAG = "updateCustomTag";
export const DELETE_CUSTOM_TAG = "deleteCustomTag";
export const TOGGLE_CUSTOM_TAG = "toggleCustomTag";
export const CONFIRM_DELETE_CUSTOM_TAG = "confirmDeleteCustomTag";
export const CUSTOM_TAGS_DATA = "customTagsData";

export const MESSAGE_COMMANDS = {
  OPEN_FILE: "openFile",
  OPEN_FILE_AT_LINE: "openFileAtLine",
  IGNORE_METHOD: "ignoreMethod",
  IGNORE_FILE: "ignoreFile",
  SHOW_IGNORE_MANAGER: "showIgnoreManager",
  SCANNING: "scanning",
  RESULTS: "results",
  UPDATE_IGNORE_LIST: "updateIgnoreList",
  REMOVE_FILE_IGNORE: "removeFileIgnore",
  REMOVE_METHOD_IGNORE: "removeMethodIgnore",
  CLEAR_ALL: "clearAll",
  ADD_FILE_PATTERN: "addFilePattern",
  ADD_METHOD_PATTERN: "addMethodPattern",
  REMOVE_FILE_PATTERN: "removeFilePattern",
  REMOVE_METHOD_PATTERN: "removeMethodPattern",
  SAVE_FILTER_STATE: "saveFilterState",
  WEBVIEW_READY: "webviewReady",
  EXPORT_RESULTS: "exportResults",
  REFRESH_RESULTS: "refreshResults",
  UPDATE_STATISTICS: "updateStatistics",
  UPDATE_REQUIREMENTS: "updateRequirements",
  REFRESH_REQUIREMENTS: "refreshRequirements",
  RUN_REQUIREMENT_ACTION: "runRequirementAction",
  OPEN_SETTINGS,
  GET_CUSTOM_TAGS,
  ADD_CUSTOM_TAG,
  UPDATE_CUSTOM_TAG,
  DELETE_CUSTOM_TAG,
  TOGGLE_CUSTOM_TAG,
  CUSTOM_TAGS_DATA,
  VIEW_HISTORY: "viewHistory",
  VIEW_SCAN: "viewScan",
  EXPORT_HISTORICAL_SCAN: "exportHistoricalScan",
  CLEAR_HISTORY: "clearHistory",
  REQUEST_AI_PROMPT: "requestAiPrompt",
  SHOW_AI_PROMPT: "showAiPrompt",
  COPY_AI_PROMPT: "copyAiPrompt",
  SAVE_AI_PROMPT: "saveAiPrompt",
  AI_PROMPT_COPIED: "aiPromptCopied",
  AI_PROMPT_SAVED: "aiPromptSaved",
} as const;

export const STORAGE_KEY_FILTER_STATE = "deprecatedTracker.mainPanel.filters";
export const STORAGE_KEY_CUSTOM_TAGS = "deprecatedTracker.customTags";
export const STORAGE_KEY_SCAN_HISTORY = "deprecatedTracker.scanHistory";

export const DEFAULT_HISTORY_RETENTION = 10;
export const MAX_HISTORY_RESULTS_PER_SCAN = 500;

/** Programs retained across scans. Soft cap — see Scanner.trimProgramCache. */
export const MAX_CACHED_PROGRAMS = 8;

export const MINIMUM_VSCODE_VERSION = "1.74.0";

/** Characters of work list an AI fix prompt may carry. Whole symbols only. */
export const AI_PROMPT_CHAR_BUDGET = 8000;

/** Characters of a deprecation reason kept in an AI fix prompt. */
export const AI_PROMPT_REASON_MAX_CHARS = 200;

export const TSCONFIG_FILE = "tsconfig.json";
export const JSCONFIG_FILE = "jsconfig.json";

export const ERROR_MESSAGES = {
  SCAN_CANCELLED: "Scan cancelled by user",
  NO_WORKSPACE: "No workspace folder found",
  NO_TSCONFIG:
    "No tsconfig.json or jsconfig.json found anywhere in the workspace",
  SCAN_FAILED: "Scan failed",
  UNKNOWN_ERROR: "Unknown error occurred",
} as const;

export const DEFAULT_CUSTOM_TAGS: Array<Omit<CustomTag, "createdAt">> = [
  {
    id: "obsolete",
    tag: "@obsolete",
    label: "Obsolete",
    description: "Code no longer in use",
    enabled: true,
    color: "#ff6b6b",
  },
  {
    id: "legacy",
    tag: "@legacy",
    label: "Legacy",
    description: "Old code for compatibility",
    enabled: true,
    color: "#ffa500",
  },
  {
    id: "experimental",
    tag: "@experimental",
    label: "Experimental",
    description: "Unstable APIs",
    enabled: false,
    color: "#4ecdc4",
  },
] as const;
