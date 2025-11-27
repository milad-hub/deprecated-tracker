export const EXTENSION_ID = 'deprecated-tracker';
export const COMMAND_SCAN = 'deprecatedTracker.scan';
export const COMMAND_SCAN_FOLDER = 'deprecatedTracker.scanFolder';
export const COMMAND_SCAN_FILE = 'deprecatedTracker.scanFile';
export const COMMAND_REFRESH = 'deprecatedTracker.refresh';
export const COMMAND_OPEN_RESULTS = 'deprecatedTracker.openResults';
export const WEBVIEW_PANEL_ID = 'deprecatedTracker';
export const WEBVIEW_IGNORE_PANEL_ID = 'deprecatedTrackerIgnore';
export const STORAGE_KEY_IGNORE_RULES = 'deprecatedTracker.ignoreRules';
export const SIDEBAR_VIEW_ID = 'deprecatedTrackerSidebar';

export const MESSAGE_COMMANDS = {
  RESCAN: 'rescan',
  OPEN_FILE: 'openFile',
  OPEN_FILE_AT_LINE: 'openFileAtLine',
  IGNORE_METHOD: 'ignoreMethod',
  IGNORE_FILE: 'ignoreFile',
  SHOW_IGNORE_MANAGER: 'showIgnoreManager',
  SCANNING: 'scanning',
  RESULTS: 'results',
  UPDATE_IGNORE_LIST: 'updateIgnoreList',
  REMOVE_FILE_IGNORE: 'removeFileIgnore',
  REMOVE_METHOD_IGNORE: 'removeMethodIgnore',
  CLEAR_ALL: 'clearAll',
  SAVE_FILTER_STATE: 'saveFilterState',
  RESTORE_FILTER_STATE: 'restoreFilterState',
  WEBVIEW_READY: 'webviewReady',
  EXPORT_RESULTS: 'exportResults',
  REFRESH_RESULTS: 'refreshResults',
} as const;

export const STORAGE_KEY_FILTER_STATE = 'deprecatedTracker.mainPanel.filters';

export const TSCONFIG_FILE = 'tsconfig.json';

export const ERROR_MESSAGES = {
  NO_WORKSPACE: 'No workspace folder found',
  NO_TSCONFIG: 'tsconfig.json not found in workspace root',
  SCAN_FAILED: 'Scan failed',
  UNKNOWN_ERROR: 'Unknown error occurred',
} as const;
