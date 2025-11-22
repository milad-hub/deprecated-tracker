(function () {
  const vscode = acquireVsCodeApi();

  const clearAllBtn = document.getElementById('clearAllBtn');
  const methodsList = document.getElementById('methodsList');

  clearAllBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'clearAll' });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;

    if (message.command === 'updateIgnoreList') {
      renderIgnoreList(message.rules);
    }
  });

  function renderIgnoreList(rules) {
    renderMethods(rules.methodsGlobal || []);
  }

  function renderMethods(methodNames) {
    methodsList.innerHTML = '';

    if (!methodNames || methodNames.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-state';
      li.textContent = 'No ignored methods/properties';
      methodsList.appendChild(li);
      return;
    }
    methodNames.forEach((methodName) => {
      const li = document.createElement('li');
      li.className = 'ignore-item';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'ignore-item-info';
      infoDiv.innerHTML = `
                  <div class="ignore-item-name">${escapeHtml(methodName)}</div>
                `;

      const removeButton = document.createElement('button');
      removeButton.className = 'btn btn-secondary btn-small';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => removeMethodIgnore('', methodName));

      li.appendChild(infoDiv);
      li.appendChild(removeButton);
      methodsList.appendChild(li);
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

  window.removeMethodIgnore = removeMethodIgnore;
})();
