/**
 * The page around the engine.
 *
 * Everything here is presentation and plumbing: the scan itself lives in
 * `dist/worker.js`, off the main thread, because a repository near the cap makes
 * the compiler run synchronously for long enough to freeze the tab — including
 * the cancel button, which is the one control that matters while it runs.
 *
 * Rows are built with `textContent` and `createElement`, never `innerHTML`, so a
 * symbol name or a `@deprecated` reason out of a stranger's repository is text
 * on arrival and cannot become markup.
 */

const REPO_LINK = 'https://github.com';
const SITE_URL = 'https://milad-hub.github.io/deprecated-tracker/';
/** Rows rendered before the browser is asked to lay out thousands of cells. */
const FIRST_PAGE = 250;

const BAND_SEGMENTS = [
  { key: 'documented', label: 'documented', hint: 'migrate the call sites' },
  { key: 'bare', label: 'no reason', hint: 'write the reason, one line each' },
  { key: 'unused', label: 'unused', hint: 'safe to delete now' },
];

const REFUSAL_TITLES = {
  'too-many-files': 'Too large to scan in a browser',
  'too-many-bytes': 'Too large to scan in a browser',
  'no-source': 'Nothing to scan',
  'no-config': 'No TypeScript project found',
  'invalid-limits': 'The scan limits are unusable',
};

const el = (id) => document.getElementById(id);

/**
 * Every link here leaves for GitHub, and a scan can take a minute to produce —
 * navigating away throws it out. `noopener` is not optional with a named
 * target: without it the opened page can reach back through `window.opener`.
 */
function openInNewTab(anchor) {
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
}

const form = el('scanForm');
const input = el('repoInput');
const scanButton = el('scanButton');
const cancelButton = el('cancelButton');
const statusBox = el('status');
const resultBox = el('result');

let worker;
let currentId = 0;
let running = false;
let lastResult;
let activeClassification = null;
let showingAll = false;

/* -------------------------------------------------------------------------
   The worker
   ---------------------------------------------------------------------- */

function ensureWorker() {
  if (worker) {
    return worker;
  }

  // A classic worker, not a module one: the bundle is an IIFE that imports
  // nothing at runtime, so requiring Firefox 114 or Safari 15 for
  // `type: 'module'` would buy nothing at all.
  worker = new Worker(new URL('./dist/worker.js', import.meta.url));
  worker.onmessage = (event) => handleEvent(event.data);
  worker.onerror = () => {
    // A worker that fails to load is not a failed scan: the page is broken, and
    // saying "scan failed" would send the reader to look at their repository.
    finish();
    showStatus(
      'error',
      'The scanner could not be loaded.',
      'Reload the page. If it keeps happening, the bundle at dist/worker.js is missing or blocked.'
    );
  };
  return worker;
}

function handleEvent(event) {
  if (event.id !== String(currentId)) {
    return; // A superseded scan.
  }

  if (event.type === 'progress') {
    showProgress(event.progress);
  } else if (event.type === 'result') {
    finish();
    render(event.result);
  } else if (event.type === 'cancelled') {
    finish();
    showStatus('', 'Scan cancelled.', '');
  } else if (event.type === 'error') {
    finish();
    showStatus('error', errorTitle(event), event.message);
  }
}

function errorTitle(event) {
  if (event.rateLimited) {
    return "GitHub's rate limit is used up";
  }
  if (event.status === 404) {
    return 'No such public repository';
  }
  return 'The scan failed';
}

/* -------------------------------------------------------------------------
   Running one
   ---------------------------------------------------------------------- */

function startScan(value) {
  const repo = value.trim();
  if (!repo) {
    input.focus();
    return;
  }

  input.value = repo;
  currentId += 1;
  running = true;
  activeClassification = null;
  showingAll = false;
  scanButton.disabled = true;
  cancelButton.hidden = false;
  resultBox.hidden = true;

  // The share link is the whole distribution mechanism, so it exists from the
  // moment the scan starts rather than only once it succeeds.
  const url = new URL(location.href);
  url.searchParams.set('repo', repo);
  history.replaceState(null, '', url);

  showStatus('', `Scanning ${repo}…`, 'Resolving the repository');
  ensureWorker().postMessage({
    type: 'scan',
    id: String(currentId),
    input: repo,
  });
}

function finish() {
  running = false;
  scanButton.disabled = false;
  cancelButton.hidden = true;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  startScan(input.value);
});

cancelButton.addEventListener('click', () => {
  if (running) {
    worker.postMessage({ type: 'cancel', id: String(currentId) });
  }
});

document.querySelectorAll('.example').forEach((button) => {
  button.addEventListener('click', () => startScan(button.dataset.repo));
});

/* -------------------------------------------------------------------------
   Status
   ---------------------------------------------------------------------- */

function showStatus(kind, title, detail, fraction) {
  statusBox.hidden = false;
  statusBox.className = `status${kind ? ` ${kind}` : ''}`;
  statusBox.replaceChildren();

  const titleEl = document.createElement('p');
  titleEl.className = 'status-title';
  titleEl.textContent = title;
  statusBox.appendChild(titleEl);

  if (detail) {
    const detailEl = document.createElement('p');
    detailEl.className = 'status-detail';
    detailEl.textContent = detail;
    statusBox.appendChild(detailEl);
  }

  if (fraction !== undefined) {
    const track = document.createElement('div');
    track.className = 'progress-track';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${Math.round(fraction * 100)}%`;
    track.appendChild(fill);
    statusBox.appendChild(track);
  }
}

const PHASES = {
  resolving: 'Resolving the repository',
  listing: 'Listing the files',
  downloading: 'Downloading source files',
  scanning: 'Type-checking',
  done: 'Finishing',
};

function showProgress(progress) {
  const fraction =
    progress.total && progress.loaded !== undefined ? progress.loaded / progress.total : undefined;

  const counted =
    progress.total !== undefined && progress.loaded !== undefined
      ? ` ${progress.loaded} of ${progress.total}`
      : progress.total !== undefined
        ? ` ${progress.total} files`
        : '';

  showStatus(
    '',
    `Scanning ${input.value}…`,
    `${PHASES[progress.phase] || progress.phase}${counted}`,
    fraction
  );
}

/* -------------------------------------------------------------------------
   The result
   ---------------------------------------------------------------------- */

function render(result) {
  lastResult = result;

  if (result.refusal) {
    resultBox.hidden = true;
    showStatus(
      'refusal',
      REFUSAL_TITLES[result.refusal.reason] || 'The scan was refused',
      result.refusal.message
    );
    return;
  }

  statusBox.hidden = true;
  resultBox.hidden = false;

  renderHero(result);
  renderBand(result.summary);
  renderCaveats(result.caveats);
  renderTable();
  renderCli(result.repository);

  resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderHero(result) {
  const repo = result.repository;
  el('heroCount').textContent = String(result.total);

  const unit = el('heroUnit');
  unit.replaceChildren();
  const declarations = result.summary.documented + result.summary.bare + result.summary.unused;
  unit.append(result.total === 1 ? 'deprecated item, from ' : 'deprecated items, from ');
  const strong = document.createElement('strong');
  strong.textContent = `${declarations} declaration${declarations === 1 ? '' : 's'}`;
  unit.append(strong);

  const meta = el('heroMeta');
  meta.replaceChildren();
  const link = document.createElement('a');
  link.href = repo.url;
  openInNewTab(link);
  link.textContent = `${repo.owner}/${repo.name}`;
  meta.appendChild(link);
  meta.appendChild(document.createElement('br'));
  meta.append(`${repo.ref} · ${repo.commit.slice(0, 7)}`);
  meta.appendChild(document.createElement('br'));
  meta.append(`${result.scanned.sourceFiles} source files · ${result.scanned.seconds}s`);
}

function renderBand(summary) {
  const band = el('band');
  band.replaceChildren();

  BAND_SEGMENTS.forEach((segment) => {
    const count = summary[segment.key];
    if (count === 0) {
      return;
    }

    const isActive = activeClassification === segment.key;
    const seg = document.createElement('button');
    seg.type = 'button';
    seg.className = `band-seg band-${segment.key}`;
    seg.style.flex = String(count);
    seg.setAttribute('aria-pressed', String(isActive));
    seg.title = isActive
      ? `Showing only these ${count} — click to clear`
      : `${count} ${segment.label} — ${segment.hint}. Click to show only these.`;
    seg.onclick = () => {
      activeClassification = isActive ? null : segment.key;
      showingAll = false;
      renderBand(summary);
      renderTable();
    };

    const countEl = document.createElement('span');
    countEl.className = 'band-seg-count';
    countEl.textContent = String(count);

    const labelEl = document.createElement('span');
    labelEl.className = 'band-seg-label';
    labelEl.textContent = segment.label;

    seg.append(countEl, labelEl);
    band.appendChild(seg);
  });
}

function renderCaveats(caveats) {
  const box = el('caveats');
  box.hidden = caveats.length === 0;
  el('caveatCount').textContent = caveats.length ? ` (${caveats.length})` : '';

  const list = el('caveatList');
  list.replaceChildren();
  caveats.forEach((caveat) => {
    const li = document.createElement('li');
    li.textContent = caveat;
    list.appendChild(li);
  });
}

/**
 * The same three buckets the band counts, resolved per item rather than per
 * declaration: a usage inherits the classification of what it uses, so filtering
 * by a segment shows the call sites that segment is about.
 */
function classifyItems(items) {
  const groups = new Map();

  for (const item of items) {
    const declaration = item.declaration ?? item;
    const key = `${declaration.name}|${declaration.file}`;
    const group = groups.get(key) ?? { reason: false, usages: 0 };
    group.reason = group.reason || Boolean(item.reason);
    group.usages += item.kind === 'usage' ? 1 : 0;
    groups.set(key, group);
  }

  return items.map((item) => {
    const declaration = item.declaration ?? item;
    const group = groups.get(`${declaration.name}|${declaration.file}`);
    return group.usages === 0 ? 'unused' : group.reason ? 'documented' : 'bare';
  });
}

function renderTable() {
  const items = lastResult.items;
  const classes = classifyItems(items);
  const visible = items.filter(
    (_item, index) => !activeClassification || classes[index] === activeClassification
  );
  const visibleClasses = classes.filter(
    (bucket) => !activeClassification || bucket === activeClassification
  );

  const shown = showingAll ? visible.length : Math.min(FIRST_PAGE, visible.length);

  const body = el('itemsBody');
  body.replaceChildren();

  const rows = document.createDocumentFragment();
  for (let index = 0; index < shown; index += 1) {
    rows.appendChild(row(visible[index], visibleClasses[index]));
  }
  body.appendChild(rows);

  el('tableNote').textContent = activeClassification
    ? `${visible.length} of ${items.length}, filtered to ${activeClassification}`
    : `${items.length} item${items.length === 1 ? '' : 's'}`;

  const more = el('showAll');
  more.hidden = shown >= visible.length;
  more.textContent = `Show the remaining ${visible.length - shown}`;

  if (visible.length === 0) {
    const empty = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'cell-reason';
    cell.textContent =
      items.length === 0
        ? "Nothing deprecated in this repository's own source."
        : 'Nothing in this classification.';
    empty.appendChild(cell);
    body.appendChild(empty);
  }
}

function row(item, bucket) {
  const repo = lastResult.repository;
  const tr = document.createElement('tr');
  tr.className = `row-${bucket}`;

  const name = document.createElement('td');
  name.className = 'cell-name';
  name.textContent = item.name;

  const kind = document.createElement('td');
  kind.className = 'cell-kind';
  kind.textContent = item.kind;

  const location = document.createElement('td');
  location.className = 'cell-loc';
  const link = document.createElement('a');
  // The blob URL is pinned to the scanned commit, so a shared result keeps
  // pointing at the lines it was produced from.
  link.href = `${REPO_LINK}/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/blob/${encodeURIComponent(repo.commit)}/${item.file
    .split('/')
    .map(encodeURIComponent)
    .join('/')}#L${item.line}`;
  openInNewTab(link);
  link.textContent = `${item.file}:${item.line}`;
  location.appendChild(link);

  const reason = document.createElement('td');
  reason.className = item.reason ? 'cell-reason' : 'cell-reason none';
  reason.textContent = item.reason || 'no reason given';

  tr.append(name, kind, location, reason);
  return tr;
}

el('showAll').addEventListener('click', () => {
  showingAll = true;
  renderTable();
});

/* -------------------------------------------------------------------------
   Export

   The column names are the extension's, so a spreadsheet built from a page scan
   and one built from an editor scan line up. `ResultExporter` itself is not
   reused: it takes the scanner's own item shape and imports `fs/promises` for a
   method a browser has no use for, so sharing it would mean mapping the result
   backwards and aliasing another Node builtin to reuse thirty lines.
   ---------------------------------------------------------------------- */

const EXPORT_HEADERS = [
  'Name',
  'File',
  'Line',
  'Column',
  'Kind',
  'Declaration File',
  'Declaration Line',
  'Urgency',
  'Since',
  'Removal',
  'Deprecation Reason',
];

const since = (item) => item.schedule?.sinceVersion || item.schedule?.sinceDate || '';
const removal = (item) => item.schedule?.removalVersion || item.schedule?.removalDate || '';

function exportRows(result) {
  return result.items.map((item) => [
    item.name,
    item.file,
    String(item.line),
    String(item.character),
    item.kind,
    item.declaration?.file || '',
    item.declaration ? String(item.declaration.line) : '',
    item.urgency || '',
    since(item),
    removal(item),
    item.reason || '',
  ]);
}

/**
 * A leading `=`, `+`, `-` or `@` makes a spreadsheet treat the cell as a
 * formula, and every one of these cells carries text out of someone else's
 * repository. The apostrophe is what Excel and Sheets both read as "this is
 * text, whatever it looks like".
 */
function csvCell(value) {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function toCsv(result) {
  const lines = [EXPORT_HEADERS.join(',')];
  for (const row of exportRows(result)) {
    lines.push(row.map(csvCell).join(','));
  }
  return lines.join('\n');
}

function toJson(result) {
  // The whole result, not just the items: the repository, the commit, the
  // summary and the caveats are what make the file readable a month later. It
  // is the same shape `--format json` writes.
  return JSON.stringify(result, null, 2);
}

function mdCell(value) {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function toMarkdown(result) {
  const repo = result.repository;
  const usages = result.items.filter((item) => item.kind === 'usage').length;
  const scannedAt = new Date().toISOString().slice(0, 10);

  const lines = [
    `# Deprecated items in ${repo.owner}/${repo.name}`,
    '',
    `[${repo.owner}/${repo.name}](${repo.url}) at \`${repo.commit.slice(0, 7)}\` on \`${repo.ref}\`, scanned ${scannedAt} at ${SITE_URL}`,
    '',
    '## Summary',
    '',
    `- **Total items**: ${result.total}`,
    `- **Declarations**: ${result.total - usages}`,
    `- **Usages**: ${usages}`,
    `- **Documented / no reason / unused**: ${result.summary.documented} / ${result.summary.bare} / ${result.summary.unused}`,
    '',
  ];

  // The caveats travel with the file. A report that does not say what it could
  // not see reads as a clean bill of health.
  for (const caveat of result.caveats) {
    lines.push(`> ${caveat}`, '');
  }

  if (result.items.length === 0) {
    lines.push("*Nothing deprecated in this repository's own source.*");
    return lines.join('\n');
  }

  lines.push('## Items', '');
  lines.push(`| ${EXPORT_HEADERS.join(' | ')} |`);
  lines.push(`|${EXPORT_HEADERS.map(() => '---').join('|')}|`);
  for (const row of exportRows(result)) {
    lines.push(`| ${row.map(mdCell).join(' | ')} |`);
  }

  return lines.join('\n');
}

const EXPORTS = {
  csv: { build: toCsv, extension: 'csv', type: 'text/csv' },
  json: { build: toJson, extension: 'json', type: 'application/json' },
  markdown: { build: toMarkdown, extension: 'md', type: 'text/markdown' },
};

function download(format) {
  const spec = EXPORTS[format];
  const repo = lastResult.repository;
  const blob = new Blob([spec.build(lastResult)], {
    type: `${spec.type};charset=utf-8`,
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${repo.owner}-${repo.name}-deprecated.${spec.extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking straight away cancels the download in some browsers; one turn of
  // the event loop is enough for it to have started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

document.querySelectorAll('[data-export]').forEach((button) => {
  button.addEventListener('click', () => {
    if (lastResult) {
      download(button.dataset.export);
    }
  });
});

/* -------------------------------------------------------------------------
   The funnel
   ---------------------------------------------------------------------- */

function renderCli(repo) {
  el('cliLine').textContent =
    `git clone --depth 1 ${REPO_LINK}/${repo.owner}/${repo.name} && npx deprecated-tracker ${repo.name}`;
}

el('copyCli').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(el('cliLine').textContent);
    button.textContent = 'Copied';
  } catch {
    // Clipboard access is denied in plenty of ordinary configurations. Select
    // the text instead so the keyboard shortcut still works.
    getSelection().selectAllChildren(el('cliLine'));
    button.textContent = 'Press Ctrl+C';
  }
  setTimeout(() => {
    button.textContent = 'Copy';
  }, 2000);
});

/* -------------------------------------------------------------------------
   Deep link
   ---------------------------------------------------------------------- */

const shared = new URLSearchParams(location.search).get('repo');
if (shared) {
  startScan(shared);
}
