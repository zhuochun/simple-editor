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
    function createCardElement(cardData) {
        const cardElement = document.createElement('div');
        cardElement.id = `card-${cardData.id}`;
        cardElement.className = 'card';
        cardElement.dataset.cardId = cardData.id;
        cardElement.style.backgroundColor = cardData.color || model.getColorForCard(cardData);

        const displayName = getCardDisplayName(cardData, cardNameMaxLength);
        const aiReady = isAiReady();
        cardElement.innerHTML = `
            <div class="card-header" draggable="true">
                <span class="card-name-display" title="${displayName.full}">${displayName.visible}</span>
                <div class="card-ai-actions ai-feature">
                    <button class="ai-continue-btn" title="Continue as next sibling" ${!aiReady ? 'disabled' : ''}>⬇️</button>
                    <button class="ai-expand-btn" title="Elaborate as child" ${!aiReady ? 'disabled' : ''}>↕️</button>
                    <button class="ai-summarize-btn" title="Create summary after card" ${!aiReady ? 'disabled' : ''}>⏪</button>
                    <button class="ai-breakdown-btn" title="Brainstorm as children" ${!aiReady ? 'disabled' : ''}>🧠</button>
                    <button class="ai-custom-btn" title="Custom response as children" ${!aiReady ? 'disabled' : ''}>✨</button>
                </div>
                <div class="card-actions">
                    <button class="add-child-btn" title="Add Child Card (to next column)">➕</button>
                    <button class="delete-card-btn" title="Delete Card">🗑️</button>
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

        cardElement.querySelector('.add-child-btn').addEventListener('click', event => {
            event.stopPropagation();
            actions.addChildCard(cardData.id);
        });
        cardElement.querySelector('.delete-card-btn').addEventListener('click', event => {
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
            cardElement.querySelector(selector).addEventListener('click', event => {
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

    function renderApp() {
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
        Array.from(columnsContainer.children).forEach((column, index) => updateToolbarButtons(column, index));
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
            columnsContainer.querySelectorAll('.add-card-btn, .delete-card-btn, .add-child-btn, .add-column-btn, .delete-column-btn').forEach(button => {
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
                element.draggable = true;
            } else if (element.classList.contains('project-item')) {
                element.style.pointerEvents = '';
            }
            element.classList.remove('disabled-by-ai');
        });
        updateAllToolbarButtons();
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

    function showCustomAiPrompt(cardId, onSubmit) {
        dom.createModal(
            'Custom AI Prompt',
            `<p>Enter your prompt below. It will be sent to the AI along with the content of card #${cardId.slice(-4)}.</p>
             <textarea id="modal-custom-prompt-input" placeholder="e.g., Rewrite this text in a more formal tone."></textarea>`,
            'Submit',
            modalElement => {
                const userPrompt = modalElement.querySelector('#modal-custom-prompt-input').value.trim();
                if (!userPrompt) {
                    alert('Please enter a prompt.');
                    return;
                }
                onSubmit(userPrompt);
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

    return {
        appendColumn,
        createCardStream,
        focusCard: dom.focusCardTextarea,
        insertCard,
        removeCardElements,
        removeColumn,
        renderApp,
        renderColumnContent,
        renderProjectList,
        setInteractionLocked,
        showCustomAiPrompt,
        updateAiFeatureVisibility,
        updateAllToolbarButtons,
        updateGroupHeaderDisplay,
        updateToolbarButtons
    };
}

export { createEditorView, getCardDisplayName, getGroupPresentation };
