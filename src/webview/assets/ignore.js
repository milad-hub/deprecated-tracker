(function () {
  const vscode = acquireVsCodeApi();

  const clearAllBtn = document.getElementById('clearAllBtn');
  const filesList = document.getElementById('filesList');
  const methodsList = document.getElementById('methodsList');
  const filePatternsList = document.getElementById('filePatternsList');
  const methodPatternsList = document.getElementById('methodPatternsList');
  const addFilePatternBtn = document.getElementById('addFilePatternBtn');
  const addMethodPatternBtn = document.getElementById('addMethodPatternBtn');
  const filePatternInput = document.getElementById('filePatternInput');
  const methodPatternInput = document.getElementById('methodPatternInput');

  clearAllBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'clearAll' });
  });

  addFilePatternBtn.addEventListener('click', () => {
    const pattern = filePatternInput.value.trim();
    if (pattern) {
      vscode.postMessage({ command: 'addFilePattern', pattern });
      filePatternInput.value = '';
    }
  });

  addMethodPatternBtn.addEventListener('click', () => {
    const pattern = methodPatternInput.value.trim();
    if (pattern) {
      vscode.postMessage({ command: 'addMethodPattern', pattern });
      methodPatternInput.value = '';
    }
  });

  filePatternInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addFilePatternBtn.click();
    }
  });

  methodPatternInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addMethodPatternBtn.click();
    }
  });

  window.addEventListener('message', (event) => {
    const message = event.data;

    if (message.command === 'updateIgnoreList') {
      renderIgnoreList(message.rules);
    }
  });

  function renderIgnoreList(rules) {
    renderFiles(rules.files || []);
    renderMethods(rules.methods || {});
    renderFilePatterns(rules.filePatterns || []);
    renderMethodPatterns(rules.methodPatterns || []);
  }

  function renderFiles(files) {
    filesList.innerHTML = '';

    if (files.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-state';
      li.textContent = 'No ignored files';
      filesList.appendChild(li);
      return;
    }

    files.forEach((filePath) => {
      const li = document.createElement('li');
      li.className = 'ignore-item';

      const pathElement = document.createElement('div');
      pathElement.className = 'ignore-item-path';
      pathElement.textContent = filePath;

      const removeButton = document.createElement('button');
      removeButton.className = 'btn btn-secondary btn-small';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        vscode.postMessage({ command: 'removeFileIgnore', filePath });
      });

      li.appendChild(pathElement);
      li.appendChild(removeButton);
      filesList.appendChild(li);
    });
  }

  function renderFilePatterns(patterns) {
    filePatternsList.innerHTML = '';

    if (!patterns || patterns.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-state';
      li.textContent = 'No file patterns added';
      filePatternsList.appendChild(li);
      return;
    }

    patterns.forEach((pattern) => {
      const li = document.createElement('li');
      li.className = 'pattern-item';

      const codeEl = document.createElement('code');
      codeEl.className = 'pattern-code';
      codeEl.textContent = pattern;

      const removeButton = document.createElement('button');
      removeButton.className = 'btn btn-secondary btn-small';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        vscode.postMessage({ command: 'removeFilePattern', pattern });
      });

      li.appendChild(codeEl);
      li.appendChild(removeButton);
      filePatternsList.appendChild(li);
    });
  }

  function renderMethodPatterns(patterns) {
    methodPatternsList.innerHTML = '';

    if (!patterns || patterns.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-state';
      li.textContent = 'No method patterns added';
      methodPatternsList.appendChild(li);
      return;
    }

    patterns.forEach((pattern) => {
      const li = document.createElement('li');
      li.className = 'pattern-item';

      const codeEl = document.createElement('code');
      codeEl.className = 'pattern-code';
      codeEl.textContent = pattern;

      const removeButton = document.createElement('button');
      removeButton.className = 'btn btn-secondary btn-small';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        vscode.postMessage({ command: 'removeMethodPattern', pattern });
      });

      li.appendChild(codeEl);
      li.appendChild(removeButton);
      methodPatternsList.appendChild(li);
    });
  }

  function renderMethods(methods) {
    methodsList.innerHTML = '';

    const entries = Object.entries(methods || {});
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-state';
      li.textContent = 'No ignored methods/properties';
      methodsList.appendChild(li);
      return;
    }

    entries.forEach(([filePath, methodNames]) => {
      methodNames.forEach((methodName) => {
        const li = document.createElement('li');
        li.className = 'ignore-item';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'ignore-item-info';
        infoDiv.innerHTML = `
          <div class="ignore-item-name">${escapeHtml(methodName)}</div>
          <div class="ignore-item-path">${escapeHtml(filePath)}</div>
        `;

        const removeButton = document.createElement('button');
        removeButton.className = 'btn btn-secondary btn-small';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', () =>
          removeMethodIgnore(filePath, methodName)
        );

        li.appendChild(infoDiv);
        li.appendChild(removeButton);
        methodsList.appendChild(li);
      });
    });
  }

  function removeMethodIgnore(filePath, methodName) {
    vscode.postMessage({
      command: 'removeMethodIgnore',
      filePath: filePath,
      methodName: methodName,
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  window.removeMethodIgnore = removeMethodIgnore;
  vscode.postMessage({ command: 'webviewReady' });
})();
