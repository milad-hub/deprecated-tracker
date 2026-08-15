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
        renderTrend(message.trend);
        break;
    }
  });

  vscode.postMessage({ command: 'webviewReady' });

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

  const TREND_WIDTH = 600;
  const TREND_HEIGHT = 180;
  const TREND_PADDING = { left: 46, right: 16, top: 16, bottom: 30 };
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function renderTrend(trend) {
    const section = document.getElementById('trend-section');
    const chart = document.getElementById('trend-chart');
    const delta = document.getElementById('trend-delta');
    if (!section || !chart || !delta) return;

    const scans = Array.isArray(trend) ? trend.filter(isPlottableScan) : [];

    if (scans.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    chart.textContent = '';
    chart.appendChild(buildTrendChart(scans));
    renderTrendDelta(delta, scans);
  }

  function isPlottableScan(scan) {
    return (
      scan &&
      Number.isFinite(scan.usageCount) &&
      Number.isFinite(scan.timestamp)
    );
  }

  function svgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function buildTrendChart(scans) {
    const plotWidth = TREND_WIDTH - TREND_PADDING.left - TREND_PADDING.right;
    const plotHeight = TREND_HEIGHT - TREND_PADDING.top - TREND_PADDING.bottom;
    const values = scans.map((scan) => scan.usageCount);
    const highest = Math.max.apply(null, values);
    const lowest = Math.min.apply(null, values);
    const span = highest - lowest;
    const baseline = values[0];
    const latest = values[values.length - 1];

    const xs = scans.map((_scan, index) =>
      scans.length === 1
        ? TREND_PADDING.left + plotWidth / 2
        : TREND_PADDING.left + (index / (scans.length - 1)) * plotWidth,
    );
    const ys = scans.map((scan) =>
      span === 0
        ? TREND_PADDING.top + plotHeight / 2
        : TREND_PADDING.top +
          plotHeight -
          ((scan.usageCount - lowest) / span) * plotHeight,
    );
    const centreY = TREND_PADDING.top + plotHeight / 2;
    const highestY = span === 0 ? centreY : TREND_PADDING.top;
    const lowestY = span === 0 ? centreY : TREND_PADDING.top + plotHeight;

    const svg = svgElement('svg', {
      viewBox: `0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`,
      class: 'trend-svg',
      role: 'img',
    });

    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = describeTrend(scans, baseline, latest);
    svg.appendChild(title);
    svg.setAttribute('aria-label', title.textContent);

    svg.appendChild(
      svgElement('line', {
        class: 'trend-baseline',
        x1: TREND_PADDING.left,
        y1: ys[0],
        x2: TREND_PADDING.left + plotWidth,
        y2: ys[0],
      }),
    );

    const linePoints = xs.map((x, index) => `${x},${ys[index]}`);

    if (scans.length > 1) {
      const floor = TREND_PADDING.top + plotHeight;
      const lastIndex = scans.length - 1;
      svg.appendChild(
        svgElement('path', {
          class: 'trend-area',
          d: `M ${xs[0]},${floor} L ${linePoints.join(' L ')} L ${xs[lastIndex]},${floor} Z`,
        }),
      );
      svg.appendChild(
        svgElement('polyline', {
          class: 'trend-line',
          points: linePoints.join(' '),
        }),
      );
    }

    xs.forEach((x, index) => {
      svg.appendChild(
        svgElement('circle', {
          class: 'trend-point',
          cx: x,
          cy: ys[index],
          r: 3.5,
        }),
      );
    });

    appendTrendLabel(svg, TREND_PADDING.left - 8, highestY, 'end', highest);
    if (span > 0) {
      appendTrendLabel(svg, TREND_PADDING.left - 8, lowestY, 'end', lowest);
    }

    const axisY = TREND_HEIGHT - TREND_PADDING.bottom + 18;
    appendTrendLabel(svg, xs[0], axisY, 'start', formatScanDate(scans[0]));
    if (scans.length > 1) {
      appendTrendLabel(
        svg,
        xs[scans.length - 1],
        axisY,
        'end',
        formatScanDate(scans[scans.length - 1]),
      );
    }

    return svg;
  }

  function appendTrendLabel(svg, x, y, anchor, value) {
    const label = svgElement('text', {
      class: 'trend-label',
      x: x,
      y: y,
      'text-anchor': anchor,
      'dominant-baseline': 'middle',
    });
    label.textContent = String(value);
    svg.appendChild(label);
  }

  function describeTrend(scans, baseline, latest) {
    if (scans.length === 1) {
      return `Deprecated usages: ${latest} in the only recorded scan.`;
    }
    return `Deprecated usages across ${scans.length} scans, from ${baseline} on ${formatScanDate(
      scans[0],
    )} to ${latest} on ${formatScanDate(scans[scans.length - 1])}.`;
  }

  function formatScanDate(scan) {
    return new Date(scan.timestamp).toLocaleDateString();
  }

  function renderTrendDelta(element, scans) {
    if (scans.length < 2) {
      element.className = 'trend-delta trend-delta-neutral';
      element.textContent = 'First scan — nothing to compare yet';
      return;
    }

    const change = scans[scans.length - 1].usageCount - scans[0].usageCount;

    if (change === 0) {
      element.className = 'trend-delta trend-delta-neutral';
      element.textContent = 'No change since oldest kept scan';
      return;
    }

    const improving = change < 0;
    element.className = `trend-delta ${
      improving ? 'trend-delta-down' : 'trend-delta-up'
    }`;
    element.textContent = `${improving ? '▼' : '▲'} ${Math.abs(
      change,
    )} since oldest kept scan`;
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
        <td class="usage-count">${escapeHtml(item.usageCount)}</td>
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
        <td class="count-badge">${escapeHtml(item.count)}</td>
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
        <td class="usage-count">${escapeHtml(item.usageCount)}</td>
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
        <td><span class="kind-badge">${escapeHtml(capitalize(item.kind))}</span></td>
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
