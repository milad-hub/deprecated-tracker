(function () {
  const vscode = acquireVsCodeApi();
  let currentResults = [];
  let filteredResults = [];

  const ignoreManagerBtn = document.getElementById('ignoreManagerBtn');
  const nameFilter = document.getElementById('nameFilter');
  const fileFilter = document.getElementById('fileFilter');
  const reasonFilter = document.getElementById('reasonFilter');
  const statusDiv = document.getElementById('status');
  const resultsBody = document.getElementById('resultsBody');

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
      ignoreView.style.display = show ? 'block' : 'none';
    }
    if (resultsControls) {
      resultsControls.style.display = show ? 'none' : 'flex';
    }
    if (ignoreControls) {
      ignoreControls.style.display = show ? 'flex' : 'none';
    }
    if (panelTitle) {
      panelTitle.textContent = show ? 'Ignore Management' : 'Deprecated Tracker';
    }
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
    exportMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
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
      case 'results':
        currentResults = message.results || [];
        const isViewOnly = message.viewOnly || false;
        showIgnoreView(false);
        applyFilters();
        if (isViewOnly) {
          disableIgnoreActions();
          showStatus('Viewing historical scan (read-only)', 'info');
        } else {
          enableIgnoreActions();
        }
        break;
      case 'showAiPrompt':
        openAiPromptModal(message.prompt || '');
        break;
      case 'aiPromptCopied':
        if (aiPromptStatus) {
          aiPromptStatus.textContent = message.copied
            ? 'Copied to clipboard.'
            : 'Copy failed.';
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
      const formattedDate = date.toLocaleString();
      const duration = (scan.duration / 1000).toFixed(2);

      item.innerHTML = `
        <div class="history-item-header">
          <div class="history-item-time">${formattedDate}</div>
          <div class="history-item-actions">
            <div class="dropdown history-export-dropdown">
              <button class="btn btn-secondary btn-small history-export-btn">Export ▼</button>
              <div class="dropdown-menu">
                <a href="#" data-scanid="${scan.scanId}" data-format="csv">Export as CSV</a>
                <a href="#" data-scanid="${scan.scanId}" data-format="json">Export as JSON</a>
                <a href="#" data-scanid="${scan.scanId}" data-format="markdown">Export as Markdown</a>
                <p class="dropdown-note">No AI prompt — a stored scan's line numbers may be stale.</p>
              </div>
            </div>
            <button class="btn btn-primary btn-small history-view-btn" data-scanid="${scan.scanId}">View</button>
          </div>
        </div>
        <div class="history-item-stats">
          <span class="history-stat"><strong>${scan.totalItems}</strong> deprecated items</span>
          <span class="history-stat"><strong>${scan.declarationCount}</strong> declarations</span>
          <span class="history-stat"><strong>${scan.usageCount}</strong> usages</span>
          <span class="history-stat">⏱️ ${duration}s</span>
          ${scan.fileCount !== undefined ? `<span class="history-stat">📄 ${scan.fileCount} files</span>` : ''}
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

      menu.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
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

  function applyFilters() {
    const nameFilterValue = nameFilter.value.toLowerCase().trim();
    const fileFilterValue = fileFilter.value.toLowerCase().trim();
    const reasonFilterValue = reasonFilter.value.toLowerCase().trim();

    filteredResults = currentResults.filter((item) => {
      const matchesName = !nameFilterValue || item.name.toLowerCase().includes(nameFilterValue);
      const matchesFile =
        !fileFilterValue ||
        item.fileName.toLowerCase().includes(fileFilterValue) ||
        item.filePath.toLowerCase().includes(fileFilterValue);
      const matchesReason =
        !reasonFilterValue ||
        (item.deprecationReason || '').toLowerCase().includes(reasonFilterValue);

      return matchesName && matchesFile && matchesReason;
    });

    renderResults();
  }

  function renderResults() {
    if (!resultsBody) {
      return;
    }

    resultsBody.innerHTML = '';

    if (filteredResults.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `
                <td colspan="5" class="empty-state">
                    <h3>No deprecated items found</h3>
                    <p>${currentResults.length === 0 ? 'Run a scan to find deprecated methods and properties.' : 'No items match the current filters.'}</p>
                </td>
            `;
      resultsBody.appendChild(row);
      return;
    }

    const groupedResults = new Map();

    filteredResults.forEach((item) => {
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

    const orderedGroups = sortGroups(Array.from(groupedResults.values()));

    orderedGroups.forEach((group) => {
      const mainRow = document.createElement('tr');
      mainRow.className = 'deprecated-item-row';
      mainRow.style.backgroundColor = 'var(--vscode-list-inactiveSelectionBackground)';

      const nameCell = document.createElement('td');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'clickable';
      nameSpan.textContent = group.name;
      nameSpan.style.fontWeight = 'bold';

      if (group.deprecatedItem) {
        nameSpan.onclick = () =>
          openFileAtLine(group.deprecatedItem.filePath, group.deprecatedItem.line);
      } else if (group.usages.length > 0) {
        nameSpan.onclick = () => openFileAtLine(group.usages[0].filePath, group.usages[0].line);
      }

      nameCell.appendChild(nameSpan);

      const fileNameCell = document.createElement('td');
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
        fileSpan.className = 'clickable';
        fileSpan.onclick = () => openFile(_filePath);
      }
      fileNameCell.appendChild(fileSpan);

      const urgencyCell = document.createElement('td');
      const schedule = groupSchedule(group);
      if (schedule) {
        const badge = document.createElement('span');
        badge.className = `urgency-badge urgency-${schedule.urgency}`;
        badge.textContent = urgencyLabel(schedule);
        badge.title = urgencyTitle(schedule);
        urgencyCell.appendChild(badge);
      } else {
        urgencyCell.textContent = '—';
        urgencyCell.style.color = 'var(--vscode-descriptionForeground)';
      }

      const reasonCell = document.createElement('td');
      reasonCell.style.maxWidth = '300px';
      reasonCell.style.overflow = 'hidden';
      reasonCell.style.textOverflow = 'ellipsis';
      reasonCell.style.whiteSpace = 'nowrap';

      const deprecationReason = groupReason(group);

      if (deprecationReason) {
        reasonCell.textContent = deprecationReason;
        reasonCell.title = deprecationReason;
      } else {
        reasonCell.textContent = 'No reason provided';
        reasonCell.style.color = 'var(--vscode-descriptionForeground)';
        reasonCell.style.fontStyle = 'italic';
      }

      const actionCell = document.createElement('td');

      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.gap = '8px';

      let expandControl;
      if (group.usages.length > 0) {
        expandControl = document.createElement('button');
        expandControl.className = 'btn btn-primary btn-small show-more-btn';
        expandControl.textContent = `Show ${group.usages.length} usage${group.usages.length !== 1 ? 's' : ''}`;
        expandControl.onclick = () => toggleExpand(mainRow, group);
      } else {
        expandControl = document.createElement('span');
        expandControl.textContent = 'No usages';
        expandControl.style.color = 'var(--vscode-descriptionForeground)';
        expandControl.style.fontStyle = 'italic';
        expandControl.style.alignSelf = 'center';
      }

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
      expandCell.style.padding = '0';

      const usageContainer = document.createElement('div');
      usageContainer.className = 'usage-container';

      const usageTitle = document.createElement('h4');
      usageTitle.textContent = 'Usages:';
      usageTitle.style.marginBottom = '10px';
      usageTitle.style.color = '#ff6b6b';
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

        usageItem.onclick = () => openFileAtLine(usage.filePath, usage.line);

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

  function toggleExpand(mainRow, group) {
    const expandRow = mainRow.nextSibling;
    const expandButton = mainRow.querySelector('button');

    if (expandRow.classList.contains('show')) {
      expandRow.classList.remove('show');
      expandRow.classList.add('hide');
      expandButton.classList.remove('expanded');
      expandButton.textContent = `Show ${group.usages.length} usage${group.usages.length !== 1 ? 's' : ''}`;
      setTimeout(() => {
        expandRow.style.display = 'none';
        expandRow.classList.remove('hide');
      }, 300);
    } else {
      expandRow.style.display = 'table-row';
      expandRow.offsetHeight;
      expandRow.classList.add('show');
      expandButton.classList.add('expanded');
      expandButton.textContent = `Hide ${group.usages.length} usage${group.usages.length !== 1 ? 's' : ''}`;
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

  function urgencyTitle(schedule) {
    const parts = [];
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
})();
