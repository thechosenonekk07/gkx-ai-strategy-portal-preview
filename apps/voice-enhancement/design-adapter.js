/* Presentation and keyboard lifecycle for the voice workspace. */
(() => {
  const app = document.querySelector('.shell');
  const content = document.getElementById('page');
  const menu = document.getElementById('navigation');
  const mask = document.getElementById('modalMask');
  const dialog = document.getElementById('modal');
  const mobile = matchMedia('(max-width: 767px)');
  const fileActions = {
    audioFile: 'uploadAudio',
    ruleFile: 'importRules',
    customTemplate: 'uploadTemplate',
  };
  const collapsed = new Map();
  let lastTrigger = null;
  let modalWasOpen = false;
  let modalReturn = null;

  const breadcrumbBar = document.querySelector('.app-strip');
  const integrationContext = breadcrumbBar.querySelector('.integration-context');
  integrationContext.classList.add('gkx-filter-form');
  let historyExportDraft = null;
  const moduleName = breadcrumbBar.querySelector('strong').textContent;
  const breadcrumb = document.createElement('nav');
  breadcrumb.className = 'workbench-breadcrumb';
  breadcrumb.setAttribute('aria-label', '面包屑');
  breadcrumb.innerHTML = '<ol><li class="breadcrumb-module"></li><li aria-current="page"></li></ol>';
  breadcrumb.querySelector('.breadcrumb-module').textContent = moduleName;
  breadcrumbBar.querySelector('strong').remove();
  breadcrumbBar.prepend(breadcrumb);
  breadcrumbBar.classList.add('workbench-breadcrumb-bar');
  document.querySelector('.main').prepend(breadcrumbBar);
  app.classList.add('has-breadcrumb-layout');

  function syncPageChrome() {
    breadcrumb.querySelector('[aria-current="page"]').textContent = content.querySelector('h1')?.textContent || '';
  }
  function captureHistoryExportDraft() {
    const panel = content.querySelector('#exportFormats');
    if (!panel) return;
    historyExportDraft = {
      filename: panel.querySelector('#filenameRule').value,
      choices: [...panel.querySelectorAll('input[type="checkbox"]')]
        .map(input => [input.getAttribute('aria-label'), input.checked]),
    };
  }
  function restoreHistoryExportDraft() {
    const panel = content.querySelector('#exportFormats');
    if (!panel || !historyExportDraft) return;
    panel.querySelector('#filenameRule').value = historyExportDraft.filename;
    const choices = new Map(historyExportDraft.choices);
    panel.querySelectorAll('input[type="checkbox"]').forEach(input => {
      const key = input.getAttribute('aria-label');
      if (choices.has(key)) input.checked = choices.get(key);
    });
  }
  const baseRenderPage = renderPage;
  renderPage = function (...args) {
    const focused = document.activeElement;
    const focusKey = currentView === 'history' && content.contains(focused)
      ? ['id', 'data-version', 'data-action', 'aria-label'].find(key => focused.hasAttribute(key)) : null;
    const focusValue = focusKey ? focused.getAttribute(focusKey) : null;
    const selection = focusKey && typeof focused.selectionStart === 'number'
      ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
    captureHistoryExportDraft();
    // Keep the original host fields in the document while renderPage reads them.
    breadcrumbBar.append(integrationContext);
    const result = baseRenderPage(...args);
    content.prepend(integrationContext);
    restoreHistoryExportDraft();
    syncPageChrome();
    if (focusKey && (document.activeElement === document.body || document.activeElement === focused)) {
      const replacement = [...content.querySelectorAll(focused.localName)]
        .find(element => element.getAttribute(focusKey) === focusValue);
      replacement?.focus({ preventScroll: true });
      if (replacement && selection) replacement.setSelectionRange(...selection);
    }
    return result;
  };
  content.prepend(integrationContext);
  syncPageChrome();
  dialog.tabIndex = -1;

  document.addEventListener('click', event => {
    if (!dialog.contains(event.target)) lastTrigger = event.target.closest('button, input, select, textarea, a, [tabindex]');
  }, true);

  const targets = container => [...container.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex="0"]')]
    .filter(el => !el.disabled && !el.hidden && !el.closest('[inert]') && el.getClientRects().length);
  const restoreFocus = target => {
    const replacement = target?.id ? document.getElementById(target.id) : null;
    (target?.isConnected ? target : replacement || menu.querySelector('[aria-current="page"]') || content.querySelector('h1'))?.focus({ preventScroll: true });
  };

  function syncLayers() {
    const modalOpen = mask.classList.contains('open');
    app.inert = modalOpen;
    dialog.inert = !modalOpen;
    dialog.setAttribute('aria-hidden', String(!modalOpen));
    mask.setAttribute('aria-hidden', String(!modalOpen));
    if (modalOpen) dialog.setAttribute('aria-modal', 'true');
    else dialog.removeAttribute('aria-modal');

    if (modalOpen && !modalWasOpen) {
      modalReturn = lastTrigger || document.activeElement;
      const initial = dialog.querySelector('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)')
        || dialog.querySelector('.modal-close') || dialog;
      initial.focus({ preventScroll: true });
    } else if (!modalOpen && modalWasOpen) {
      restoreFocus(modalReturn);
      modalReturn = null;
    }
    modalWasOpen = modalOpen;
  }
  new MutationObserver(syncLayers).observe(mask, { attributes: true, attributeFilter: ['class'] });
  syncLayers();

  document.addEventListener('keydown', event => {
    // Native confirmation dialogs provide their own focus handling.
    if (document.querySelector('.confirm-dialog[open]')) return;
    if (event.key === 'Escape' && document.querySelector('.gkx-select-trigger[aria-expanded="true"]')) return;
    const activeLayer = modalWasOpen ? dialog : null;
    if (event.key === 'Escape') {
      if (modalWasOpen) { event.preventDefault(); event.stopPropagation(); closeModal(); }
      else if (mobile.matches) closeMobileMenus();
    }
    if (event.key === 'Tab' && activeLayer) {
      const list = targets(activeLayer);
      const first = list[0] || activeLayer;
      const last = list.at(-1) || activeLayer;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === activeLayer)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === activeLayer)) {
        event.preventDefault(); first.focus();
      }
    }
  }, true);

  function decorateNav() {
    menu.querySelectorAll('.group').forEach((group, index) => {
      const trigger = group.querySelector('.group-name');
      const items = group.querySelector('.group-items');
      items.id = `voice-function-group-${index}`;
      trigger.dataset.groupIndex = index;
      trigger.setAttribute('aria-controls', items.id);
      group.querySelector('.group-icon')?.setAttribute('aria-hidden', 'true');
      items.hidden = mobile.matches || !!collapsed.get(index);
      trigger.setAttribute('aria-expanded', String(!items.hidden));
    });
  }
  function closeMobileMenus() {
    menu.querySelectorAll('.group-name').forEach(trigger => {
      trigger.nextElementSibling.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    });
  }
  const baseRenderNav = renderNav;
  renderNav = function () { baseRenderNav(); decorateNav(); };
  decorateNav();
  menu.addEventListener('click', event => {
    const trigger = event.target.closest('.group-name');
    if (trigger) {
      if (mobile.matches) menu.querySelectorAll('.group-name').forEach(other => {
        if (other !== trigger) { other.nextElementSibling.hidden = true; other.setAttribute('aria-expanded', 'false'); }
      });
      else collapsed.set(Number(trigger.dataset.groupIndex), trigger.nextElementSibling.hidden);
    }
    const route = event.target.closest('[data-page]');
    if (route) {
      if (mobile.matches) { closeMobileMenus(); menu.querySelector(`[aria-controls="voice-function-group-${route.closest('.group').querySelector('.group-name').dataset.groupIndex}"]`)?.focus({ preventScroll: true }); }
      else menu.querySelector(`[data-page="${route.dataset.page}"]`)?.focus({ preventScroll: true });
    }
  });
  document.addEventListener('click', event => { if (mobile.matches && !event.target.closest('.sidebar')) closeMobileMenus(); });
  mobile.addEventListener('change', decorateNav);

  function highlightSelection() {
    content.querySelectorAll('.para').forEach((paragraph, index) => {
      const selected = index === selectedPara;
      paragraph.classList.toggle('selected', selected);
      const label = paragraph.querySelector('.review-label');
      if (label) label.textContent = selected ? '当前编辑段' : '已识别';
    });
    const part = transcriptionParts[selectedPara];
    const context = content.querySelector('#editorSelectionContext');
    if (context) context.textContent = part
      ? `当前编辑：第 ${selectedPara + 1} / ${transcriptionParts.length} 段 · ${part.speaker || '未命名说话人'}${part.time ? ` · ${part.time}` : ''}`
      : '暂无可编辑段落';
    const merge = content.querySelector('[data-action="mergePara"]');
    const split = content.querySelector('[data-action="splitPara"]');
    const clean = content.querySelector('[data-action="cleanFillers"]');
    if (merge) merge.disabled = !part || selectedPara <= 0;
    if (split) split.disabled = !part;
    if (clean) clean.disabled = !transcriptionParts.length;
  }
  const baseRenderEditorData = renderEditorData;
  renderEditorData = function (...args) {
    const result = baseRenderEditorData(...args);
    highlightSelection();
    return result;
  };
  function updateFileFeedback(input) {
    const feedback = content.querySelector(`[data-file-feedback="${input.id}"]`);
    if (!feedback) return;
    const filename = input.files?.[0]?.name;
    if (!filename) {
      if (feedback.childNodes.length) feedback.replaceChildren();
      delete feedback.dataset.filename;
      feedback.hidden = true;
      return;
    }
    if (!feedback.hidden && feedback.dataset.filename === filename) return;
    const name = document.createElement('span');
    name.className = 'gkx-file-name';
    name.setAttribute('role', 'status');
    name.textContent = `已选择：${filename}`;
    name.title = filename;
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'link gkx-file-clear';
    clear.dataset.fileClear = input.id;
    clear.setAttribute('aria-label', `清除已选文件：${filename}`);
    clear.textContent = '清除';
    feedback.replaceChildren(name, clear);
    feedback.dataset.filename = filename;
    feedback.hidden = false;
  }
  function syncFileFeedback() {
    for (const id of Object.keys(fileActions)) {
      const input = document.getElementById(id);
      if (input) updateFileFeedback(input);
    }
  }
  function polishPage() {
    syncPageChrome();
    syncFileFeedback();
    const heading = content.querySelector('h1');
    if (heading) heading.tabIndex = -1;
    content.querySelectorAll('input[type="range"]').forEach(range => {
      const update = () => range.style.setProperty('--range-progress', `${(Number(range.value) - Number(range.min || 0)) / (Number(range.max || 100) - Number(range.min || 0)) * 100}%`);
      update();
      if (!range.dataset.designRange) {
        range.dataset.designRange = 'true';
        range.addEventListener('input', update);
        range.addEventListener('change', update);
      }
    });
    content.querySelectorAll('.version-item').forEach(item => {
      item.setAttribute('role', 'button');
      item.setAttribute('aria-pressed', String(item.classList.contains('active')));
    });
    content.querySelectorAll('#recordStatus').forEach(status => { status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); });
    highlightSelection();
  }
  polishPage();
  new MutationObserver(polishPage).observe(content, { childList: true });
  content.addEventListener('click', event => {
    const clear = event.target.closest('[data-file-clear]');
    if (clear) {
      const input = document.getElementById(clear.dataset.fileClear);
      if (input) {
        input.value = '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        content.querySelector(`[data-action="${fileActions[input.id]}"]`)?.focus({ preventScroll: true });
      }
      return;
    }
    if (event.target.closest('.para')) highlightSelection();
    if (event.target.closest('[data-action="locateAudio"]')) polishPage();
  });
  content.addEventListener('keydown', event => {
    const version = event.target.closest('.version-item');
    if (version && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); version.click(); }
  });
  content.addEventListener('input', event => {
    if (['sessionHotwordInput', 'vocabHotword', 'lexiconInput', 'findText'].includes(event.target.id)) {
      window.GKXControls?.clearInvalid(event.target);
    }
    if (event.target.matches('[contenteditable][data-text-index]')) highlightSelection();
  });
  content.addEventListener('change', event => {
    if (Object.hasOwn(fileActions, event.target.id)) updateFileFeedback(event.target);
    if (event.target.id === 'audioPosition') highlightSelection();
    if (event.target.id === 'regexToggle') {
      const field = document.getElementById('findText');
      if (field) window.GKXControls?.clearInvalid(field);
    }
    if (event.target.id === 'templateSelect' && event.target.value) scheduleAutoSave();
  });
  dialog.addEventListener('input', event => {
    if (event.target.id === 'ruleContent' || event.target.id === 'speakerName') {
      window.GKXControls?.clearInvalid(event.target);
    }
  });
  const baseHandleAction = handleAction;
  handleAction = async function (button) {
    const before = transcriptionParts.map(part => part.text).join('\n');
    await baseHandleAction(button);
    const after = transcriptionParts.map(part => part.text).join('\n');
    if (before !== after && button.dataset.action !== 'restoreVersion') scheduleAutoSave();
    polishPage();
  };

  const confirmation = document.createElement('dialog');
  confirmation.className = 'modal confirm-dialog';
  confirmation.setAttribute('aria-labelledby', 'versionConfirmTitle');
  confirmation.setAttribute('aria-describedby', 'versionConfirmMessage');
  confirmation.innerHTML = '<form method="dialog"><header class="modal-head"><h2 id="versionConfirmTitle">恢复历史版本</h2><button class="modal-close" value="cancel" aria-label="关闭确认框">×</button></header><div class="modal-body"><p id="versionConfirmMessage"></p><p class="subtle">恢复前将保留当前稿件快照；所选版本将替换当前内容。</p></div><footer class="modal-foot"><button class="btn" value="cancel" autofocus>取消</button><button class="btn primary" value="confirm">确认恢复</button></footer></form>';
  document.body.append(confirmation);
  function closeConfirmation(value = 'cancel') {
    if (window.GKXSurface?.closeDialog) return window.GKXSurface.closeDialog(confirmation, value);
    confirmation.close(value);
  }
  confirmation.addEventListener('submit', event => {
    event.preventDefault();
    closeConfirmation(event.submitter?.value || 'cancel');
  });
  confirmation.addEventListener('cancel', event => { event.preventDefault(); closeConfirmation('cancel'); });
  confirmation.addEventListener('click', event => { if (event.target === confirmation) closeConfirmation('cancel'); });
  window.confirmAction = (message, options = {}) => new Promise(resolve => {
    confirmation.querySelector('#versionConfirmTitle').textContent = options.title || '恢复历史版本';
    confirmation.querySelector('#versionConfirmMessage').textContent = message;
    const description = confirmation.querySelector('.modal-body .subtle');
    description.textContent = options.description ?? '恢复前将保留当前稿件快照；所选版本将替换当前内容。';
    description.hidden = !description.textContent;
    const action = confirmation.querySelector('button[value="confirm"]');
    action.textContent = options.confirmLabel || '确认恢复';
    action.classList.toggle('danger', options.tone === 'danger');
    action.classList.toggle('primary', options.tone !== 'danger');
    confirmation.returnValue = 'cancel';
    confirmation.addEventListener('close', () => resolve(confirmation.returnValue === 'confirm'), { once: true });
    confirmation.showModal();
  });
})();
