/**
 * The scan, off the main thread.
 *
 * `ts.createProgram` and the walk that follows it are synchronous for long
 * stretches. On the main thread a repository near the cap freezes the tab —
 * including the cancel button, which is the one control that matters while a
 * scan is running. So the engine runs here and talks in messages.
 *
 * The scanner awaits `setImmediate` between files, which the web build turns into
 * a `setTimeout`; that is what lets a `cancel` message be delivered mid-scan
 * rather than after it.
 */
import { WebScanRequest, WebScanResult, scanRepository } from "./scan";
import { GitHubError, isAbort } from "./github";
import type { ScanLimits } from "./limits";
import type { ScanProgress } from "./scan";

export type WorkerCommand =
  | {
      type: "scan";
      id: string;
      input: string;
      token?: string;
      limits?: ScanLimits;
    }
  | { type: "cancel"; id?: string };

export type WorkerEvent =
  | { type: "progress"; id: string; progress: ScanProgress }
  | { type: "result"; id: string; result: WebScanResult }
  | { type: "cancelled"; id: string }
  | {
      type: "error";
      id: string;
      message: string;
      status?: number;
      rateLimited?: boolean;
    };

const scope = self as unknown as {
  postMessage: (event: WorkerEvent) => void;
  onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null;
};

let running: { id: string; controller: AbortController } | undefined;

scope.onmessage = (event: MessageEvent<WorkerCommand>): void => {
  const command = event.data;

  if (command.type === "cancel") {
    if (running && (command.id === undefined || command.id === running.id)) {
      running.controller.abort();
    }
    return;
  }

  if (command.type === "scan") {
    void start(command);
  }
};

async function start(command: {
  type: "scan";
  id: string;
  input: string;
  token?: string;
  limits?: ScanLimits;
}): Promise<void> {
  // One scan at a time: a second request supersedes the first rather than
  // racing it for the same tab's memory, which is the resource the cap exists
  // to protect.
  running?.controller.abort();

  const controller = new AbortController();
  running = { id: command.id, controller };

  const request: WebScanRequest = {
    input: command.input,
    token: command.token,
    limits: command.limits,
    signal: controller.signal,
    onProgress: (progress) =>
      scope.postMessage({ type: "progress", id: command.id, progress }),
  };

  try {
    const result = await scanRepository(request);
    scope.postMessage({ type: "result", id: command.id, result });
  } catch (error) {
    if (isAbort(error) || controller.signal.aborted) {
      scope.postMessage({ type: "cancelled", id: command.id });
    } else if (error instanceof GitHubError) {
      scope.postMessage({
        type: "error",
        id: command.id,
        message: error.message,
        status: error.status,
        rateLimited: error.rateLimited,
      });
    } else {
      scope.postMessage({
        type: "error",
        id: command.id,
        message: (error as Error).message || "The scan failed.",
      });
    }
  } finally {
    if (running?.id === command.id) {
      running = undefined;
    }
  }
}
