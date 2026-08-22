/**
 * `fs`, in a browser: every export throws.
 *
 * The web build aliases `fs` here. Nothing on the browser path should reach it —
 * the filesystem lives behind `ScannerPlatform`, and the virtual platform never
 * touches Node — but `nodePlatform` stays in the module graph because
 * `scanner.ts` names it as its default. Throwing is the point: a stub returning
 * empty results would report a scan as clean when it never read a file.
 */
function unavailable(name: string): never {
  throw new Error(
    `fs.${name} is not available in a browser — the scan must supply a ScannerPlatform`,
  );
}

export function statSync(): never {
  return unavailable("statSync");
}

export function readdirSync(): never {
  return unavailable("readdirSync");
}

export function readFileSync(): never {
  return unavailable("readFileSync");
}

export function existsSync(): never {
  return unavailable("existsSync");
}

export function writeFileSync(): never {
  return unavailable("writeFileSync");
}

export function realpathSync(): never {
  return unavailable("realpathSync");
}

export default {
  statSync,
  readdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  realpathSync,
};
