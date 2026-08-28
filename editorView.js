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

function shouldOpenDocumentFromCardClick(documentMode, target) {
    return !documentMode && !target.closest('button, input');
}

function createEditorView({
    columnsContainer,
    projectListContainer,
    addProjectButton,
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
        cardElement.classList.toggle('document-owner-card', documentMode && cardData.id === documentOwnerCardId);
        cardElement.dataset.cardId = cardData.id;
        const cardColor = model.getColorForCard(cardData);
        const hierarchyDepth = getHierarchyDepth(cardData, model.getCard);
        const colorMatch = cardColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        cardElement.style.backgroundColor = cardColor;
        cardElement.style.setProperty('--hierarchy-depth', hierarchyDepth);
        cardElement.style.setProperty('--hierarchy-rail', colorMatch
            ? `hsl(${colorMatch[1]}, 58%, ${Math.max(35, 52 - hierarchyDepth * 3)}%)`
            : '#718096');

        const displayName = getCardDisplayName(cardData, cardNameMaxLength);
        const aiReady = isAiReady();
        cardElement.innerHTML = `
            <div class="card-header" draggable="${!documentMode}">
                <span class="card-name-display" title="${displayName.full}">${displayName.visible}</span>
                <div class="card-ai-actions ai-feature">
                    <button class="ai-continue-btn" title="Continue as next sibling" ${!aiReady ? 'disabled' : ''}>⬇️</button>
                    ${documentMode ? '' : `<button class="ai-expand-btn" title="Elaborate as child" ${!aiReady ? 'disabled' : ''}>↕️</button>`}
                    <button class="ai-summarize-btn" title="Create summary after card" ${!aiReady ? 'disabled' : ''}>⏪</button>
                    ${documentMode ? '' : `<button class="ai-breakdown-btn" title="Brainstorm as children" ${!aiReady ? 'disabled' : ''}>🧠</button>`}
                    <button class="ai-custom-btn" title="Choose AI result target" ${!aiReady ? 'disabled' : ''}>✨</button>
                </div>
                <div class="card-actions">
                    ${documentMode ? '' : '<button class="add-child-btn" title="Add Child Card (to next column)">➕</button>'}
                    ${documentMode ? '' : '<button class="delete-card-btn" title="Delete Card">🗑️</button>'}
                </div>
            </div>
            <textarea class="card-content" placeholder="Enter text...">${cardData.content || ''}</textarea>
        `;

        const textarea = cardElement.querySelector('.card-content');
        cardElement.querySelector('.card-name-display').addEventListener('dblclick', () => makeCardNameEditable(cardData.id, cardElement));
        textarea.addEventListener('blur', handleTextareaBlur);
        textarea.addEventListener('focus', handleTextareaFocus);
        textarea.addEventListener('input', dom.autoResizeTextarea);
        requestAnimationFrame(() => dom.autoResizeTextarea({ target: textarea }));

        if (!documentMode) {
            cardElement.addEventListener('click', event => {
                if (!shouldOpenDocumentFromCardClick(documentMode, event.target)) return;
                openDocument(cardData.id);
            });
        }
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
        groupElement.innerHTML = `<div class="group-header" title="${presentation.title}">${presentation.text}</div>`;
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
        const promptIndicator = model.getColumnData(columnIndex)?.prompt ? '📝' : '';
        const globalPromptIndicator = model.getGlobalPromptData() ? '📝' : '';
        const globalPromptButton = columnIndex === 0
            ? `<button class="global-prompt-btn ai-feature" title="Set Global Prompt" ${!aiReady ? 'disabled' : ''}>Global Prompt ${globalPromptIndicator}</button>`
            : '';

        columnElement.innerHTML = `
            <div class="column-toolbar">
                <div class="toolbar-left">
                    <button class="add-card-btn">Add Card</button>
                    ${globalPromptButton}
                    <button class="add-prompt-btn ai-feature" title="Set Column Prompt" ${!aiReady ? 'disabled' : ''}>Prompt ${promptIndicator}</button>
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
        for (const snapshotCard of option.snapshot.cards) {
            const preview = document.createElement('article');
            preview.className = 'history-card';
            const title = document.createElement('div');
            title.className = 'history-card-name';
            title.textContent = snapshotCard.name || `#${snapshotCard.id.slice(-4)}`;
            const content = document.createElement('div');
            content.className = 'history-card-content';
            content.textContent = snapshotCard.content || '';
            preview.append(title, content);
            container.appendChild(preview);
        }
    }

    function renderHistoryPane() {
        const pane = columnsContainer.querySelector('.document-history');
        if (!pane || !documentOwnerCardId) return;
        const options = model.getOptionsForCard(documentOwnerCardId);
        const selected = getHistorySelection(options, selectedOptionId);
        selectedOptionId = selected?.id || null;

        pane.innerHTML = `
            <div class="document-pane-heading">
                <div>
                    <span class="eyebrow">History</span>
                    <h2>Options</h2>
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
                status.textContent = availability.reason === 'document-scope-descendants'
                    ? 'Cannot use this Option because it would remove a Card that has descendants.'
                    : 'This Option no longer matches the owner’s current sibling scope.';
            }
        } else {
            preview.innerHTML = '<p class="empty-history">No Options yet. Save Current to create the first one.</p>';
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
                    : 'This Option cannot be used in the current sibling scope.';
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
        const owner = model.getCard(documentOwnerCardId);
        if (!owner) {
            mode = 'map';
            documentOwnerCardId = null;
            selectedOptionId = null;
            renderApp();
            return;
        }

        const ownerName = getCardDisplayName(owner, cardNameMaxLength).full;
        const siblings = model.getSiblingCards(owner.id);
        if (!siblings.some(card => card.id === focusedDocumentCardId)) focusedDocumentCardId = owner.id;
        columnsContainer.classList.add('document-mode');
        document.body.classList.add('document-mode');
        columnsContainer.innerHTML = `
            <section class="document-view">
                <header class="document-toolbar">
                    <button class="back-to-map-btn">← Map</button>
                    <div class="document-identity">
                        <span class="eyebrow">Sibling document</span>
                        <strong class="document-owner-name"></strong>
                    </div>
                    <div class="document-toolbar-actions">
                        <button class="save-option-btn">Save current as option</button>
                        <button class="add-sibling-btn">Add sibling</button>
                    </div>
                </header>
                <div class="document-workspace">
                    <main class="document-current" aria-label="Editable current document">
                        <div class="document-pane-heading">
                            <div><span class="eyebrow">Current</span><h1>Editable document</h1></div>
                            <span class="document-card-count">${siblings.length} card${siblings.length === 1 ? '' : 's'}</span>
                        </div>
                        <div class="document-cards"></div>
                    </main>
                    <aside class="document-history" aria-label="Read-only history options" tabindex="0"></aside>
                </div>
            </section>
        `;

        columnsContainer.querySelector('.document-view').dataset.ownerCardId = owner.id;
        const cardsContainer = columnsContainer.querySelector('.document-cards');
        columnsContainer.querySelector('.document-owner-name').textContent = ownerName;
        siblings.forEach(card => cardsContainer.appendChild(createCardElement(card, { documentMode: true })));
        renderHistoryPane();

        columnsContainer.querySelector('.back-to-map-btn').addEventListener('click', closeDocument);
        columnsContainer.querySelector('.save-option-btn').addEventListener('click', () => {
            const result = actions.saveOption(documentOwnerCardId);
            if (!result.success) {
                columnsContainer.querySelector('.history-status').textContent = result.reason === 'persistence-failed'
                    ? 'The Option could not be saved because browser storage is unavailable or full.'
                    : 'The Option could not be saved.';
                return;
            }
            selectedOptionId = result.option.id;
            renderHistoryPane();
        });
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
            const options = model.getOptionsForCard(documentOwnerCardId);
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
            columnsContainer.innerHTML = '<p style="padding: 20px; text-align: center;">Error: No project selected or data corrupted.</p>';
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
            promptButton.textContent = `Prompt ${model.getColumnData(columnIndex)?.prompt ? '📝' : ''}`;
            promptButton.disabled = !isAiReady();
        }
        if (globalPromptButton) {
            globalPromptButton.textContent = `Global Prompt ${model.getGlobalPromptData() ? '📝' : ''}`;
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
            columnsContainer.querySelectorAll('.add-card-btn, .delete-card-btn, .add-child-btn, .add-column-btn, .delete-column-btn, .save-option-btn, .add-sibling-btn, .use-option-btn, .delete-option-btn').forEach(button => {
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
    }

    function createCardStream(cardId, initialContent) {
        const textarea = dom.getCardElement(cardId)?.querySelector('.card-content');
        if (!textarea) return null;

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

    function showCustomAiPrompt(cardId, targets, onSubmit) {
        const labels = {
            rewrite: 'Create an Option for this Card',
            next: 'Continue into the next sibling',
            children: 'Add child Cards'
        };
        dom.createModal(
            'Custom AI Prompt',
            `<p>Choose where the result belongs, then describe the result. The target choice remains authoritative.</p>
             <label for="modal-custom-target">Result target</label>
             <select id="modal-custom-target">${targets.map(target => `<option value="${target}">${labels[target]}</option>`).join('')}</select>
             <textarea id="modal-custom-prompt-input" placeholder="e.g., Rewrite this text in a more formal tone."></textarea>`,
            'Submit',
            modalElement => {
                const userPrompt = modalElement.querySelector('#modal-custom-prompt-input').value.trim();
                const target = modalElement.querySelector('#modal-custom-target').value;
                if (!userPrompt) {
                    alert('Please enter a prompt.');
                    return;
                }
                onSubmit({ userPrompt, target });
            }
        );
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
                <span class="project-title" title="${project.title}">${project.title}</span>
                <div class="project-actions">
                    <button class="export-project-btn" title="Export Project">📤</button>
                    <button class="delete-project-btn" title="Delete Project">🗑️</button>
                </div>
            `;
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
        if (mode === 'document') focusedDocumentCardId = cardElement.dataset.cardId;
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
        if (mode !== 'document' || cardId !== documentOwnerCardId) return;
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
        showCustomAiPrompt,
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
    getHistorySelection,
    shouldOpenDocumentFromCardClick
};
