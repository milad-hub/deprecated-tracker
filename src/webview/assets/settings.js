(function () {
  const vscode = acquireVsCodeApi();

  const selectors = {
    tableBody: document.getElementById('tagsTableBody'),
    filterInput: document.getElementById('filterInput'),
    emptyState: document.getElementById('emptyState'),
    tagCount: document.getElementById('tagCount'),
    addTagBtn: document.getElementById('addTagBtn'),
    modal: document.getElementById('tagModal'),
    modalTitle: document.getElementById('modalTitle'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    cancelModalBtn: document.getElementById('cancelModalBtn'),
    tagForm: document.getElementById('tagForm'),
    tagId: document.getElementById('tagId'),
    tagInput: document.getElementById('tagInput'),
    labelInput: document.getElementById('labelInput'),
    descriptionInput: document.getElementById('descriptionInput'),
    colorInput: document.getElementById('colorInput'),
    enabledInput: document.getElementById('enabledInput'),
    scopeStaged: document.getElementById('scopeStaged'),
    scopeUnstaged: document.getElementById('scopeUnstaged'),
    scopeError: document.getElementById('scopeError'),
    granularityFiles: document.getElementById('granularityFiles'),
    granularityLines: document.getElementById('granularityLines'),
  };

  let state = {
    tags: [],
    filter: '',
  };
  let pendingSubmit = false;

  selectors.filterInput?.addEventListener('input', (event) => {
    state.filter = event.target.value.trim().toLowerCase();
    renderTable();
  });

  selectors.addTagBtn?.addEventListener('click', () => openModal());
  selectors.closeModalBtn?.addEventListener('click', closeModal);
  selectors.cancelModalBtn?.addEventListener('click', closeModal);

  selectors.tagForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const payload = {
      id: selectors.tagId?.value || undefined,
      tag: selectors.tagInput?.value.trim(),
      label: selectors.labelInput?.value.trim(),
      description: selectors.descriptionInput?.value.trim(),
      color: selectors.colorInput?.value,
      enabled: selectors.enabledInput?.checked ?? true,
    };

    if (!payload.tag?.startsWith('@')) {
      selectors.tagInput.setCustomValidity('Tag must start with @ (example: @legacy)');
      selectors.tagInput.reportValidity();
      selectors.tagInput.focus();
      return;
    }
    selectors.tagInput.setCustomValidity(''); // Clear previous validation

    if (!payload.label) {
      selectors.labelInput.setCustomValidity('Label is required');
      selectors.labelInput.reportValidity();
      selectors.labelInput.focus();
      return;
    }
    selectors.labelInput.setCustomValidity(''); // Clear previous validation

    // The modal stays open until the extension confirms; a rejected tag
    // (duplicate, reserved name, bad colour) would otherwise discard what the
    // user typed behind an error toast.
    pendingSubmit = true;
    if (payload.id) {
      vscode.postMessage({ command: 'updateCustomTag', payload });
    } else {
      vscode.postMessage({ command: 'addCustomTag', payload });
    }
  });

  [selectors.scopeStaged, selectors.scopeUnstaged].forEach((checkbox) => {
    checkbox?.addEventListener('change', () => {
      vscode.postMessage({
        command: 'updateScanChangesScope',
        payload: {
          staged: Boolean(selectors.scopeStaged?.checked),
          unstaged: Boolean(selectors.scopeUnstaged?.checked),
        },
      });
    });
  });

  [selectors.granularityFiles, selectors.granularityLines].forEach((radio) => {
    radio?.addEventListener('change', () => {
      if (!radio.checked) {
        return;
      }
      vscode.postMessage({
        command: 'updateScanChangesScope',
        payload: { granularity: radio.value },
      });
    });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.command === 'customTagsData') {
      state.tags = Array.isArray(message.tags) ? message.tags : [];
      renderTable();
      if (pendingSubmit) {
        pendingSubmit = false;
        closeModal();
      }
    }
    if (message.command === 'scanChangesScopeData') {
      renderScanChangesScope(message.scope, message.error);
    }
  });

  // Always redrawn from what the extension stored, so a rejected change (both
  // sides unchecked) snaps the checkbox back instead of lying about the state.
  function renderScanChangesScope(scope, error) {
    if (!scope) {
      return;
    }
    if (selectors.scopeStaged) {
      selectors.scopeStaged.checked = Boolean(scope.staged);
    }
    if (selectors.scopeUnstaged) {
      selectors.scopeUnstaged.checked = Boolean(scope.unstaged);
    }
    if (selectors.granularityFiles) {
      selectors.granularityFiles.checked = scope.granularity !== 'lines';
    }
    if (selectors.granularityLines) {
      selectors.granularityLines.checked = scope.granularity === 'lines';
    }
    if (selectors.scopeError) {
      selectors.scopeError.textContent = error || '';
      selectors.scopeError.classList.toggle('hidden', !error);
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !selectors.modal?.classList.contains('hidden')) {
      closeModal();
    }
  });

  requestTags();

  function requestTags() {
    vscode.postMessage({ command: 'getCustomTags' });
    vscode.postMessage({ command: 'getScanChangesScope' });
  }

  function renderTable() {
    if (!selectors.tableBody) {
      return;
    }

    const filtered = state.tags.filter((tag) => {
      if (!state.filter) {
        return true;
      }
      const needle = state.filter;
      return (
        tag.tag.toLowerCase().includes(needle) ||
        tag.label.toLowerCase().includes(needle) ||
        (tag.description || '').toLowerCase().includes(needle)
      );
    });

    selectors.tableBody.innerHTML = '';
    if (selectors.tagCount) {
      selectors.tagCount.textContent = `${filtered.length} tag${filtered.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
      selectors.emptyState?.classList.remove('hidden');
      return;
    }

    selectors.emptyState?.classList.add('hidden');

    filtered.forEach((tag) => {
      const row = document.createElement('tr');

      const checkboxCell = document.createElement('td');
      checkboxCell.className = 'checkbox-cell';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = tag.enabled;
      checkbox.addEventListener('change', () => {
        vscode.postMessage({
          command: 'toggleCustomTag',
          payload: { id: tag.id },
        });
      });
      checkboxCell.appendChild(checkbox);

      const tagCell = document.createElement('td');
      tagCell.textContent = tag.tag;

      const labelCell = document.createElement('td');
      labelCell.textContent = tag.label;

      const descriptionCell = document.createElement('td');
      descriptionCell.textContent = tag.description || '—';

      const colorCell = document.createElement('td');
      const colorWrapper = document.createElement('div');
      colorWrapper.className = 'color-pill';
      const swatch = document.createElement('span');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = tag.color;
      colorWrapper.appendChild(swatch);
      const colorLabel = document.createElement('span');
      colorLabel.textContent = tag.color;
      colorWrapper.appendChild(colorLabel);
      colorCell.appendChild(colorWrapper);

      const actionsCell = document.createElement('td');
      actionsCell.className = 'actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openModal(tag));

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        vscode.postMessage({
          command: 'confirmDeleteCustomTag',
          payload: { id: tag.id, tagName: tag.tag },
        });
      });

      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(deleteBtn);

      row.appendChild(checkboxCell);
      row.appendChild(tagCell);
      row.appendChild(labelCell);
      row.appendChild(descriptionCell);
      row.appendChild(colorCell);
      row.appendChild(actionsCell);

      selectors.tableBody.appendChild(row);
    });
  }

  function openModal(tag) {
    if (!selectors.modal || !selectors.tagForm) {
      return;
    }

    selectors.tagForm.reset();
    if (selectors.modalTitle) {
      selectors.modalTitle.textContent = tag ? 'Edit Custom Tag' : 'Add Custom Tag';
    }

    selectors.tagId.value = tag?.id || '';
    selectors.tagInput.value = tag?.tag || '';
    selectors.labelInput.value = tag?.label || '';
    selectors.descriptionInput.value = tag?.description || '';
    selectors.colorInput.value = tag?.color || '#4ecdc4';
    selectors.enabledInput.checked = tag?.enabled ?? true;

    selectors.modal.classList.remove('hidden');
    selectors.modal.setAttribute('aria-hidden', 'false');
    selectors.tagInput.focus();
  }

  function closeModal() {
    pendingSubmit = false;
    selectors.modal?.classList.add('hidden');
    selectors.modal?.setAttribute('aria-hidden', 'true');
  }
})();
