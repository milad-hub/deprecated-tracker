// @ts-check
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.command === 'updateRequirements') {
      renderRequirements(message.requirements);
    }
  });

  const recheckButton = document.getElementById('requirements-recheck');
  if (recheckButton) {
    recheckButton.addEventListener('click', () => {
      vscode.postMessage({ command: 'refreshRequirements' });
    });
  }

  vscode.postMessage({ command: 'webviewReady' });

  function renderRequirements(requirements) {
    const list = document.getElementById('requirements-list');
    const summary = document.getElementById('requirements-summary');
    if (!list || !summary) {
      return;
    }

    const items = requirements || [];
    const unmet = items.filter((requirement) => !requirement.met);

    summary.textContent =
      unmet.length === 0
        ? 'All requirements met — the extension is ready to scan.'
        : unmet.length + ' of ' + items.length + ' requirements need your attention.';
    summary.className =
      'requirements-summary ' + (unmet.length === 0 ? 'requirements-ok' : 'requirements-blocked');

    list.textContent = '';
    for (const requirement of items) {
      list.appendChild(buildRequirementRow(requirement));
    }
  }

  function buildRequirementRow(requirement) {
    const row = document.createElement('div');
    row.className =
      'requirement-row ' + (requirement.met ? 'requirement-met' : 'requirement-unmet');

    // Still emoji, unlike every other icon in the extension: requirementsAsset
    // .test.ts asserts this element's exact text is "✅", so replacing it with
    // inline SVG is a test change, not a design one.
    const status = document.createElement('div');
    status.className = 'requirement-status';
    status.textContent = requirement.met ? '✅' : '⚠️';
    row.appendChild(status);

    const body = document.createElement('div');
    body.className = 'requirement-body';

    const label = document.createElement('div');
    label.className = 'requirement-label';
    label.textContent = requirement.label;
    body.appendChild(label);

    const detail = document.createElement('div');
    detail.className = 'requirement-detail';
    detail.textContent = requirement.detail;
    body.appendChild(detail);

    if (!requirement.met) {
      const remedy = document.createElement('div');
      remedy.className = 'requirement-remedy';
      remedy.textContent = requirement.remedy;
      body.appendChild(remedy);

      if (requirement.requiresRestart) {
        const restart = document.createElement('div');
        restart.className = 'requirement-restart';
        restart.textContent = 'Reload the window afterwards for the change to take effect.';
        body.appendChild(restart);
      }

      if (requirement.action) {
        const button = document.createElement('button');
        button.className = 'requirement-action';
        button.textContent = actionLabel(requirement.action);
        button.addEventListener('click', () => {
          vscode.postMessage({
            command: 'runRequirementAction',
            action: requirement.action,
          });
        });
        body.appendChild(button);
      }
    }

    row.appendChild(body);
    return row;
  }

  function actionLabel(action) {
    if (action === 'openFolder') {
      return 'Open Folder...';
    }
    if (action === 'createTsconfig') {
      return 'Create tsconfig.json';
    }
    if (action === 'reload') {
      return 'Reload Window';
    }
    return 'Fix';
  }
})();
