(function () {
  const vscode = acquireVsCodeApi();
  let currentResults = [];
  let filteredResults = [];

  const ignoreManagerBtn = document.getElementById('ignoreManagerBtn');
  const nameFilter = document.getElementById('nameFilter');
  const fileFilter = document.getElementById('fileFilter');
  const statusDiv = document.getElementById('status');
  const resultsBody = document.getElementById('resultsBody');

  if (ignoreManagerBtn) {
    ignoreManagerBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'showIgnoreManager' });
    });
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
        vscode.postMessage({
          command: 'exportResults',
          format: format,
        });
        exportMenu.classList.remove('show');
      });
    });
    document.addEventListener('click', () => {
      if (exportMenu.classList.contains('show')) {
        exportMenu.classList.remove('show');
      }
    });
  }

  if (nameFilter && fileFilter) {
    nameFilter.addEventListener('input', () => {
      applyFilters();
      debouncedSaveFilterState();
    });
    fileFilter.addEventListener('input', () => {
      applyFilters();
      debouncedSaveFilterState();
    });
  }

  let saveFilterStateTimeout;
  function debouncedSaveFilterState() {
    clearTimeout(saveFilterStateTimeout);
    saveFilterStateTimeout = setTimeout(() => {
      if (nameFilter && fileFilter) {
        vscode.postMessage({
          command: 'saveFilterState',
          nameFilter: nameFilter.value,
          fileFilter: fileFilter.value,
        });
      }
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
        applyFilters();
        break;
      case 'scanning':
        if (message.scanning) {
          showStatus('Scanning project...', 'scanning');
        } else {
          hideStatus();
        }
        break;
    }
  });

  function applyFilters() {
    if (!nameFilter || !fileFilter) {
      return;
    }

    const nameFilterValue = nameFilter.value.toLowerCase().trim();
    const fileFilterValue = fileFilter.value.toLowerCase().trim();

    filteredResults = currentResults.filter((item) => {
      const matchesName = !nameFilterValue || item.name.toLowerCase().includes(nameFilterValue);
      const matchesFile =
        !fileFilterValue ||
        item.fileName.toLowerCase().includes(fileFilterValue) ||
        item.filePath.toLowerCase().includes(fileFilterValue);

      return matchesName && matchesFile;
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
                <td colspan="4" class="empty-state">
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

    groupedResults.forEach((group, key) => {
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

      const reasonCell = document.createElement('td');
      reasonCell.style.maxWidth = '300px';
      reasonCell.style.overflow = 'hidden';
      reasonCell.style.textOverflow = 'ellipsis';
      reasonCell.style.whiteSpace = 'nowrap';

      let deprecationReason = '-';
      if (group.deprecatedItem && group.deprecatedItem.deprecationReason) {
        deprecationReason = group.deprecatedItem.deprecationReason;
      } else if (group.usages.length > 0 && group.usages[0].deprecationReason) {
        deprecationReason = group.usages[0].deprecationReason;
      }

      reasonCell.textContent = deprecationReason;
      if (deprecationReason !== '-') {
        reasonCell.title = deprecationReason;
      } else {
        reasonCell.style.color = 'var(--vscode-descriptionForeground)';
      }

      const actionCell = document.createElement('td');

      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.gap = '8px';

      const expandButton = document.createElement('button');
      expandButton.className = 'btn btn-primary btn-small show-more-btn';
      expandButton.textContent = `Show ${group.usages.length} usage${group.usages.length !== 1 ? 's' : ''}`;
      expandButton.onclick = () => toggleExpand(mainRow, group);

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

      buttonContainer.appendChild(expandButton);
      buttonContainer.appendChild(ignoreButton);
      actionCell.appendChild(buttonContainer);

      mainRow.appendChild(nameCell);
      mainRow.appendChild(fileNameCell);
      mainRow.appendChild(reasonCell);
      mainRow.appendChild(actionCell);

      // Empty cell for refresh button column
      const emptyCell = document.createElement('td');
      mainRow.appendChild(emptyCell);

      resultsBody.appendChild(mainRow);

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
        usageItem.className = 'usage-item';
        usageItem.onclick = () => openFileAtLine(usage.filePath, usage.line);

        usageItem.innerHTML = `
          <strong>${usage.fileName}</strong> (line ${usage.line})
          <br>
          <small>${usage.filePath}</small>
        `;

        usageList.appendChild(usageItem);
      });

      usageContainer.appendChild(usageList);
      expandCell.appendChild(usageContainer);
      expandRow.appendChild(expandCell);

      resultsBody.appendChild(expandRow);
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
      const isDirectMatch = item.filePath === filePath && item.name === methodName;
      const isUsageOfIgnored =
        item.kind === 'usage' &&
        item.deprecatedDeclaration &&
        item.deprecatedDeclaration.filePath === filePath &&
        item.deprecatedDeclaration.name === methodName;
      const isUsageByNameOnly =
        item.kind === 'usage' && !item.deprecatedDeclaration && item.name === methodName;
      return !isDirectMatch && !isUsageOfIgnored && !isUsageByNameOnly;
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
