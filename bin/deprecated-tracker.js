#!/usr/bin/env node
"use strict";

const { run } = require("../out/cli.js");
const { version } = require("../package.json");

run(process.argv.slice(2), { version })
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`deprecated-tracker crashed: ${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 3;
  });
