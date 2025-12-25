import { CustomTag } from "./interfaces";

export const EXTENSION_ID = "deprecated-tracker";
export const COMMAND_SCAN = "deprecatedTracker.scan";
export const COMMAND_SCAN_FOLDER = "deprecatedTracker.scanFolder";
export const COMMAND_SCAN_FILE = "deprecatedTracker.scanFile";
export const COMMAND_REFRESH = "deprecatedTracker.refresh";
export const COMMAND_OPEN_RESULTS = "deprecatedTracker.openResults";
export const WEBVIEW_PANEL_ID = "deprecatedTracker";
export const WEBVIEW_IGNORE_PANEL_ID = "deprecatedTrackerIgnore";
export const STORAGE_KEY_IGNORE_RULES = "deprecatedTracker.ignoreRules";
export const SIDEBAR_VIEW_ID = "deprecatedTrackerSidebar";

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
  RESCAN: "rescan",
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
  RESTORE_FILTER_STATE: "restoreFilterState",
  WEBVIEW_READY: "webviewReady",
  EXPORT_RESULTS: "exportResults",
  REFRESH_RESULTS: "refreshResults",
  SAVE_FILTER_PRESETS: "saveFilterPresets",
  LOAD_FILTER_PRESETS: "loadFilterPresets",
  APPLY_FILTER_PRESET: "applyFilterPreset",
  UPDATE_STATISTICS: "updateStatistics",
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
} as const;

export const STORAGE_KEY_FILTER_STATE = "deprecatedTracker.mainPanel.filters";
export const STORAGE_KEY_FILTER_PRESETS =
  "deprecatedTracker.mainPanel.filterPresets";
export const STORAGE_KEY_CUSTOM_TAGS = "deprecatedTracker.customTags";
export const STORAGE_KEY_SCAN_HISTORY = "deprecatedTracker.scanHistory";

export const DEFAULT_HISTORY_RETENTION = 50;

export const TSCONFIG_FILE = "tsconfig.json";
export const JSCONFIG_FILE = "jsconfig.json";
export const JS_EXTENSIONS = [".js", ".jsx", ".mjs"];
export const TS_EXTENSIONS = [".ts", ".tsx"];

export const ERROR_MESSAGES = {
  NO_WORKSPACE: "No workspace folder found",
  NO_TSCONFIG: "tsconfig.json or jsconfig.json not found in workspace root",
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
