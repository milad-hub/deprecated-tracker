#!/usr/bin/env node
/**
 * Exercise the worker bundle's message protocol, and prove cancel works.
 *
 * A cancel button that does not cancel is worse than no cancel button, and the
 * only way to know is to start a real scan and stop it mid-download. Node has no
 * Web Worker, so the worker's `self` is stood up by hand — the bundle only ever
 * touches `postMessage` and `onmessage`, which is exactly what makes that
 * possible.
 *
 *   node scripts/build-web.js && node scripts/worker-check.js [owner/repo]
 */
const path = require("path");
const assert = require("assert");
const { pathToFileURL } = require("url");

const workerBundle = path.resolve(__dirname, "..", "web", "dist", "worker.js");
const target = process.argv[2] || "vuejs/vue";

const events = [];
let onEvent = () => {};

globalThis.self = {
  postMessage: (event) => {
    events.push(event);
    onEvent(event);
  },
  onmessage: null,
};

const settled = (predicate, timeoutMs, what) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${what}`)),
      timeoutMs,
    );
    const check = (event) => {
      if (predicate(event)) {
        clearTimeout(timer);
        resolve(event);
      }
    };
    onEvent = check;
    events.forEach(check);
  });

(async () => {
  await import(pathToFileURL(workerBundle).href);
  const scope = globalThis.self;
  assert.ok(
    typeof scope.onmessage === "function",
    "the worker installed no message handler",
  );

  const send = (command) => scope.onmessage({ data: command });

  // 1. Cancel mid-flight. The scan is stopped as soon as it starts downloading,
  //    which is the phase that holds the network open and the memory down.
  send({
    type: "scan",
    id: "cancel-me",
    input: target,
    token: process.env.GITHUB_TOKEN,
  });
  const firstDownload = await settled(
    (event) =>
      event.type === "progress" && event.progress.phase === "downloading",
    120000,
    "the download phase",
  );
  process.stdout.write(`reached ${firstDownload.progress.phase}, cancelling\n`);
  send({ type: "cancel", id: "cancel-me" });

  const cancelled = await settled(
    (event) => event.type === "cancelled" && event.id === "cancel-me",
    120000,
    "a cancelled event",
  );
  assert.strictEqual(cancelled.id, "cancel-me");
  assert.ok(
    !events.some(
      (event) => event.type === "result" && event.id === "cancel-me",
    ),
    "a cancelled scan still delivered a result",
  );
  process.stdout.write("cancel: stopped and reported\n");

  // 2. A bad input is an error event, not a thrown exception in the worker.
  send({ type: "scan", id: "bad", input: "not a repository" });
  const failed = await settled(
    (event) => event.type === "error" && event.id === "bad",
    60000,
    "an error event",
  );
  process.stdout.write(`error path: ${failed.message}\n`);

  // 3. A refusal is a result, not an error: the answer is "too big for a
  //    browser", which the page has to be able to render.
  send({
    type: "scan",
    id: "huge",
    input: "microsoft/vscode",
    token: process.env.GITHUB_TOKEN,
  });
  const refused = await settled(
    (event) => event.type === "result" && event.id === "huge",
    180000,
    "a refusal result",
  );
  assert.ok(
    refused.result.refusal,
    "a repository past the cap came back without a refusal",
  );
  assert.strictEqual(
    refused.result.scanned.downloaded,
    0,
    "a refused scan downloaded files",
  );
  process.stdout.write(`refusal: ${refused.result.refusal.reason}\n`);

  const phases = new Set(
    events
      .filter((event) => event.type === "progress")
      .map((event) => event.progress.phase),
  );
  process.stdout.write(`phases seen: ${[...phases].join(", ")}\n`);
  process.stdout.write("worker protocol check passed\n");
  process.exit(0);
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
