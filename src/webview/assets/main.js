(function () {
  const vscode = acquireVsCodeApi();
  let currentResults = [];
  let filteredResults = [];
  // Fingerprint of the result set currently on screen. `MainPanel.reveal` always
  // re-posts the results, and rebuilding the table for an identical set throws
  // away the scroll position and every expanded call-site list. Set to null by
  // anything that changes the DOM behind our back, which gives up the fast path.
  let renderedSignature = null;

  const ignoreManagerBtn = document.getElementById('ignoreManagerBtn');
  const nameFilter = document.getElementById('nameFilter');
  const fileFilter = document.getElementById('fileFilter');
  const reasonFilter = document.getElementById('reasonFilter');
  const statusDiv = document.getElementById('status');
  const resultsBody = document.getElementById('resultsBody');

  // Inline SVG rather than an icon font: the panel CSP is `default-src 'none'`,
  // so neither a webfont nor a data-URI image would load.
  const ICON_CHECK =
    '<svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M13.5 3.8 6.4 10.9 2.5 7l.85-.85L6.4 9.2l6.25-6.25.85.85z"/></svg>';
  const ICON_FILTER =
    '<svg viewBox="0 0 16 16" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M1.5 2.5h13l-5 6v5l-3 1.5v-6.5l-5-6zm2.6 1.2 3.6 4.3v4.6l.6-.3V8l3.6-4.3H4.1z"/></svg>';

  /**
   * Every deprecated declaration is one of three things, and each is a
   * different job: it names a replacement, it says nothing, or nothing calls it
   * any more. This is the only classification derivable from the scanner's data
   * for every project — there is no severity and usually no schedule.
   */
  function classifyGroup(group) {
    if (group.usages.length === 0) {
      return 'unused';
    }
    return groupReason(group) ? 'documented' : 'bare';
  }

  /** Identity of the declaration an item belongs to. */
  function groupKeyFor(item) {
    if (item.kind === 'usage' && item.deprecatedDeclaration) {
      return `${item.deprecatedDeclaration.name}|${item.deprecatedDeclaration.filePath}`;
    }
    return `${item.name}|${item.filePath}`;
  }

  // Set by clicking a band segment; null means "no classification filter".
  let activeClassification = null;

  // The hero, band, chips and hint all describe the results table. They stay
  // hidden while the ignore manager is open, including across a rescan.
  let ignoreViewVisible = false;

  function renderOverview() {
    const hero = document.getElementById('heroSection');
    const chips = document.getElementById('filterChips');
    const hint = document.getElementById('linkHint');
    if (!hero) {
      return;
    }

    const groups = buildGroups(currentResults);
    const hasResults = groups.length > 0 && !ignoreViewVisible;

    hero.classList.toggle('show', hasResults);
    if (chips) {
      chips.classList.toggle('show', hasResults);
    }
    if (hint) {
      hint.classList.toggle('show', hasResults && filteredResults.length > 0);
    }
    if (!hasResults) {
      return;
    }

    const buckets = { documented: 0, bare: 0, unused: 0 };
    let callSites = 0;
    groups.forEach((group) => {
      buckets[classifyGroup(group)] += 1;
      callSites += group.usages.length;
    });

    setText('heroCount', String(callSites));
    const unit = document.getElementById('heroUnit');
    if (unit) {
      unit.textContent = '';
      unit.append(
        document.createTextNode(callSites === 1 ? 'call site reaches ' : 'call sites reach ')
      );
      const strong = document.createElement('strong');
      strong.textContent = `${groups.length} deprecated symbol${groups.length === 1 ? '' : 's'}`;
      unit.appendChild(strong);
    }

    const files = new Set();
    currentResults.forEach((item) => files.add(item.filePath));
    setText('heroMeta', `across ${files.size} file${files.size === 1 ? '' : 's'}`);

    renderBand(buckets);
    renderChips(groups.length);
  }

  /**
   * The filter inputs already exist in the column headers; these chips are a
   * visible, clearable representation of them. No new filtering logic — a
   * short list should never leave you wondering why.
   */
  function renderChips(totalGroups) {
    const container = document.getElementById('filterChips');
    if (!container) {
      return;
    }

    container.innerHTML = '';

    const active = [
      { input: nameFilter, label: 'Symbol' },
      { input: fileFilter, label: 'File' },
      { input: reasonFilter, label: 'Reason' },
    ].filter((entry) => entry.input && entry.input.value.trim());

    active.forEach((entry) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip active';
      chip.title = `Clear the ${entry.label.toLowerCase()} filter`;
      chip.appendChild(document.createTextNode(`${entry.label}: ${entry.input.value.trim()}`));
      const clear = document.createElement('span');
      clear.className = 'filter-chip-clear';
      clear.textContent = '✕';
      chip.appendChild(clear);
      chip.onclick = () => {
        entry.input.value = '';
        applyFilters();
        debouncedSaveFilterState();
      };
      container.appendChild(chip);
    });

    if (activeClassification) {
      const segment = BAND_SEGMENTS.find((entry) => entry.key === activeClassification);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip active';
      chip.title = 'Clear the classification filter';
      const swatch = document.createElement('i');
      swatch.className = `band-${activeClassification}`;
      chip.appendChild(swatch);
      chip.appendChild(document.createTextNode(segment ? segment.label : activeClassification));
      const clear = document.createElement('span');
      clear.className = 'filter-chip-clear';
      clear.textContent = '✕';
      chip.appendChild(clear);
      chip.onclick = () => {
        activeClassification = null;
        applyFilters();
      };
      container.appendChild(chip);
    }

    const count = document.createElement('span');
    count.className = 'filter-count';
    const shown = buildGroups(filteredResults).length;
    count.textContent =
      active.length || activeClassification
        ? `Showing ${shown} of ${totalGroups} symbols`
        : `Showing all ${totalGroups} symbols`;
    container.appendChild(count);
  }

  /**
   * Column widths live in one custom property on the table; both the header
   * row and every data row read it, so a drag moves them together. The last
   * column stays `1fr` so the grid always fills the panel.
   */
  function initColumnResize() {
    const table = document.getElementById('resultsTable');
    if (!table) {
      return;
    }

    const headers = Array.from(table.querySelectorAll('thead th'));
    const lastIndex = headers.length - 1;

    // The handles live in the header but have to be grabbable beside any row,
    // so they are stretched downwards. Two limits, whichever is closer: the
    // bottom of the table, and the bottom of the scroll container. The second
    // one matters because the header is sticky — the handles ride down with it,
    // so a fixed table-height would hang further and further past the bottom as
    // you scroll and keep growing the scrollable area. Both limits move (rows
    // are filtered, sorted and expanded; the header travels), so this is
    // remeasured on scroll and on resize.
    const viewport = table.parentElement;
    const trackHeight = () => {
      const anchor = headers[0];
      if (!anchor) {
        return;
      }
      const toTableBottom =
        table.getBoundingClientRect().bottom - anchor.getBoundingClientRect().top;
      const toViewportBottom = viewport ? viewport.clientHeight : toTableBottom;
      const span = Math.min(toTableBottom, toViewportBottom);
      table.style.setProperty('--dt-table-h', `${Math.max(0, Math.floor(span))}px`);
    };
    trackHeight();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(trackHeight).observe(table);
    }
    if (viewport) {
      viewport.addEventListener('scroll', trackHeight, { passive: true });
    }

    headers.forEach((th, index) => {
      if (index === lastIndex) {
        return;
      }

      const handle = document.createElement('span');
      handle.className = 'col-resizer';
      handle.setAttribute('aria-hidden', 'true');

      handle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const widths = headers.map((header) => header.getBoundingClientRect().width);
        const startX = event.clientX;
        const startWidth = widths[index];

        handle.classList.add('dragging');
        document.body.classList.add('dt-resizing');

        const onMove = (moveEvent) => {
          widths[index] = Math.max(70, startWidth + (moveEvent.clientX - startX));
          const template = widths
            .slice(0, lastIndex)
            .map((width) => `${Math.round(width)}px`)
            .join(' ');
          table.style.setProperty('--dt-cols', `${template} minmax(150px, 1fr)`);
        };

        const onUp = () => {
          handle.classList.remove('dragging');
          document.body.classList.remove('dt-resizing');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      handle.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        table.style.removeProperty('--dt-cols');
      });

      th.appendChild(handle);
    });
  }

  const BAND_SEGMENTS = [
    { key: 'documented', label: 'documented', hint: 'migrate the call sites' },
    { key: 'bare', label: 'no reason', hint: 'write the reason, one line each' },
    { key: 'unused', label: 'unused', hint: 'safe to delete now' },
  ];

  function renderBand(buckets) {
    const band = document.getElementById('compositionBand');
    if (!band) {
      return;
    }

    band.innerHTML = '';

    BAND_SEGMENTS.forEach((segment) => {
      const count = buckets[segment.key];
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
        applyFilters();
      };

      const countEl = document.createElement('span');
      countEl.className = 'band-seg-count';
      countEl.textContent = String(count);

      const labelEl = document.createElement('span');
      labelEl.className = 'band-seg-label';
      labelEl.textContent = segment.label;

      seg.appendChild(countEl);
      seg.appendChild(labelEl);
      band.appendChild(seg);
    });
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  /**
   * The name and file are spans rather than anchors, so they need the keyboard
   * affordances an anchor would give for free.
   */
  function makeLink(span, title, onActivate) {
    span.className = 'clickable';
    span.title = title;
    span.tabIndex = 0;
    span.setAttribute('role', 'link');
    span.onclick = onActivate;
    span.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate();
      }
    };
  }

  if (ignoreManagerBtn) {
    ignoreManagerBtn.addEventListener('click', () => {
      showIgnoreView(true);
      vscode.postMessage({ command: 'showIgnoreManager' });
    });
  }

  const backToResultsBtn = document.getElementById('backToResultsBtn');
  if (backToResultsBtn) {
    backToResultsBtn.addEventListener('click', () => showIgnoreView(false));
  }

  function showIgnoreView(show) {
    const resultsView = document.getElementById('results');
    const ignoreView = document.getElementById('ignoreView');
    const resultsControls = document.getElementById('resultsControls');
    const ignoreControls = document.getElementById('ignoreControls');
    const panelTitle = document.getElementById('panelTitle');

    if (resultsView) {
      resultsView.style.display = show ? 'none' : 'block';
    }
    if (ignoreView) {
      ignoreView.classList.toggle('show', show);
    }
    if (resultsControls) {
      resultsControls.style.display = show ? 'none' : 'flex';
    }
    if (ignoreControls) {
      ignoreControls.classList.toggle('show', show);
    }
    if (panelTitle) {
      panelTitle.textContent = show ? 'Ignore Management' : 'Deprecated Tracker';
    }

    if (show) {
      // Leaving the results behind means the next posted set must be allowed to
      // rebuild them, even if it is byte-identical to the one already there.
      renderedSignature = null;
    }
    ignoreViewVisible = show;
    renderOverview();
  }

  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'refreshResults' });
    });
  }

  const exportBtn = document.getElementById('exportBtn');
  const exportMenu = document.getElementById('exportMenu');

  if (exportBtn && exportMenu) {
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('show');
    });
    exportMenu.querySelectorAll('.dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const format = e.target.getAttribute('data-format');
        const visible = filteredResults.map((item) => ({
          filePath: item.filePath,
          line: item.line,
          name: item.name,
        }));
        if (format === 'ai-prompt') {
          vscode.postMessage({ command: 'requestAiPrompt', visible: visible });
        } else {
          vscode.postMessage({
            command: 'exportResults',
            format: format,
            visible: visible,
          });
        }
        exportMenu.classList.remove('show');
      });
    });
    document.addEventListener('click', () => {
      if (exportMenu.classList.contains('show')) {
        exportMenu.classList.remove('show');
      }
      document.querySelectorAll('.history-export-dropdown .dropdown-menu').forEach((menu) => {
        menu.classList.remove('show');
      });
    });
  }

  const aiPromptModal = document.getElementById('aiPromptModal');
  const aiPromptText = document.getElementById('aiPromptText');
  const aiPromptStatus = document.getElementById('aiPromptStatus');
  const aiPromptCopyBtn = document.getElementById('aiPromptCopyBtn');
  const aiPromptSaveBtn = document.getElementById('aiPromptSaveBtn');
  const aiPromptCloseBtn = document.getElementById('aiPromptCloseBtn');

  function openAiPromptModal(prompt) {
    if (!aiPromptModal || !aiPromptText) {
      return;
    }
    aiPromptText.textContent = prompt;
    if (aiPromptStatus) {
      aiPromptStatus.textContent = '';
    }
    aiPromptModal.classList.add('show');
    aiPromptText.focus();
  }

  function closeAiPromptModal() {
    if (!aiPromptModal) {
      return;
    }
    aiPromptModal.classList.remove('show');
    if (exportBtn) {
      exportBtn.focus();
    }
  }

  if (aiPromptModal) {
    aiPromptModal.addEventListener('click', (e) => {
      if (e.target === aiPromptModal) {
        closeAiPromptModal();
      }
    });
  }

  if (aiPromptCloseBtn) {
    aiPromptCloseBtn.addEventListener('click', closeAiPromptModal);
  }

  if (aiPromptCopyBtn) {
    aiPromptCopyBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'copyAiPrompt' });
    });
  }

  if (aiPromptSaveBtn) {
    aiPromptSaveBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'saveAiPrompt' });
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aiPromptModal && aiPromptModal.classList.contains('show')) {
      closeAiPromptModal();
    }
  });

  // Debounced filter with 300ms delay for better performance
  let filterDebounceTimeout;
  function debouncedApplyFilters() {
    clearTimeout(filterDebounceTimeout);
    filterDebounceTimeout = setTimeout(() => {
      applyFilters();
    }, 300);
  }

  [nameFilter, fileFilter, reasonFilter].forEach((input) => {
    input.addEventListener('input', () => {
      debouncedApplyFilters();
      debouncedSaveFilterState();
    });
  });

  let saveFilterStateTimeout;
  function debouncedSaveFilterState() {
    clearTimeout(saveFilterStateTimeout);
    saveFilterStateTimeout = setTimeout(() => {
      vscode.postMessage({
        command: 'saveFilterState',
        nameFilter: nameFilter.value,
        fileFilter: fileFilter.value,
        reasonFilter: reasonFilter.value,
      });
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      vscode.postMessage({ command: 'webviewReady' });
    });
  } else {
    vscode.postMessage({ command: 'webviewReady' });
  }

  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.command) {
      case 'results': {
        const incoming = message.results || [];
        const isViewOnly = message.viewOnly || false;
        const signature = JSON.stringify([incoming, isViewOnly]);
        if (signature === renderedSignature) {
          break;
        }
        renderedSignature = signature;
        currentResults = incoming;
        showIgnoreView(false);
        applyFilters();
        if (isViewOnly) {
          disableIgnoreActions();
          showStatus('Viewing historical scan (read-only)', 'info');
        } else {
          enableIgnoreActions();
        }
        break;
      }
      // A subset scan that renders like a full one tells the user their debt
      // collapsed, so it says what it covered. Sent after the results so it
      // survives the panel being revealed.
      case 'subsetNote':
        showStatus(message.note || '', 'info');
        break;
      case 'showAiPrompt':
        openAiPromptModal(message.prompt || '');
        break;
      case 'aiPromptCopied':
        if (aiPromptStatus) {
          aiPromptStatus.textContent = message.copied ? 'Copied to clipboard.' : 'Copy failed.';
        }
        break;
      case 'aiPromptSaved':
        if (aiPromptStatus) {
          aiPromptStatus.textContent = message.saved ? 'Saved.' : 'Save failed.';
        }
        break;
      case 'scanning':
        if (message.scanning) {
          showStatus('Scanning project...', 'scanning');
        } else {
          hideStatus();
          // Refresh history after scan completes
          vscode.postMessage({
            command: 'viewHistory',
            limit: currentHistoryLimit,
          });
        }
        break;
      case 'historyMetadata':
        renderHistory(message.history || [], message.hasMore === true);
        break;
      case 'updateIgnoreList':
        renderIgnoreList(message.rules || {});
        break;
    }
  });

  // History UI Elements
  const historyToggle = document.getElementById('historyToggle');
  const historySection = document.getElementById('historySection');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const showMoreHistoryBtn = document.getElementById('showMoreHistoryBtn');
  let currentHistoryLimit = 10;

  // Toggle history section
  if (historyToggle) {
    historyToggle.addEventListener('click', () => {
      historySection.classList.toggle('collapsed');
      const toggleIcon = historyToggle.querySelector('.toggle-icon');
      if (toggleIcon) {
        toggleIcon.textContent = historySection.classList.contains('collapsed') ? '▶' : '▼';
      }
      // Load history when first expanding
      if (!historySection.classList.contains('collapsed') && !historyList.hasChildNodes()) {
        vscode.postMessage({
          command: 'viewHistory',
          limit: currentHistoryLimit,
        });
      }
    });
  }

  // Clear history button
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'clearHistory' });
    });
  }

  // Show more history button
  if (showMoreHistoryBtn) {
    showMoreHistoryBtn.addEventListener('click', () => {
      currentHistoryLimit += 10;
      vscode.postMessage({
        command: 'viewHistory',
        limit: currentHistoryLimit,
      });
    });
  }

  function renderHistory(history, hasMore) {
    if (!historyList) return;

    const historyCount = document.getElementById('historyCount');
    if (historyCount) {
      historyCount.textContent =
        history.length > 0 ? `(${history.length}${hasMore ? '+' : ''})` : '';
    }

    if (clearHistoryBtn) {
      clearHistoryBtn.style.display = history.length > 0 ? 'inline-block' : 'none';
    }

    historyList.innerHTML = '';

    if (history.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'history-empty';
      emptyState.textContent = 'No scan history yet. Run your first scan!';
      historyList.appendChild(emptyState);
      if (showMoreHistoryBtn) {
        showMoreHistoryBtn.style.display = 'none';
      }
      return;
    }

    history.forEach((scan) => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const date = new Date(scan.timestamp);
      const formattedDate = escapeHtml(date.toLocaleString());
      const duration = escapeHtml((scan.duration / 1000).toFixed(2));
      const scanId = escapeHtml(scan.scanId);

      item.innerHTML = `
        <div class="history-item-header">
          <div class="history-item-time">${formattedDate}</div>
          <div class="history-item-actions">
            <div class="dropdown history-export-dropdown">
              <button class="btn btn-secondary btn-small history-export-btn">Export ▼</button>
              <div class="dropdown-menu">
                <button type="button" class="dropdown-item" data-scanid="${scanId}" data-format="csv">Export as CSV</button>
                <button type="button" class="dropdown-item" data-scanid="${scanId}" data-format="json">Export as JSON</button>
                <button type="button" class="dropdown-item" data-scanid="${scanId}" data-format="markdown">Export as Markdown</button>
                <p class="dropdown-note">No AI prompt — a stored scan's line numbers may be stale.</p>
              </div>
            </div>
            <button class="btn btn-primary btn-small history-view-btn" data-scanid="${scanId}">View</button>
          </div>
        </div>
        <div class="history-item-stats">
          <span class="history-stat"><strong>${escapeHtml(scan.totalItems)}</strong> deprecated items</span>
          <span class="history-stat"><strong>${escapeHtml(scan.declarationCount)}</strong> declarations</span>
          <span class="history-stat"><strong>${escapeHtml(scan.usageCount)}</strong> usages</span>
          <span class="history-stat"><strong>${duration}s</strong> to scan</span>
          ${scan.fileCount !== undefined ? `<span class="history-stat"><strong>${escapeHtml(scan.fileCount)}</strong> files</span>` : ''}
        </div>
      `;

      historyList.appendChild(item);
    });

    // Add event listeners for view buttons
    document.querySelectorAll('.history-view-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const scanId = e.target.getAttribute('data-scanid');
        vscode.postMessage({ command: 'viewScan', scanId });
      });
    });

    // Add event listeners for export dropdowns
    document.querySelectorAll('.history-export-dropdown').forEach((dropdown) => {
      const btn = dropdown.querySelector('.history-export-btn');
      const menu = dropdown.querySelector('.dropdown-menu');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close all other dropdowns
        document.querySelectorAll('.history-export-dropdown .dropdown-menu').forEach((m) => {
          if (m !== menu) m.classList.remove('show');
        });
        menu.classList.toggle('show');
      });

      menu.querySelectorAll('.dropdown-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          const scanId = e.target.getAttribute('data-scanid');
          const format = e.target.getAttribute('data-format');
          vscode.postMessage({
            command: 'exportHistoricalScan',
            scanId,
            format,
          });
          menu.classList.remove('show');
        });
      });
    });

    // Show/hide "Show More" button
    if (showMoreHistoryBtn) {
      showMoreHistoryBtn.style.display = hasMore ? 'block' : 'none';
    }
  }

  function disableIgnoreActions() {
    document.querySelectorAll('.btn-danger').forEach((btn) => {
      if (btn.textContent.includes('Ignore')) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      }
    });
  }

  function enableIgnoreActions() {
    document.querySelectorAll('.btn-danger').forEach((btn) => {
      if (btn.textContent.includes('Ignore')) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
    });
  }

  /**
   * The item a group's row is drawn from: its declaration, or the first call
   * site when the declaration itself was not scanned.
   */
  function groupRepresentative(group) {
    return group.deprecatedItem || (group.usages.length > 0 ? group.usages[0] : null);
  }

  function applyFilters() {
    const nameFilterValue = nameFilter.value.toLowerCase().trim();
    const fileFilterValue = fileFilter.value.toLowerCase().trim();
    const reasonFilterValue = reasonFilter.value.toLowerCase().trim();

    // A declaration and its call sites are one row on screen, and those call
    // sites nearly always live in other files. Testing the flat item list threw
    // them away — filtering by "api" stripped every call site in
    // edge-usages.ts and left the declaration reading "0 · unused". So the
    // filters select whole groups, matched against exactly the values the row
    // displays, and a surviving group keeps all of its items.
    const keep = new Set(
      buildGroups(currentResults)
        .filter((group) => {
          const item = groupRepresentative(group);
          const matchesName =
            !nameFilterValue || group.name.toLowerCase().includes(nameFilterValue);
          const matchesFile =
            !fileFilterValue ||
            (!!item &&
              (item.fileName.toLowerCase().includes(fileFilterValue) ||
                item.filePath.toLowerCase().includes(fileFilterValue)));
          const matchesReason =
            !reasonFilterValue ||
            (groupReason(group) || '').toLowerCase().includes(reasonFilterValue);
          const matchesClassification =
            !activeClassification || classifyGroup(group) === activeClassification;

          return matchesName && matchesFile && matchesReason && matchesClassification;
        })
        .map((group) => group.key)
    );

    filteredResults = currentResults.filter((item) => keep.has(groupKeyFor(item)));

    renderResults();
  }

  function buildGroups(items) {
    const groupedResults = new Map();

    items.forEach((item) => {
      let key;
      let groupName;

      if (item.kind === 'usage' && item.deprecatedDeclaration) {
        key = `${item.deprecatedDeclaration.name}|${item.deprecatedDeclaration.filePath}`;
        groupName = item.deprecatedDeclaration.name;
      } else {
        key = `${item.name}|${item.filePath}`;
        groupName = item.name;
      }

      if (!groupedResults.has(key)) {
        groupedResults.set(key, {
          key,
          deprecatedItem: item.kind !== 'usage' ? item : null,
          usages: [],
          name: groupName,
        });
      }

      const group = groupedResults.get(key);
      if (item.kind === 'usage') {
        group.usages.push(item);
      } else {
        group.deprecatedItem = item;
      }
    });

    return Array.from(groupedResults.values());
  }

  function renderResults() {
    if (!resultsBody) {
      return;
    }

    resultsBody.innerHTML = '';
    renderOverview();

    if (filteredResults.length === 0) {
      const scannedNothing = currentResults.length === 0;
      const row = document.createElement('tr');
      row.innerHTML = `
                <td colspan="5" class="empty-state">
                    <div class="empty-icon ${scannedNothing ? 'calm' : ''}">${
                      scannedNothing ? ICON_CHECK : ICON_FILTER
                    }</div>
                    <h3>${
                      scannedNothing
                        ? 'Nothing deprecated in this workspace'
                        : 'No items match the current filters'
                    }</h3>
                    <p>${
                      scannedNothing
                        ? 'No <code>@deprecated</code> annotations were found. If you expected results, check that the paths you care about are not excluded by your ignore rules.'
                        : 'Clear a filter above to widen the search.'
                    }</p>
                </td>
            `;
      resultsBody.appendChild(row);
      return;
    }

    const orderedGroups = sortGroups(buildGroups(filteredResults));

    orderedGroups.forEach((group) => {
      const classification = classifyGroup(group);
      const mainRow = document.createElement('tr');
      mainRow.className = `deprecated-item-row row-${classification}`;

      const nameCell = document.createElement('td');
      nameCell.className = 'cell-name';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = group.name;

      const declaration = groupRepresentative(group);
      if (declaration) {
        makeLink(nameSpan, `Go to declaration — ${declaration.filePath}:${declaration.line}`, () =>
          openFileAtLine(declaration.filePath, declaration.line)
        );
      }

      nameCell.appendChild(nameSpan);

      const fileNameCell = document.createElement('td');
      fileNameCell.className = 'cell-file';
      const fileSpan = document.createElement('span');
      let _fileName = 'Unknown';
      let _filePath = null;
      if (group.deprecatedItem) {
        _fileName = group.deprecatedItem.fileName;
        _filePath = group.deprecatedItem.filePath;
      } else if (group.usages.length > 0) {
        _fileName = group.usages[0].fileName;
        _filePath = group.usages[0].filePath;
      }
      fileSpan.textContent = _fileName;
      if (_filePath) {
        makeLink(fileSpan, `Open file — ${_filePath}`, () => openFile(_filePath));
      }
      fileNameCell.appendChild(fileSpan);

      const urgencyCell = document.createElement('td');
      urgencyCell.className = 'cell-urgency';
      const schedule = groupSchedule(group);
      if (schedule) {
        const badge = document.createElement('span');
        badge.className = `urgency-badge urgency-${schedule.urgency}`;
        badge.textContent = urgencyLabel(schedule);
        badge.title = urgencyTitle(schedule);
        urgencyCell.appendChild(badge);
      } else {
        urgencyCell.textContent = '—';
        urgencyCell.title = 'No removal version or date given in the deprecation text';
      }

      const reasonCell = document.createElement('td');
      reasonCell.className = 'cell-reason';

      const deprecationReason = groupReason(group);

      if (deprecationReason) {
        reasonCell.textContent = deprecationReason;
        reasonCell.title = deprecationReason;
      } else {
        // A bare tag is the cheapest thing on the panel to fix, so it gets a
        // label of its own rather than being greyed out and overlooked.
        reasonCell.classList.add('no-reason');
        reasonCell.title = 'No replacement named — callers have nothing to migrate to';
        const tag = document.createElement('span');
        tag.className = 'no-reason-tag';
        tag.textContent = 'no reason';
        const text = document.createElement('span');
        text.textContent = 'callers have nothing to migrate to';
        reasonCell.appendChild(tag);
        reasonCell.appendChild(text);
      }

      const actionCell = document.createElement('td');
      actionCell.className = 'cell-actions';

      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'action-buttons';

      let expandControl;
      if (group.usages.length > 0) {
        // A badge rather than a labelled button: the count is the information,
        // and the whole row is the target. It stays a <button> so it is still
        // a tab stop and still announces its state.
        expandControl = document.createElement('button');
        expandControl.className = 'usage-badge num';
        expandControl.textContent = String(group.usages.length);
        expandControl.setAttribute('aria-expanded', 'false');
        expandControl.title = usageBadgeTitle(group.usages.length, false);
        expandControl.setAttribute('aria-label', expandControl.title);
        expandControl.onclick = (event) => {
          event.stopPropagation();
          toggleExpand(mainRow, group);
        };

        mainRow.classList.add('is-expandable');
        mainRow.onclick = (event) => {
          // The row is a shortcut, not a replacement: a click that landed on a
          // link or a button belongs to that control.
          if (event.target.closest('button, .clickable')) {
            return;
          }
          toggleExpand(mainRow, group);
        };
      } else {
        expandControl = document.createElement('span');
        expandControl.className = 'no-usages';
        expandControl.textContent = 'no call sites';
        expandControl.title = 'Nothing in the scanned files calls this — safe to delete';
      }

      // Stays .btn-danger: disableIgnoreActions() selects these by that class.
      const ignoreButton = document.createElement('button');
      ignoreButton.className = 'btn btn-danger btn-small';
      ignoreButton.textContent = 'Ignore';
      ignoreButton.onclick = () => {
        if (group.deprecatedItem) {
          ignoreMethod(group.deprecatedItem.filePath, group.deprecatedItem.name);
          locallyRemoveIgnoredMethod(group.deprecatedItem.filePath, group.deprecatedItem.name);
        } else if (group.usages.length > 0 && group.usages[0].deprecatedDeclaration) {
          const firstUsage = group.usages[0];
          ignoreMethod(
            firstUsage.deprecatedDeclaration.filePath,
            firstUsage.deprecatedDeclaration.name
          );
          locallyRemoveIgnoredMethod(
            firstUsage.deprecatedDeclaration.filePath,
            firstUsage.deprecatedDeclaration.name
          );
        } else if (group.usages.length > 0) {
          locallyRemoveIgnoredMethod(group.usages[0].filePath, group.usages[0].name);
        }
      };

      buttonContainer.appendChild(expandControl);
      buttonContainer.appendChild(ignoreButton);
      actionCell.appendChild(buttonContainer);

      mainRow.appendChild(nameCell);
      mainRow.appendChild(fileNameCell);
      mainRow.appendChild(urgencyCell);
      mainRow.appendChild(reasonCell);
      mainRow.appendChild(actionCell);

      const expandRow = document.createElement('tr');
      expandRow.className = 'expandable-row';
      expandRow.style.display = 'none';

      const expandCell = document.createElement('td');
      expandCell.colSpan = 5;

      const usageContainer = document.createElement('div');
      usageContainer.className = 'usage-container';

      const usageTitle = document.createElement('h4');
      usageTitle.textContent = 'Call sites';
      usageContainer.appendChild(usageTitle);

      const usageList = document.createElement('div');
      usageList.className = 'usage-list';

      group.usages.forEach((usage) => {
        const usageItem = document.createElement('div');

        const isDeclaration =
          usage.deprecatedDeclaration &&
          usage.filePath === usage.deprecatedDeclaration.filePath &&
          usage.line === usage.deprecatedDeclaration.line;

        usageItem.className = `usage-item ${isDeclaration ? 'declaration-usage' : ''}`;
        if (isDeclaration) {
          usageItem.title = 'This is the definition of the deprecated item';
        }

        usageItem.title = `Go to call site — ${usage.filePath}:${usage.line}`;
        usageItem.tabIndex = 0;
        usageItem.setAttribute('role', 'link');
        usageItem.onclick = () => openFileAtLine(usage.filePath, usage.line);
        usageItem.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFileAtLine(usage.filePath, usage.line);
          }
        };

        let replacementHtml = '';
        if (usage.deprecationReason) {
          const replacement = extractReplacement(usage.deprecationReason);
          if (replacement) {
            replacementHtml = `<span class="replacement-suggestion">→ use <code>${escapeHtml(replacement)}</code></span>`;
          }
        }

        usageItem.innerHTML = `
          <div class="usage-content">
            <strong>${escapeHtml(usage.fileName)}</strong> (line ${usage.line})
            ${replacementHtml}
            <br>
            <small>${escapeHtml(usage.filePath)}</small>
          </div>
        `;

        usageList.appendChild(usageItem);
      });

      usageContainer.appendChild(usageList);
      expandCell.appendChild(usageContainer);
      expandRow.appendChild(expandCell);

      // Use DocumentFragment for better performance
      const fragment = document.createDocumentFragment();
      fragment.appendChild(mainRow);
      fragment.appendChild(expandRow);
      resultsBody.appendChild(fragment);
    });
  }

  // Kept in step with the grid-template-rows transition in style.css.
  const EXPAND_MS = 240;

  function usageBadgeTitle(count, expanded) {
    const sites = `${count} call site${count === 1 ? '' : 's'}`;
    return `${sites} — click to ${expanded ? 'collapse' : 'expand'}`;
  }

  function toggleExpand(mainRow, group) {
    const expandRow = mainRow.nextSibling;
    const badge = mainRow.querySelector('.usage-badge');

    const setBadgeState = (expanded) => {
      if (!badge) {
        return;
      }
      badge.classList.toggle('expanded', expanded);
      badge.setAttribute('aria-expanded', String(expanded));
      // The count is the label, so the state lives in the title and the
      // accessible name instead of in the text.
      badge.title = usageBadgeTitle(group.usages.length, expanded);
      badge.setAttribute('aria-label', badge.title);
    };

    if (expandRow.classList.contains('show')) {
      expandRow.classList.remove('show');
      mainRow.classList.remove('expanded');
      setBadgeState(false);
      // Matches the collapse transition; the row is only taken out of the flow
      // once it has finished closing.
      setTimeout(() => {
        expandRow.style.display = 'none';
      }, EXPAND_MS);
    } else {
      // `block`, not `table-row`: the stylesheet lays this row out as a block
      // so its cell can be the animating grid. An inline `table-row` would win
      // over that and the transition would never run.
      expandRow.style.display = 'block';
      // Force a layout pass so the browser has a 0fr starting point to animate
      // from rather than jumping straight to the open state.
      expandRow.offsetHeight;
      expandRow.classList.add('show');
      mainRow.classList.add('expanded');
      setBadgeState(true);
    }
  }

  function openFile(filePath) {
    vscode.postMessage({
      command: 'openFile',
      filePath: filePath,
    });
  }

  function openFileAtLine(filePath, line) {
    vscode.postMessage({
      command: 'openFileAtLine',
      filePath: filePath,
      line: line,
    });
  }

  function ignoreMethod(filePath, methodName) {
    vscode.postMessage({
      command: 'ignoreMethod',
      filePath: filePath,
      methodName: methodName,
    });
  }

  function locallyRemoveIgnoredMethod(filePath, methodName) {
    currentResults = currentResults.filter((item) => {
      const isDirectMatch =
        item.filePath === filePath && item.name === methodName && item.kind !== 'usage';
      const isUsageOfIgnored =
        item.kind === 'usage' &&
        item.deprecatedDeclaration &&
        item.deprecatedDeclaration.filePath === filePath &&
        item.deprecatedDeclaration.name === methodName;
      return !isDirectMatch && !isUsageOfIgnored;
    });
    renderedSignature = null;
    applyFilters();
  }

  function ignoreFile(filePath) {
    vscode.postMessage({
      command: 'ignoreFile',
      filePath: filePath,
    });
  }

  function showStatus(message, className) {
    if (!statusDiv) {
      return;
    }
    statusDiv.textContent = message;
    statusDiv.className = `status show ${className}`;
  }

  function hideStatus() {
    if (!statusDiv) {
      return;
    }
    statusDiv.className = 'status';
    statusDiv.textContent = '';
  }

  const clearAllIgnoresBtn = document.getElementById('clearAllIgnoresBtn');
  if (clearAllIgnoresBtn) {
    clearAllIgnoresBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'clearAll' });
    });
  }

  const filePatternInput = document.getElementById('filePatternInput');
  const methodPatternInput = document.getElementById('methodPatternInput');
  const addFilePatternBtn = document.getElementById('addFilePatternBtn');
  const addMethodPatternBtn = document.getElementById('addMethodPatternBtn');

  function wirePatternInput(button, input, command) {
    if (!button || !input) {
      return;
    }
    button.addEventListener('click', () => {
      const pattern = input.value.trim();
      if (pattern) {
        vscode.postMessage({ command, pattern });
        input.value = '';
      }
    });
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        button.click();
      }
    });
  }

  wirePatternInput(addFilePatternBtn, filePatternInput, 'addFilePattern');
  wirePatternInput(addMethodPatternBtn, methodPatternInput, 'addMethodPattern');

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = document.getElementById(btn.getAttribute('data-tab'));
      if (tab) {
        tab.classList.add('active');
      }
    });
  });

  function renderIgnoreList(rules) {
    renderIgnoredFiles(rules.files || []);
    renderIgnoredMethods(rules.methods || {});
    renderPatterns(document.getElementById('filePatternsList'), rules.filePatterns || [], {
      empty: 'No file patterns added',
      command: 'removeFilePattern',
    });
    renderPatterns(document.getElementById('methodPatternsList'), rules.methodPatterns || [], {
      empty: 'No method patterns added',
      command: 'removeMethodPattern',
    });
  }

  function renderEmptyItem(list, text) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = text;
    list.appendChild(li);
  }

  function createRemoveButton(onClick) {
    const button = document.createElement('button');
    button.className = 'btn btn-secondary btn-small';
    button.textContent = 'Remove';
    button.addEventListener('click', onClick);
    return button;
  }

  function renderIgnoredFiles(files) {
    const list = document.getElementById('filesList');
    if (!list) {
      return;
    }
    list.innerHTML = '';

    if (files.length === 0) {
      renderEmptyItem(list, 'No ignored files');
      return;
    }

    files.forEach((filePath) => {
      const li = document.createElement('li');
      li.className = 'ignore-item';

      const pathElement = document.createElement('div');
      pathElement.className = 'ignore-item-path';
      pathElement.textContent = filePath;

      li.appendChild(pathElement);
      li.appendChild(
        createRemoveButton(() => vscode.postMessage({ command: 'removeFileIgnore', filePath }))
      );
      list.appendChild(li);
    });
  }

  function renderIgnoredMethods(methods) {
    const list = document.getElementById('methodsList');
    if (!list) {
      return;
    }
    list.innerHTML = '';

    const entries = Object.entries(methods || {});
    if (entries.length === 0) {
      renderEmptyItem(list, 'No ignored methods/properties');
      return;
    }

    entries.forEach(([filePath, methodNames]) => {
      methodNames.forEach((methodName) => {
        const li = document.createElement('li');
        li.className = 'ignore-item';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'ignore-item-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'ignore-item-name';
        nameDiv.textContent = methodName;

        const pathDiv = document.createElement('div');
        pathDiv.className = 'ignore-item-path';
        pathDiv.textContent = filePath;

        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(pathDiv);

        li.appendChild(infoDiv);
        li.appendChild(
          createRemoveButton(() =>
            vscode.postMessage({ command: 'removeMethodIgnore', filePath, methodName })
          )
        );
        list.appendChild(li);
      });
    });
  }

  function renderPatterns(list, patterns, options) {
    if (!list) {
      return;
    }
    list.innerHTML = '';

    if (patterns.length === 0) {
      renderEmptyItem(list, options.empty);
      return;
    }

    patterns.forEach((pattern) => {
      const li = document.createElement('li');
      li.className = 'pattern-item';

      const codeEl = document.createElement('code');
      codeEl.className = 'pattern-code';
      codeEl.textContent = pattern;

      li.appendChild(codeEl);
      li.appendChild(
        createRemoveButton(() => vscode.postMessage({ command: options.command, pattern }))
      );
      list.appendChild(li);
    });
  }

  const URGENCY_RANK = { removed: 3, scheduled: 2, announced: 1 };
  const NUMERIC_SORT_COLUMNS = ['urgency', 'usages'];
  const COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });

  let sortColumn = 'urgency';
  let sortDirection = 'desc';

  function groupReason(group) {
    if (group.deprecatedItem && group.deprecatedItem.deprecationReason) {
      return group.deprecatedItem.deprecationReason;
    }
    const usage = group.usages.find((item) => item.deprecationReason);
    return usage ? usage.deprecationReason : '';
  }

  function groupFileName(group) {
    if (group.deprecatedItem) {
      return group.deprecatedItem.fileName;
    }
    return group.usages.length > 0 ? group.usages[0].fileName : '';
  }

  function sortValue(group, column) {
    switch (column) {
      case 'file':
        return groupFileName(group);
      case 'urgency':
        return urgencyRank(groupSchedule(group));
      case 'reason':
        return groupReason(group);
      case 'usages':
        return group.usages.length;
      default:
        return group.name;
    }
  }

  function sortGroups(groups) {
    const direction = sortDirection === 'asc' ? 1 : -1;
    const isNumeric = NUMERIC_SORT_COLUMNS.includes(sortColumn);

    return groups
      .map((group) => ({ group, key: sortValue(group, sortColumn) }))
      .sort((a, b) => {
        const order = isNumeric ? a.key - b.key : COLLATOR.compare(a.key, b.key);
        return order * direction;
      })
      .map((entry) => entry.group);
  }

  function updateSortIndicators() {
    document.querySelectorAll('.sort-header').forEach((header) => {
      const isActive = header.getAttribute('data-sort') === sortColumn;
      header.classList.toggle('sort-asc', isActive && sortDirection === 'asc');
      header.classList.toggle('sort-desc', isActive && sortDirection === 'desc');
      const parentCell = header.closest('th');
      if (parentCell) {
        parentCell.setAttribute('aria-sort', isActive ? `${sortDirection}ending` : 'none');
      }
    });
  }

  document.querySelectorAll('.sort-header').forEach((header) => {
    header.addEventListener('click', () => {
      const column = header.getAttribute('data-sort');
      if (column === sortColumn) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = column;
        sortDirection = NUMERIC_SORT_COLUMNS.includes(column) ? 'desc' : 'asc';
      }
      updateSortIndicators();
      renderResults();
    });
  });

  updateSortIndicators();

  function groupSchedule(group) {
    if (group.deprecatedItem && group.deprecatedItem.deprecationSchedule) {
      return group.deprecatedItem.deprecationSchedule;
    }
    const usage = group.usages.find((item) => item.deprecationSchedule);
    return usage ? usage.deprecationSchedule : null;
  }

  function urgencyRank(schedule) {
    return schedule ? URGENCY_RANK[schedule.urgency] || 0 : 0;
  }

  function urgencyLabel(schedule) {
    if (schedule.urgency === 'removed') {
      return 'Removed';
    }
    if (schedule.urgency === 'scheduled') {
      return schedule.removalVersion
        ? `Removed in ${schedule.removalVersion}`
        : `Removal ${schedule.removalDate}`;
    }
    return 'Announced';
  }

  // What the badge means, before the dates that produced it. Without this a
  // schedule carrying no version or date at all yielded an empty title and the
  // badge had no tooltip whatsoever.
  const URGENCY_MEANING = {
    removed: 'Already removed — these call sites are broken',
    scheduled: 'Removal is scheduled',
    announced: 'Deprecated, with no removal announced',
  };

  function urgencyTitle(schedule) {
    const parts = [URGENCY_MEANING[schedule.urgency] || 'Deprecated'];
    if (schedule.sinceVersion) parts.push(`Deprecated since ${schedule.sinceVersion}`);
    if (schedule.sinceDate) parts.push(`Deprecated since ${schedule.sinceDate}`);
    if (schedule.removalVersion) parts.push(`Removed in ${schedule.removalVersion}`);
    if (schedule.removalDate) parts.push(`Removal date ${schedule.removalDate}`);
    return parts.join(' · ');
  }

  function extractReplacement(deprecationReason) {
    if (!deprecationReason || typeof deprecationReason !== 'string') {
      return null;
    }

    const patterns = [
      /use\s+([`']?)(\w+(?:\(\))?)\1/i,
      /replace(?:d)?\s+(?:with|by)\s+([`']?)(\w+(?:\(\))?)\1/i,
      /see\s+([`']?)(\w+(?:\(\))?)\1/i,
      /instead\s+(?:use|of)\s+([`']?)(\w+(?:\(\))?)\1/i,
      /prefer\s+([`']?)(\w+(?:\(\))?)\1/i,
      /migrate\s+to\s+([`']?)(\w+(?:\(\))?)\1/i,
    ];

    const stopwords = new Set([
      'the',
      'a',
      'an',
      'this',
      'that',
      'it',
      'its',
      'of',
      'in',
      'on',
      'for',
      'to',
      'with',
      'instead',
      'new',
      'other',
      'another',
      'property',
      'method',
      'function',
      'class',
      'constructor',
      'version',
    ]);

    for (const pattern of patterns) {
      const match = deprecationReason.match(pattern);
      if (match && match[2] && !stopwords.has(match[2].toLowerCase())) {
        return match[2];
      }
    }

    return null;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  window.openFile = openFile;
  window.openFileAtLine = openFileAtLine;
  window.ignoreMethod = ignoreMethod;
  window.ignoreFile = ignoreFile;

  initColumnResize();
})();
