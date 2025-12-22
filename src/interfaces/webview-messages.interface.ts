export interface WebviewMessage {
  command: string;
  [key: string]: unknown;
}

export interface RescanMessage extends WebviewMessage {
  command: "rescan";
}

export interface OpenFileMessage extends WebviewMessage {
  command: "openFile";
  filePath: string;
}

export interface OpenFileAtLineMessage extends WebviewMessage {
  command: "openFileAtLine";
  filePath: string;
  line: number;
}

export interface IgnoreMethodMessage extends WebviewMessage {
  command: "ignoreMethod";
  filePath: string;
  methodName: string;
}

export interface IgnoreFileMessage extends WebviewMessage {
  command: "ignoreFile";
  filePath: string;
}

export interface ScanningMessage extends WebviewMessage {
  command: "scanning";
  scanning: boolean;
}

export interface ResultsMessage extends WebviewMessage {
  command: "results";
  results: unknown[];
}

export interface SaveFilterStateMessage extends WebviewMessage {
  command: "saveFilterState";
  nameFilter: string;
  fileFilter: string;
}

export interface RestoreFilterStateMessage extends WebviewMessage {
  command: "restoreFilterState";
  nameFilter: string;
  fileFilter: string;
}
