const ICON_PATHS = {
    continue: '<path d="M12 4v12m0 0 4-4m-4 4-4-4"/>',
    expand: '<path d="M6 4v4a4 4 0 0 0 4 4h8m0 0-3-3m3 3-3 3"/>',
    summarize: '<path d="M4 6h16M4 10h12M4 14h8m4 0h4m0 0-2-2m2 2-2 2"/>',
    breakdown: '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M12 7v4m0 0H6v5m6-5h6v5"/>',
    custom: '<path d="m12 3 1.1 3.2L16 7.5l-2.9 1.3L12 12l-1.1-3.2L8 7.5l2.9-1.3L12 3Z"/><path d="m18.5 13 .7 2.1 1.8.9-1.8.9-.7 2.1-.7-2.1L16 16l1.8-.9.7-2.1Z"/>',
    document: '<path d="M6 3h9l3 3v15H6zM15 3v4h3M9 10h6M9 14h6M9 18h4"/>',
    option: '<path d="M7 4h10v16l-5-3-5 3z"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    delete: '<path d="M5 7h14M9 7V4h6v3m2 0-1 13H8L7 7m3 4v5m4-5v5"/>',
    export: '<path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14"/>'
};

function iconMarkup(name) {
    return `<svg class="icon icon-${name}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}

function getCardDisplayName(card, maxLength) {
    const full = card.name || `#${card.id.slice(-4)}`;
    return {
        full,
        visible: full.length > maxLength ? `${full.substring(0, maxLength)}...` : full
    };
}

function getGroupPresentation(parentCard, maxNameLength, previewLength) {
    if (parentCard.name) {
        const visibleName = parentCard.name.length > maxNameLength
            ? `${parentCard.name.substring(0, maxNameLength)}...`
            : parentCard.name;
        return { text: `>> ${visibleName}`, title: `Children of ${parentCard.name}` };
    }

    const idPart = `#${parentCard.id.slice(-4)}`;
    const content = parentCard.content?.trim() || '';
    const preview = content.substring(0, previewLength);
    const visiblePreview = preview ? `: ${preview}${content.length > previewLength ? '...' : ''}` : '';
    return {
        text: `>> ${idPart}${visiblePreview}`,
        title: `Children of ${idPart}${content ? `: ${content}` : ''}`
    };
}

function getHistorySelection(options, selectedOptionId) {
    if (!options.length) return null;
    return options.find(option => option.id === selectedOptionId) || options[0];
}

function getAdjacentOptionId(options, selectedOptionId, direction) {
    const selected = getHistorySelection(options, selectedOptionId);
    if (!selected) return null;
    const index = options.findIndex(option => option.id === selected.id);
    const targetIndex = direction === 'newer'
        ? Math.max(0, index - 1)
        : Math.min(options.length - 1, index + 1);
    return options[targetIndex]?.id || selected.id;
}

function getHierarchyDepth(card, getCard) {
    let depth = 0;
    let current = card;
    const visited = new Set();
    while (current?.parentId && !visited.has(current.parentId)) {
        visited.add(current.parentId);
        depth += 1;
        current = getCard(current.parentId);
    }
    return depth;
}

function createEditorView({
    columnsContainer,
    projectListContainer,
    addProjectButton,
    importProjectButton,
    aiSettingsContainer,
    aiJobStatus,
    model,
    actions,
    dom,
    isAiReady,
    cardNameMaxLength = 50,
    groupHeaderPreviewLength = 60
}) {
    let mode = 'map';
    let documentOwnerCardId = null;
    let focusedDocumentCardId = null;
    let selectedOptionId = null;

    function createCardElement(cardData, { documentMode = false } = {}) {
        const cardElement = document.createElement('div');
        cardElement.id = `card-${cardData.id}`;
        cardElement.className = documentMode ? 'card document-card' : 'card';
        cardElement.dataset.cardId = cardData.id;
        if (!documentMode) {
            const cardColor = model.getColorForCard(cardData);
            cardElement.style.backgroundColor = cardColor;
        }

        const aiReady = isAiReady();
        cardElement.innerHTML = `
            <div class="card-header" draggable="${!documentMode}">
                ${documentMode ? '' : '<span class="card-name-display"></span>'}
                <div class="card-ai-actions ai-feature">
                    <button class="ai-continue-btn" title="Continue as next sibling" aria-label="Continue as next sibling" ${!aiReady ? 'disabled' : ''}>${iconMarkup('continue')}</button>
                    ${documentMode ? '' : `<button class="ai-expand-btn" title="Elaborate as child" aria-label="Elaborate as child" ${!aiReady ? 'disabled' : ''}>${iconMarkup('expand')}</button>`}
                    <button class="ai-summarize-btn" title="Create summary after card" aria-label="Create summary after card" ${!aiReady ? 'disabled' : ''}>${iconMarkup('summarize')}</button>
                    ${documentMode ? '' : `<button class="ai-breakdown-btn" title="Brainstorm as children" aria-label="Brainstorm as children" ${!aiReady ? 'disabled' : ''}>${iconMarkup('breakdown')}</button>`}
                    <button class="ai-custom-btn" title="Choose AI result target" aria-label="Choose AI result target" ${!aiReady ? 'disabled' : ''}>${iconMarkup('custom')}</button>
                </div>
                <div class="card-actions">
                    ${documentMode ? `<button class="save-card-option-btn" title="Save this Card as an Option" aria-label="Save this Card as an Option">${iconMarkup('option')}</button>` : ''}
                    ${documentMode ? '' : `<button class="open-document-btn" title="Open sibling document" aria-label="Open sibling document">${iconMarkup('document')}</button>`}
                    ${documentMode ? '' : `<button class="add-child-btn" title="Add child Card" aria-label="Add child Card">${iconMarkup('add')}</button>`}
                    ${documentMode ? '' : `<button class="delete-card-btn" title="Delete Card" aria-label="Delete Card">${iconMarkup('delete')}</button>`}
                </div>
            </div>
            <textarea class="card-content" placeholder="Enter text..."></textarea>
        `;

        const textarea = cardElement.querySelector('.card-content');
        textarea.value = cardData.content || '';
        const nameDisplay = cardElement.querySelector('.card-name-display');
        if (nameDisplay) {
            const displayName = getCardDisplayName(cardData, cardNameMaxLength);
            nameDisplay.textContent = displayName.visible;
            nameDisplay.title = displayName.full;
        }
        cardElement.querySelector('.card-name-display')?.addEventListener('dblclick', () => makeCardNameEditable(cardData.id, cardElement));
        textarea.addEventListener('blur', handleTextareaBlur);
        textarea.addEventListener('focus', handleTextareaFocus);
        textarea.addEventListener('input', dom.autoResizeTextarea);
        requestAnimationFrame(() => dom.autoResizeTextarea({ target: textarea }));

        cardElement.querySelector('.open-document-btn')?.addEventListener('click', event => {
            event.stopPropagation();
            openDocument(cardData.id);
        });
        cardElement.querySelector('.save-card-option-btn')?.addEventListener('click', event => {
            event.stopPropagation();
            const result = actions.saveOption(cardData.id);
            const status = columnsContainer.querySelector('.history-status');
            if (!result.success) {
                if (status) status.textContent = result.reason === 'persistence-failed'
                    ? 'The Option could not be saved because browser storage is unavailable or full.'
                    : 'The Option could not be saved.';
                return;
            }
            focusedDocumentCardId = cardData.id;
            selectedOptionId = result.option.id;
            renderHistoryPane();
        });
        cardElement.querySelector('.add-child-btn')?.addEventListener('click', event => {
            event.stopPropagation();
            actions.addChildCard(cardData.id);
        });
        cardElement.querySelector('.delete-card-btn')?.addEventListener('click', event => {
            event.stopPropagation();
            actions.deleteCard(cardData.id);
        });
        for (const [selector, action] of [
            ['.ai-continue-btn', actions.aiContinue],
            ['.ai-expand-btn', actions.aiExpand],
            ['.ai-summarize-btn', actions.aiSummarize],
            ['.ai-breakdown-btn', actions.aiBreakdown],
            ['.ai-custom-btn', actions.aiCustom]
        ]) {
            cardElement.querySelector(selector)?.addEventListener('click', event => {
                event.stopPropagation();
                action(cardData.id);
            });
        }
        return cardElement;
    }

    function createGroupElement(parentId) {
        const parentCard = model.getCard(parentId);
        if (!parentCard) return null;

        const presentation = getGroupPresentation(parentCard, cardNameMaxLength, groupHeaderPreviewLength);
        const groupElement = document.createElement('div');
        groupElement.id = `group-${parentId}`;
        groupElement.className = 'card-group';
        groupElement.dataset.parentId = parentId;
        groupElement.style.setProperty('--group-color', model.getColorForCard(parentCard));
        const header = document.createElement('div');
        header.className = 'group-header';
        header.textContent = presentation.text;
        header.title = presentation.title;
        groupElement.appendChild(header);
        groupElement.addEventListener('dblclick', event => {
            if (event.target.closest('textarea.card-content') || event.target.closest('.card')) return;
            event.stopPropagation();
            const columnIndex = Number.parseInt(groupElement.closest('.column')?.dataset.columnIndex, 10);
            if (!Number.isNaN(columnIndex)) actions.addCard(columnIndex, parentId);
        });
        return groupElement;
    }

    function createColumnElement(columnIndex) {
        const columnElement = document.createElement('div');
        columnElement.className = 'column';
        columnElement.dataset.columnIndex = columnIndex;
        const aiReady = isAiReady();
        const hasPrompt = Boolean(model.getColumnData(columnIndex)?.prompt);
        const hasGlobalPrompt = Boolean(model.getGlobalPromptData());
        const globalPromptButton = columnIndex === 0
            ? `<button class="global-prompt-btn ai-feature${hasGlobalPrompt ? ' has-prompt' : ''}" title="Set Global Prompt" ${!aiReady ? 'disabled' : ''}>Global Prompt</button>`
            : '';

        columnElement.innerHTML = `
            <div class="column-toolbar">
                <div class="toolbar-left">
                    <button class="add-card-btn">Add Card</button>
                    ${globalPromptButton}
                    <button class="add-prompt-btn ai-feature${hasPrompt ? ' has-prompt' : ''}" title="Set Column Prompt" ${!aiReady ? 'disabled' : ''}>Prompt</button>
                </div>
                <div class="toolbar-right">
                    <button class="add-column-btn">Add Column</button>
                    <button class="delete-column-btn">Delete Column</button>
                </div>
            </div>
            <div class="cards-container"></div>
        `;

        const cardsContainer = columnElement.querySelector('.cards-container');
        columnElement.querySelector('.add-card-btn').addEventListener('click', () => actions.addCard(columnIndex, null));
        columnElement.querySelector('.add-column-btn').addEventListener('click', actions.addColumn);
        columnElement.querySelector('.delete-column-btn').addEventListener('click', () => actions.deleteColumn(columnIndex));
        columnElement.querySelector('.add-prompt-btn').addEventListener('click', () => actions.setColumnPrompt(columnIndex));
        columnElement.querySelector('.global-prompt-btn')?.addEventListener('click', actions.setGlobalPrompt);
        cardsContainer.addEventListener('dblclick', event => {
            if (!event.target.closest('textarea.card-content') && event.target === cardsContainer && columnIndex === 0) {
                actions.addCard(columnIndex, null);
            }
        });
        return columnElement;
    }

    function renderColumnContent(columnElement, columnIndex) {
        const cardsContainer = columnElement.querySelector('.cards-container');
        if (!cardsContainer) return;
        cardsContainer.innerHTML = '';

        if (columnIndex === 0) {
            model.getColumnCards(0).filter(card => !card.parentId).forEach(card => {
                cardsContainer.appendChild(createCardElement(card));
            });
        } else {
            model.getColumnCards(columnIndex - 1).forEach(parentCard => {
                const groupElement = createGroupElement(parentCard.id);
                if (!groupElement) return;
                model.getChildCards(parentCard.id, columnIndex).forEach(card => {
                    groupElement.appendChild(createCardElement(card));
                });
                cardsContainer.appendChild(groupElement);
            });
        }
        updateToolbarButtons(columnElement, columnIndex);
    }

    function renderOptionPreview(container, option) {
        container.innerHTML = '';
        const snapshotCard = option.snapshot.cards.find(card => card.id === option.cardId);
        if (!snapshotCard) return;
        const preview = document.createElement('article');
        preview.className = 'history-card';
        if (snapshotCard.name) {
            const title = document.createElement('div');
            title.className = 'history-card-name';
            title.textContent = snapshotCard.name;
            preview.appendChild(title);
        }
        const content = document.createElement('div');
        content.className = 'history-card-content';
        content.textContent = snapshotCard.content || '';
        preview.appendChild(content);
        container.appendChild(preview);
    }

    function renderHistoryPane() {
        const pane = columnsContainer.querySelector('.document-history');
        if (!pane || !focusedDocumentCardId) return;
        const options = model.getOptionsForCard(focusedDocumentCardId);
        const selected = getHistorySelection(options, selectedOptionId);
        selectedOptionId = selected?.id || null;

        pane.innerHTML = `
            <div class="document-pane-heading">
                <div>
                    <span class="eyebrow">History</span>
                    <h2>Card options</h2>
                </div>
                <span class="option-count">${options.length}</span>
            </div>
            <div class="history-controls" aria-label="History option controls">
                <button class="history-newer-btn" ${!selected || options[0]?.id === selected.id ? 'disabled' : ''}>← Newer</button>
                <span class="history-position">${selected ? `${options.findIndex(option => option.id === selected.id) + 1} / ${options.length}` : 'No options'}</span>
                <button class="history-older-btn" ${!selected || options.at(-1)?.id === selected.id ? 'disabled' : ''}>Older →</button>
            </div>
            <div class="history-meta"></div>
            <div class="history-preview" aria-live="polite"></div>
            <div class="history-actions">
                <button class="use-option-btn" ${!selected ? 'disabled' : ''}>Use as current</button>
                <button class="delete-option-btn" ${options.length <= 1 ? 'disabled' : ''}>Delete option</button>
            </div>
            <p class="history-status" role="status"></p>
        `;

        const preview = pane.querySelector('.history-preview');
        const meta = pane.querySelector('.history-meta');
        const status = pane.querySelector('.history-status');
        if (selected) {
            const timestamp = new Date(selected.createdAt);
            meta.textContent = `${selected.source} · ${Number.isNaN(timestamp.getTime()) ? 'Unknown time' : timestamp.toLocaleString()}`;
            renderOptionPreview(preview, selected);
            const availability = model.getOptionUseAvailability(selected.id);
            const useButton = pane.querySelector('.use-option-btn');
            useButton.disabled = !availability.available;
            if (!availability.available) {
                status.textContent = 'This Option no longer contains its owner Card.';
            }
        } else {
            preview.innerHTML = '<p class="empty-history">No Options yet. Save this Card to create the first one.</p>';
        }

        const select = direction => {
            selectedOptionId = getAdjacentOptionId(options, selectedOptionId, direction);
            renderHistoryPane();
            columnsContainer.querySelector('.document-history')?.focus();
        };
        pane.querySelector('.history-newer-btn').addEventListener('click', () => select('newer'));
        pane.querySelector('.history-older-btn').addEventListener('click', () => select('older'));
        pane.querySelector('.use-option-btn').addEventListener('click', () => {
            const result = actions.useOption(selectedOptionId);
            if (!result.success) {
                status.textContent = result.reason === 'persistence-failed'
                    ? 'Current could not be replaced because browser storage rejected the change.'
                    : 'This Option cannot be used for the current Card.';
                return;
            }
            selectedOptionId = selected.id;
            renderDocument();
        });
        pane.querySelector('.delete-option-btn').addEventListener('click', () => {
            const result = actions.deleteOption(selectedOptionId);
            if (!result.success) {
                status.textContent = result.reason === 'final-option'
                    ? 'The final Option cannot be deleted.'
                    : 'The Option could not be deleted.';
                return;
            }
            selectedOptionId = result.selectedOptionId;
            renderHistoryPane();
        });
    }

    function renderDocument() {
        const previousScrollPositions = [
            ['.document-current', columnsContainer.querySelector('.document-current')?.scrollTop],
            ['.document-workspace', columnsContainer.querySelector('.document-workspace')?.scrollTop]
        ];
        const owner = model.getCard(documentOwnerCardId);
        if (!owner) {
            mode = 'map';
            documentOwnerCardId = null;
            selectedOptionId = null;
            renderApp();
            return;
        }

        const siblings = model.getSiblingCards(owner.id);
        if (!siblings.some(card => card.id === focusedDocumentCardId)) focusedDocumentCardId = owner.id;
        columnsContainer.classList.add('document-mode');
        document.body.classList.add('document-mode');
        columnsContainer.innerHTML = `
            <section class="document-view">
                <header class="document-toolbar">
                    <button class="back-to-map-btn">← Map</button>
                    <div class="document-toolbar-actions">
                        <button class="add-sibling-btn">Add sibling</button>
                    </div>
                </header>
                <div class="document-workspace">
                    <main class="document-current" aria-label="Editable current document">
                        <div class="document-cards"></div>
                    </main>
                    <aside class="document-history" aria-label="Read-only history options" tabindex="0"></aside>
                </div>
            </section>
        `;

        columnsContainer.querySelector('.document-view').dataset.ownerCardId = owner.id;
        const cardsContainer = columnsContainer.querySelector('.document-cards');
        siblings.forEach(card => cardsContainer.appendChild(createCardElement(card, { documentMode: true })));
        if (previousScrollPositions.some(([, scrollTop]) => Number.isFinite(scrollTop))) {
            requestAnimationFrame(() => {
                for (const [selector, scrollTop] of previousScrollPositions) {
                    if (Number.isFinite(scrollTop)) {
                        columnsContainer.querySelector(selector).scrollTop = scrollTop;
                    }
                }
            });
        }
        renderHistoryPane();

        columnsContainer.querySelector('.back-to-map-btn').addEventListener('click', closeDocument);
        columnsContainer.querySelector('.add-sibling-btn').addEventListener('click', () => {
            const result = actions.addDocumentSibling(documentOwnerCardId, focusedDocumentCardId);
            if (!result.success) return;
            focusedDocumentCardId = result.cardId;
            renderDocument();
            requestAnimationFrame(() => dom.focusCardTextarea(result.cardId, 'start'));
        });
        columnsContainer.querySelector('.document-history').addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const options = model.getOptionsForCard(focusedDocumentCardId);
            selectedOptionId = getAdjacentOptionId(
                options,
                selectedOptionId,
                event.key === 'ArrowLeft' ? 'newer' : 'older'
            );
            renderHistoryPane();
            columnsContainer.querySelector('.document-history')?.focus();
        });
    }

    function openDocument(cardId, focusPosition = 'start') {
        if (!model.getCard(cardId)) return false;
        mode = 'document';
        documentOwnerCardId = cardId;
        focusedDocumentCardId = cardId;
        selectedOptionId = model.getOptionsForCard(cardId)[0]?.id || null;
        renderDocument();
        requestAnimationFrame(() => dom.focusCardTextarea(cardId, focusPosition));
        return true;
    }

    function closeDocument() {
        const returnCardId = documentOwnerCardId;
        mode = 'map';
        documentOwnerCardId = null;
        focusedDocumentCardId = null;
        selectedOptionId = null;
        document.body.classList.remove('document-mode');
        columnsContainer.classList.remove('document-mode');
        renderApp();
        if (returnCardId) requestAnimationFrame(() => dom.focusCardTextarea(returnCardId, 'preserve'));
    }

    function renderApp() {
        if (mode === 'document') {
            renderDocument();
            return;
        }
        document.body.classList.remove('document-mode');
        columnsContainer.classList.remove('document-mode');
        columnsContainer.innerHTML = '';
        const project = model.getActiveProjectData();
        if (!project) {
            columnsContainer.innerHTML = '<p class="empty-project-message">Error: No project selected or data corrupted.</p>';
            return;
        }

        const columnCount = Math.max(model.minColumns, project.columns.length);
        for (let index = 0; index < columnCount; index++) {
            const columnElement = createColumnElement(index);
            columnsContainer.appendChild(columnElement);
            if (index < project.columns.length) renderColumnContent(columnElement, index);
            else updateToolbarButtons(columnElement, index);
        }
        updateAllToolbarButtons();
    }

    function updateToolbarButtons(columnElement, columnIndex) {
        const project = model.getActiveProjectData();
        if (!project) return;

        const columnCount = project.columns.length;
        const isRightmost = columnIndex === columnCount - 1;
        const addCardButton = columnElement.querySelector('.add-card-btn');
        const addColumnButton = columnElement.querySelector('.add-column-btn');
        const deleteColumnButton = columnElement.querySelector('.delete-column-btn');
        const promptButton = columnElement.querySelector('.add-prompt-btn');
        const globalPromptButton = columnElement.querySelector('.global-prompt-btn');

        addCardButton.classList.toggle('hidden', columnIndex !== 0);
        addColumnButton.classList.toggle('hidden', !isRightmost);
        const canDelete = isRightmost && columnCount > model.minColumns && model.getColumnCards(columnIndex).length === 0;
        deleteColumnButton.classList.toggle('hidden', !canDelete);
        deleteColumnButton.disabled = !canDelete;

        if (promptButton) {
            promptButton.textContent = 'Prompt';
            promptButton.classList.toggle('has-prompt', Boolean(model.getColumnData(columnIndex)?.prompt));
            promptButton.disabled = !isAiReady();
        }
        if (globalPromptButton) {
            globalPromptButton.textContent = 'Global Prompt';
            globalPromptButton.classList.toggle('has-prompt', Boolean(model.getGlobalPromptData()));
            globalPromptButton.disabled = !isAiReady();
        }
    }

    function updateAllToolbarButtons() {
        Array.from(columnsContainer.querySelectorAll(':scope > .column'))
            .forEach((column, index) => updateToolbarButtons(column, index));
    }

    function updateGroupHeaderDisplay(parentCardId) {
        const parentCard = model.getCard(parentCardId);
        const header = dom.getGroupElement(parentCardId)?.querySelector('.group-header');
        if (!header || !parentCard) return;

        const presentation = getGroupPresentation(parentCard, cardNameMaxLength, groupHeaderPreviewLength);
        header.textContent = presentation.text;
        header.title = presentation.title;
    }

    function setInteractionLocked(locked) {
        document.body.classList.toggle('ai-busy', locked);
        if (locked) {
            columnsContainer.querySelectorAll('.add-card-btn, .delete-card-btn, .add-child-btn, .add-column-btn, .delete-column-btn, .save-card-option-btn, .add-sibling-btn, .use-option-btn, .delete-option-btn, .back-to-map-btn, .ai-feature button').forEach(button => {
                button.disabled = true;
                button.classList.add('disabled-by-ai');
            });
            columnsContainer.querySelectorAll('.card-header').forEach(header => {
                header.draggable = false;
                header.classList.add('disabled-by-ai');
            });
            projectListContainer.querySelectorAll('.delete-project-btn, .project-item').forEach(element => {
                if (element.classList.contains('project-item')) element.style.pointerEvents = 'none';
                else element.disabled = true;
                element.classList.add('disabled-by-ai');
            });
            addProjectButton.disabled = true;
            addProjectButton.classList.add('disabled-by-ai');
            if (importProjectButton) {
                importProjectButton.disabled = true;
                importProjectButton.classList.add('disabled-by-ai');
            }
            return;
        }

        document.querySelectorAll('.disabled-by-ai').forEach(element => {
            if (element.tagName === 'BUTTON') {
                if (!(element.classList.contains('delete-column-btn') && element.classList.contains('hidden'))) {
                    element.disabled = false;
                }
            } else if (element.classList.contains('card-header')) {
                element.draggable = mode === 'map';
            } else if (element.classList.contains('project-item')) {
                element.style.pointerEvents = '';
            }
            element.classList.remove('disabled-by-ai');
        });
        if (mode === 'document') renderHistoryPane();
        else updateAllToolbarButtons();
        updateAiFeatureVisibility(isAiReady());
    }

    function createCardStream(cardId, initialContent) {
        const textarea = dom.getCardElement(cardId)?.querySelector('.card-content');
        if (!textarea) return null;
        textarea.readOnly = true;
        textarea.setAttribute('aria-busy', 'true');

        return {
            append(delta) {
                if (textarea.value === initialContent) textarea.value = '';
                textarea.value += delta;
                dom.autoResizeTextarea({ target: textarea });
            },
            replace(content, resize = false) {
                textarea.value = content;
                if (resize) dom.autoResizeTextarea({ target: textarea });
            },
            finish() {
                textarea.classList.remove('ai-loading');
                textarea.readOnly = false;
                textarea.removeAttribute('aria-busy');
            }
        };
    }

    function createOptionStream(cardId, initialContent) {
        const cardElement = dom.getCardElement(cardId);
        if (!cardElement) return null;
        const stream = document.createElement('div');
        stream.className = 'option-stream ai-loading';
        stream.setAttribute('role', 'status');
        stream.textContent = initialContent;
        cardElement.appendChild(stream);
        let content = initialContent;

        return {
            append(delta) {
                if (content === initialContent) content = '';
                content += delta;
                stream.textContent = content;
            },
            replace(nextContent) {
                content = nextContent;
                stream.textContent = nextContent;
            },
            finish(failed) {
                stream.classList.remove('ai-loading');
                stream.classList.toggle('option-stream-error', Boolean(failed));
                stream.classList.toggle('option-stream-created', !failed);
            }
        };
    }

    function createPromptModalContent({ description, inputId, value = '', placeholder = '' }) {
        const content = document.createElement('div');
        const explanation = document.createElement('p');
        explanation.textContent = description;
        const textarea = document.createElement('textarea');
        textarea.id = inputId;
        textarea.placeholder = placeholder;
        textarea.value = value;
        content.append(explanation, textarea);
        return content;
    }

    function showColumnPrompt(columnIndex, currentPrompt, onSave) {
        const inputId = 'modal-column-prompt-input';
        const content = createPromptModalContent({
            description: 'This prompt guides AI actions whose source or destination is in this column.',
            inputId,
            value: currentPrompt,
            placeholder: 'e.g., Write in the style of a pirate.'
        });
        dom.createModal(`Set Prompt for Column ${columnIndex + 1}`, content, 'Save Prompt', modalElement => {
            onSave(modalElement.querySelector(`#${inputId}`).value.trim());
        });
    }

    function showGlobalPrompt(currentPrompt, onSave) {
        const inputId = 'modal-global-prompt-input';
        const content = createPromptModalContent({
            description: 'This prompt applies to every AI action in the project.',
            inputId,
            value: currentPrompt,
            placeholder: 'e.g., Overall writing instructions'
        });
        dom.createModal('Set Global Prompt', content, 'Save Prompt', modalElement => {
            onSave(modalElement.querySelector(`#${inputId}`).value.trim());
        });
    }

    function showCustomAiPrompt(cardId, targets, onSubmit) {
        const labels = {
            rewrite: 'Create an Option for this Card',
            next: 'Continue into the next sibling',
            children: 'Add child Cards'
        };
        const content = document.createElement('div');
        const explanation = document.createElement('p');
        explanation.textContent = 'Choose where the result belongs, then describe the result. The target choice remains authoritative.';
        const label = document.createElement('label');
        label.htmlFor = 'modal-custom-target';
        label.textContent = 'Result target';
        const select = document.createElement('select');
        select.id = 'modal-custom-target';
        for (const target of targets) {
            const option = document.createElement('option');
            option.value = target;
            option.textContent = labels[target];
            select.appendChild(option);
        }
        const textarea = document.createElement('textarea');
        textarea.id = 'modal-custom-prompt-input';
        textarea.placeholder = 'e.g., Rewrite this text in a more formal tone.';
        content.append(explanation, label, select, textarea);

        dom.createModal('Custom AI Prompt', content, 'Submit', modalElement => {
            const userPrompt = modalElement.querySelector('#modal-custom-prompt-input').value.trim();
            const target = modalElement.querySelector('#modal-custom-target').value;
            if (!userPrompt) {
                alert('Please enter a prompt.');
                return false;
            }
            onSubmit({ userPrompt, target });
            return true;
        });
    }

    function initializeAiSettings({ settings, providerPresets, onSave, onTest }) {
        if (!aiSettingsContainer) return;
        const title = aiSettingsContainer.querySelector('#ai-settings-title');
        const provider = aiSettingsContainer.querySelector('#ai-provider');
        const protocol = aiSettingsContainer.querySelector('#ai-protocol');
        const providerUrl = aiSettingsContainer.querySelector('#ai-provider-url');
        const modelName = aiSettingsContainer.querySelector('#ai-model-name');
        const apiKey = aiSettingsContainer.querySelector('#ai-api-key');
        const reasoningEffort = aiSettingsContainer.querySelector('#ai-reasoning-effort');
        const advanced = aiSettingsContainer.querySelector('#ai-advanced-settings');
        const saveButton = aiSettingsContainer.querySelector('#ai-save-settings');
        const testButton = aiSettingsContainer.querySelector('#ai-test-settings');
        const status = aiSettingsContainer.querySelector('#ai-settings-status');
        let testHandle = null;

        const setStatus = (message, state = '') => {
            status.textContent = message;
            status.dataset.state = state;
        };
        const syncCapabilities = () => {
            const isCustom = provider.value === 'custom';
            protocol.disabled = !isCustom;
            providerUrl.disabled = !isCustom;
            reasoningEffort.disabled = protocol.value !== 'responses';
            if (isCustom) advanced.open = true;
        };
        const apply = value => {
            provider.value = value.provider;
            protocol.value = value.protocol;
            providerUrl.value = value.providerUrl;
            modelName.value = value.modelName;
            apiKey.value = value.apiKey;
            reasoningEffort.value = value.reasoningEffort;
            title.classList.toggle('ready', value.isValid);
            syncCapabilities();
        };
        const readDraft = () => ({
            provider: provider.value,
            protocol: protocol.value,
            providerUrl: providerUrl.value,
            modelName: modelName.value,
            apiKey: apiKey.value,
            reasoningEffort: reasoningEffort.value
        });

        apply(settings);
        provider.addEventListener('change', () => {
            const preset = providerPresets[provider.value];
            protocol.value = preset.protocol;
            providerUrl.value = preset.providerUrl;
            modelName.value = preset.modelName;
            reasoningEffort.value = 'medium';
            syncCapabilities();
            setStatus('Review and save these settings.');
        });
        protocol.addEventListener('change', syncCapabilities);
        saveButton.addEventListener('click', () => {
            try {
                const saved = onSave(readDraft());
                apply(saved);
                updateAiFeatureVisibility(saved.isValid);
                setStatus('AI settings saved in this browser.', 'success');
            } catch (error) {
                setStatus(error.message, 'error');
            }
        });
        testButton.addEventListener('click', () => {
            if (testHandle) {
                testHandle.cancel();
                return;
            }
            setStatus('Testing provider connection…');
            testButton.textContent = 'Cancel test';
            testHandle = onTest(readDraft(), {
                onDone: content => {
                    testHandle = null;
                    testButton.textContent = 'Test';
                    setStatus(content.trim() ? 'Connection succeeded.' : 'Connected, but the provider returned no text.', 'success');
                },
                onError: error => {
                    testHandle = null;
                    testButton.textContent = 'Test';
                    setStatus(error.message, error.code === 'cancelled' ? '' : 'error');
                }
            });
        });
    }

    function setAiJobStatus({ state = 'idle', message = '', onCancel, onRetry, onOpenHistory } = {}) {
        if (!aiJobStatus) return;
        aiJobStatus.hidden = state === 'idle';
        aiJobStatus.dataset.state = state;
        aiJobStatus.querySelector('.ai-job-message').textContent = message;
        const actionContainer = aiJobStatus.querySelector('.ai-job-actions');
        actionContainer.innerHTML = '';
        for (const [label, handler] of [
            ['Cancel', onCancel],
            ['Retry', onRetry],
            ['Open History', onOpenHistory]
        ]) {
            if (!handler) continue;
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.addEventListener('click', handler);
            actionContainer.appendChild(button);
        }
    }

    function updateAiFeatureVisibility(isValid) {
        document.body.classList.toggle('ai-ready', isValid);
        document.querySelectorAll('.ai-feature button').forEach(button => {
            if (button.classList.contains('add-prompt-btn') || button.classList.contains('global-prompt-btn')) {
                button.disabled = !isValid;
            } else if (button.closest('.card')) {
                button.disabled = !isValid;
            }
        });
        updateAllToolbarButtons();
    }

    function renderProjectList() {
        projectListContainer.innerHTML = '';
        const projects = model.getProjects().sort((left, right) => right.lastModified - left.lastModified);
        projects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'project-item';
            item.dataset.projectId = project.id;
            item.classList.toggle('active', project.id === model.getActiveProjectId());
            item.innerHTML = `
                <span class="project-title"></span>
                <div class="project-actions">
                    <button class="export-project-btn" title="Export Project" aria-label="Export Project">${iconMarkup('export')}</button>
                    <button class="delete-project-btn" title="Delete Project" aria-label="Delete Project">${iconMarkup('delete')}</button>
                </div>
            `;
            const projectTitle = item.querySelector('.project-title');
            projectTitle.textContent = project.title;
            projectTitle.title = project.title;
            item.addEventListener('click', event => {
                if (!event.target.closest('button') && !event.target.closest('.project-title-input')) {
                    actions.switchProject(project.id);
                }
            });
            item.querySelector('.project-title').addEventListener('dblclick', () => makeProjectTitleEditable(project.id, item));
            item.querySelector('.export-project-btn').addEventListener('click', event => {
                event.stopPropagation();
                actions.exportProject(project.id, event);
            });
            item.querySelector('.delete-project-btn').addEventListener('click', event => {
                event.stopPropagation();
                actions.deleteProject(project.id);
            });
            projectListContainer.appendChild(item);
        });
    }

    function makeProjectTitleEditable(projectId, item) {
        const title = item.querySelector('.project-title');
        const currentTitle = model.getProject(projectId).title;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'project-title-input';
        title.replaceWith(input);
        input.focus();
        input.select();

        let finished = false;
        const finish = save => {
            if (finished) return;
            finished = true;
            const newTitle = input.value.trim();
            const updated = save && newTitle && newTitle !== currentTitle && actions.renameProject(projectId, newTitle);
            title.textContent = updated ? newTitle : currentTitle;
            if (updated) title.title = newTitle;
            input.replaceWith(title);
        };
        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); finish(true); }
            else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
        });
    }

    function handleTextareaBlur(event) {
        const textarea = event.target;
        if (textarea.dataset.skipBlurSave === 'true') {
            delete textarea.dataset.skipBlurSave;
            return;
        }
        const cardElement = textarea.closest('.card');
        if (!cardElement) return;
        const cardId = cardElement.dataset.cardId;
        textarea.classList.remove('ai-loading');
        if (actions.updateCardContent(cardId, textarea.value)) updateGroupHeaderDisplay(cardId);
        cardElement.classList.remove('editing');
        dom.clearHighlights();
    }

    function handleTextareaFocus(event) {
        const cardElement = event.target.closest('.card');
        if (!cardElement) return;
        if (mode === 'document') {
            focusedDocumentCardId = cardElement.dataset.cardId;
            selectedOptionId = model.getOptionsForCard(focusedDocumentCardId)[0]?.id || null;
            renderHistoryPane();
        }
        cardElement.classList.add('editing');
        dom.scrollHierarchy(cardElement.dataset.cardId);
        dom.highlightHierarchy(cardElement.dataset.cardId);
    }

    function makeCardNameEditable(cardId, cardElement) {
        const nameDisplay = cardElement.querySelector('.card-name-display');
        const header = cardElement.querySelector('.card-header');
        if (!nameDisplay || !header || header.querySelector('.card-name-input')) return;
        const card = model.getCard(cardId);
        if (!card) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = card.name || '';
        input.className = 'card-name-input';
        input.maxLength = cardNameMaxLength;
        input.placeholder = `#${cardId.slice(-4)}`;
        nameDisplay.style.display = 'none';
        header.insertBefore(input, header.querySelector('.card-ai-actions') || header.querySelector('.card-actions'));
        input.focus();
        input.select();

        let finished = false;
        const finish = save => {
            if (finished) return;
            finished = true;
            const value = input.value.trim();
            if (save) actions.renameCard(cardId, value === '' ? null : value.substring(0, cardNameMaxLength));
            const finalName = getCardDisplayName(model.getCard(cardId), cardNameMaxLength);
            nameDisplay.textContent = finalName.visible;
            nameDisplay.title = finalName.full;
            updateGroupHeaderDisplay(cardId);
            input.remove();
            nameDisplay.style.display = '';
        };
        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); finish(true); }
            else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
        });
    }

    function insertCard(card, { parentId, insertBeforeCardId, isAiPlaceholder = false }) {
        if (mode === 'document') {
            focusedDocumentCardId = card.id;
            renderDocument();
            requestAnimationFrame(() => {
                const textarea = dom.getCardElement(card.id)?.querySelector('.card-content');
                if (isAiPlaceholder) textarea?.classList.add('ai-loading');
                if (!isAiPlaceholder) dom.focusCardTextarea(card.id, 'start');
            });
            return dom.getCardElement(card.id);
        }
        const cardElement = createCardElement(card);
        let targetContainer = parentId
            ? dom.getGroupElement(parentId)
            : dom.getColumnElementByIndex(card.columnIndex)?.querySelector('.cards-container');

        if (!targetContainer && parentId) {
            const parent = model.getCard(parentId);
            const parentColumn = parent && dom.getColumnElementByIndex(parent.columnIndex);
            if (parentColumn) renderColumnContent(parentColumn, parent.columnIndex);
            targetContainer = dom.getGroupElement(parentId);
        }
        if (!targetContainer) {
            renderApp();
            return cardElement;
        }

        let beforeElement = insertBeforeCardId ? dom.getCardElement(insertBeforeCardId) : null;
        if (beforeElement && parentId && !targetContainer.contains(beforeElement)) {
            targetContainer = beforeElement.closest('.card-group') || targetContainer;
        }
        if (beforeElement && targetContainer.contains(beforeElement)) {
            targetContainer.insertBefore(cardElement, beforeElement);
        } else {
            beforeElement = Array.from(targetContainer.querySelectorAll(':scope > .card[data-card-id]'))
                .find(element => card.order < model.getCard(element.dataset.cardId)?.order);
            if (beforeElement) targetContainer.insertBefore(cardElement, beforeElement);
            else targetContainer.appendChild(cardElement);
        }

        const nextColumn = dom.getColumnElementByIndex(card.columnIndex + 1);
        if (nextColumn) renderColumnContent(nextColumn, card.columnIndex + 1);
        if (card.columnIndex === 0 && !parentId) {
            const rootColumn = dom.getColumnElementByIndex(0);
            if (rootColumn) renderColumnContent(rootColumn, 0);
        }
        requestAnimationFrame(() => {
            const currentElement = dom.getCardElement(card.id) || cardElement;
            const textarea = currentElement.querySelector('.card-content');
            if (isAiPlaceholder) textarea?.classList.add('ai-loading');
            if (!isAiPlaceholder) dom.focusCardTextarea(card.id, 'start');
            else dom.scrollIntoViewIfNeeded(currentElement);
        });
        return cardElement;
    }

    function removeCardElements(cardIds) {
        cardIds.forEach(cardId => {
            dom.getCardElement(cardId)?.remove();
            dom.getGroupElement(cardId)?.remove();
        });
    }

    function appendColumn(columnIndex) {
        const columnElement = createColumnElement(columnIndex);
        columnsContainer.appendChild(columnElement);
        renderColumnContent(columnElement, columnIndex);
        updateAllToolbarButtons();
        columnsContainer.scrollLeft = columnsContainer.scrollWidth;
    }

    function removeColumn(columnIndex) {
        const columnElement = dom.getColumnElementByIndex(columnIndex);
        if (columnElement) columnElement.remove();
        else renderApp();
        updateAllToolbarButtons();
    }

    function optionCreated(cardId, option) {
        if (mode !== 'document' || cardId !== focusedDocumentCardId) return;
        selectedOptionId = option.id;
        renderHistoryPane();
    }

    return {
        appendColumn,
        createCardStream,
        createOptionStream,
        closeDocument,
        focusCard: dom.focusCardTextarea,
        getMode: () => mode,
        initializeAiSettings,
        insertCard,
        openDocument,
        optionCreated,
        removeCardElements,
        removeColumn,
        renderApp,
        renderColumnContent,
        renderDocument,
        renderProjectList,
        setInteractionLocked,
        setAiJobStatus,
        showCustomAiPrompt,
        showColumnPrompt,
        showGlobalPrompt,
        updateAiFeatureVisibility,
        updateAllToolbarButtons,
        updateGroupHeaderDisplay,
        updateToolbarButtons
    };
}

export {
    createEditorView,
    getAdjacentOptionId,
    getCardDisplayName,
    getGroupPresentation,
    getHierarchyDepth,
    getHistorySelection
};
