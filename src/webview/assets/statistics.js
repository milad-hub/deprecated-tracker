// @ts-check
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // Handle messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.command) {
      case 'updateStatistics':
        updateStatistics(message.statistics);
        break;
    }
  });

  /**
   * Update the statistics display
   * @param {any} statistics
   */
  function updateStatistics(statistics) {
    const emptyState = document.getElementById('empty-state');
    const statsContent = document.getElementById('statistics-content');

    if (!statistics || statistics.totalItems === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (statsContent) statsContent.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (statsContent) statsContent.style.display = 'block';

    // Update summary cards
    updateElement('total-items', statistics.totalItems);
    updateElement('total-declarations', statistics.totalDeclarations);
    updateElement('total-usages', statistics.totalUsages);

    // Update breakdown by kind
    renderByKind(statistics.byKind);

    // Update quick wins
    renderQuickWins(statistics.quickWins);

    // Update needs attention
    renderNeedsAttention(statistics.needsAttention);

    // Update top most used
    renderTopMostUsed(statistics.topMostUsed);

    // Update hotspot files
    renderHotspotFiles(statistics.hotspotFiles);
  }

  /**
   * Update element text content
   * @param {string} id
   * @param {any} value
   */
  function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = String(value);
    }
  }

  /**
   * Render breakdown by kind
   * @param {Record<string, number>} byKind
   */
  function renderByKind(byKind) {
    const container = document.getElementById('by-kind-container');
    if (!container) return;

    container.innerHTML = '';

    const kindIcons = {
      method: '🔧',
      property: '🏷️',
      class: '📦',
      interface: '🔌',
      function: '⚙️',
      usage: '🔗',
    };

    const section = container.closest('.section');
    let hasItems = false;

    Object.entries(byKind).forEach(([kind, count]) => {
      if (count > 0) {
        hasItems = true;
        const kindItem = document.createElement('div');
        kindItem.className = 'kind-item';
        kindItem.innerHTML = `
          <span class="kind-icon">${
          // @ts-ignore
          kindIcons[kind] || '📄'
          }
          </span>
          <span class="kind-name">${capitalize(kind)}</span>
          <span class="kind-count">${count}</span>
        `;
        container.appendChild(kindItem);
      }
    });

    if (section) {
      // @ts-ignore
      section.style.display = hasItems ? 'block' : 'none';
    }
  }

  /**
   * Render top most used items
   * @param {Array<{name: string, fileName: string, filePath: string, usageCount: number}>} topMostUsed
   */
  function renderTopMostUsed(topMostUsed) {
    const tbody = document.getElementById('top-most-used-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (topMostUsed.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="no-data">No usage data available</td></tr>';
      return;
    }

    topMostUsed.forEach((item) => {
      const row = document.createElement('tr');
      row.className = 'clickable-row';
      row.innerHTML = `
        <td><code>${escapeHtml(item.name)}</code></td>
        <td class="file-name">${escapeHtml(item.fileName)}</td>
        <td class="usage-count">${item.usageCount}</td>
      `;
      row.addEventListener('click', () => {
        openFile(item.filePath);
      });
      tbody.appendChild(row);
    });
  }

  /**
   * Render hotspot files
   * @param {Array<{fileName: string, filePath: string, count: number}>} hotspotFiles
   */
  function renderHotspotFiles(hotspotFiles) {
    const tbody = document.getElementById('hotspot-files-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (hotspotFiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" class="no-data">No data available</td></tr>';
      return;
    }

    hotspotFiles.forEach((item) => {
      const row = document.createElement('tr');
      row.className = 'clickable-row';
      row.innerHTML = `
        <td class="file-name">${escapeHtml(item.fileName)}</td>
        <td class="count-badge">${item.count}</td>
      `;
      row.addEventListener('click', () => {
        openFile(item.filePath);
      });
      tbody.appendChild(row);
    });
  }

  /**
   * Render quick wins
   * @param {Array<{name: string, fileName: string, filePath: string, usageCount: number}>} quickWins
   */
  function renderQuickWins(quickWins) {
    const tbody = document.getElementById('quick-wins-body');
    const section = document.getElementById('quick-wins-section');
    if (!tbody || !section) return;

    if (quickWins.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    tbody.innerHTML = '';

    quickWins.forEach((item) => {
      const row = document.createElement('tr');
      row.className = 'clickable-row';
      row.innerHTML = `
        <td><code>${escapeHtml(item.name)}</code></td>
        <td class="file-name">${escapeHtml(item.fileName)}</td>
        <td class="usage-count">${item.usageCount}</td>
      `;
      row.addEventListener('click', () => {
        openFile(item.filePath);
      });
      tbody.appendChild(row);
    });
  }

  /**
   * Render needs attention items
   * @param {Array<{name: string, kind: string, fileName: string, filePath: string}>} needsAttention
   */
  function renderNeedsAttention(needsAttention) {
    const tbody = document.getElementById('needs-attention-body');
    const section = document.getElementById('needs-attention-section');
    if (!tbody || !section) return;

    if (needsAttention.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    tbody.innerHTML = '';

    needsAttention.forEach((item) => {
      const row = document.createElement('tr');
      row.className = 'clickable-row';
      row.innerHTML = `
        <td><code>${escapeHtml(item.name)}</code></td>
        <td><span class="kind-badge">${capitalize(item.kind)}</span></td>
        <td class="file-name">${escapeHtml(item.fileName)}</td>
      `;
      row.addEventListener('click', () => {
        openFile(item.filePath);
      });
      tbody.appendChild(row);
    });
  }

  /**
   * Open a file in the editor
   * @param {string} filePath
   */
  function openFile(filePath) {
    vscode.postMessage({
      command: 'openFileAtLine',
      filePath: filePath,
      line: 1,
    });
  }

  /**
   * Capitalize first letter
   * @param {string} str
   */
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
