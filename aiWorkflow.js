const AI_PLACEHOLDER_TEXT = 'AI is thinking...';
const AI_RESPONSE_SEPARATOR = '---';

function findNextSiblingId(cardId, siblings) {
    const currentIndex = siblings.findIndex(card => card.id === cardId);
    return currentIndex !== -1 && currentIndex + 1 < siblings.length
        ? siblings[currentIndex + 1].id
        : null;
}

function getAiActionPlan(action, card, siblings = []) {
    switch (action) {
        case 'summarize':
            return {
                method: 'generateSummary',
                targetColumnIndex: card.columnIndex,
                parentIdForNewCards: card.parentId,
                insertBeforeId: findNextSiblingId(card.id, siblings),
                requiresContentCheck: true,
                useMultiPartResponseHandler: false
            };
        case 'continue':
            return {
                method: 'generateContinuation',
                targetColumnIndex: card.columnIndex,
                parentIdForNewCards: card.parentId,
                insertBeforeId: findNextSiblingId(card.id, siblings),
                requiresContentCheck: false,
                useMultiPartResponseHandler: false
            };
        case 'breakdown':
            return {
                method: 'generateBreakdown',
                targetColumnIndex: card.columnIndex + 1,
                parentIdForNewCards: card.id,
                insertBeforeId: null,
                requiresContentCheck: true,
                useMultiPartResponseHandler: true
            };
        case 'expand':
            return {
                method: 'generateExpand',
                targetColumnIndex: card.columnIndex + 1,
                parentIdForNewCards: card.id,
                insertBeforeId: null,
                requiresContentCheck: true,
                useMultiPartResponseHandler: false
            };
        case 'custom':
            return {
                method: 'generateCustom',
                targetColumnIndex: card.columnIndex + 1,
                parentIdForNewCards: card.id,
                insertBeforeId: null,
                requiresContentCheck: false,
                useMultiPartResponseHandler: true
            };
        default:
            return null;
    }
}

function createAiWorkflow({
    projectState,
    aiService,
    columnsContainer,
    projectListContainer,
    addProjectButton,
    addCard,
    deleteCard,
    getCardElement,
    autoResizeTextarea,
    createModal,
    focusCardTextarea,
    updateGroupHeaderDisplay,
    updateAllToolbarButtons
}) {
    let busy = false;

    function isBusy() {
        return busy;
    }

    function disableConflictingActions() {
        busy = true;
        document.body.classList.add('ai-busy');

        columnsContainer.querySelectorAll('.add-card-btn, .delete-card-btn, .add-child-btn, .add-column-btn, .delete-column-btn').forEach(button => {
            button.disabled = true;
            button.classList.add('disabled-by-ai');
        });
        columnsContainer.querySelectorAll('.card-header').forEach(header => {
            header.draggable = false;
            header.classList.add('disabled-by-ai');
        });
        projectListContainer.querySelectorAll('.delete-project-btn, .project-item').forEach(element => {
            if (element.classList.contains('project-item')) {
                element.style.pointerEvents = 'none';
            } else {
                element.disabled = true;
            }
            element.classList.add('disabled-by-ai');
        });
        addProjectButton.disabled = true;
        addProjectButton.classList.add('disabled-by-ai');
    }

    function enableConflictingActions() {
        busy = false;
        document.body.classList.remove('ai-busy');

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

    function processMultiPartResponse(fullResponse, placeholderCardId, placeholderTextarea, originalCardId, targetColumnIndex, parentIdForNewCards) {
        const parts = fullResponse.split(AI_RESPONSE_SEPARATOR).map(part => part.trim()).filter(Boolean);
        let lastCardId = null;

        if (parts.length > 0) {
            const firstPartContent = parts[0];
            if (projectState.updateCardContentData(placeholderCardId, firstPartContent)) {
                placeholderTextarea.value = firstPartContent;
                placeholderTextarea.classList.remove('ai-loading');
                autoResizeTextarea({ target: placeholderTextarea });
                lastCardId = placeholderCardId;
            } else {
                deleteCard(placeholderCardId);
            }

            if (parts.length > 1 && lastCardId) {
                let insertAfterCardId = lastCardId;
                parts.slice(1).forEach(partContent => {
                    let insertBeforeId = null;
                    if (projectState.getCard(insertAfterCardId)) {
                        insertBeforeId = findNextSiblingId(insertAfterCardId, projectState.getSiblingCards(insertAfterCardId));
                    }
                    const newCardId = addCard(targetColumnIndex, parentIdForNewCards, partContent, insertBeforeId);
                    if (newCardId) {
                        lastCardId = newCardId;
                        insertAfterCardId = newCardId;
                    }
                });
            }
        } else {
            deleteCard(placeholderCardId);
        }

        updateGroupHeaderDisplay(parentIdForNewCards);
        const cardIdToFocus = parts.length > 0 ? lastCardId : null;
        if (cardIdToFocus && projectState.getCard(cardIdToFocus)) {
            requestAnimationFrame(() => focusCardTextarea(cardIdToFocus, 'start'));
        }
        console.log(`AI Multi-Part processing completed for original card ${originalCardId}. Last created/updated card: ${lastCardId}`);
    }

    function execute(cardId, plan, userPrompt = null) {
        if (!aiService.areAiSettingsValid()) {
            alert('Please configure AI settings first.');
            return;
        }
        if (busy) {
            alert('Please wait for the current AI action to complete.');
            return;
        }

        const card = projectState.getCard(cardId);
        if (!card) return;
        if (plan.requiresContentCheck && !card.content?.trim()) {
            alert(`Card #${cardId.slice(-4)} has no content for this action.`);
            return;
        }

        const context = projectState.getCardContextData(cardId);
        if (!context) return;

        disableConflictingActions();
        const placeholderCardId = addCard(
            plan.targetColumnIndex,
            plan.parentIdForNewCards,
            AI_PLACEHOLDER_TEXT,
            plan.insertBeforeId,
            true
        );
        if (!placeholderCardId) {
            enableConflictingActions();
            return;
        }

        const placeholderTextarea = getCardElement(placeholderCardId)?.querySelector('.card-content');
        if (!placeholderTextarea) {
            projectState.updateCardContentData(placeholderCardId, 'Error: Could not find card textarea.');
            enableConflictingActions();
            return;
        }

        try {
            const serviceArguments = {
                context,
                onChunk: delta => {
                    if (placeholderTextarea.value === AI_PLACEHOLDER_TEXT) placeholderTextarea.value = '';
                    placeholderTextarea.value += delta;
                    autoResizeTextarea({ target: placeholderTextarea });
                },
                onError: error => {
                    placeholderTextarea.value = `AI Error: ${error.message}`;
                    placeholderTextarea.classList.remove('ai-loading');
                    projectState.updateCardContentData(placeholderCardId, placeholderTextarea.value);
                    enableConflictingActions();
                },
                onDone: finalContent => {
                    placeholderTextarea.classList.remove('ai-loading');
                    if (plan.useMultiPartResponseHandler) {
                        processMultiPartResponse(
                            finalContent,
                            placeholderCardId,
                            placeholderTextarea,
                            cardId,
                            plan.targetColumnIndex,
                            plan.parentIdForNewCards
                        );
                    } else {
                        if (projectState.updateCardContentData(placeholderCardId, finalContent)) {
                            updateGroupHeaderDisplay(placeholderCardId);
                        }
                        focusCardTextarea(placeholderCardId, 'start');
                    }
                    enableConflictingActions();
                }
            };

            if (userPrompt !== null && plan.method === 'generateCustom') {
                serviceArguments.userPrompt = userPrompt;
            }
            if (typeof aiService[plan.method] !== 'function') {
                throw new Error(`Invalid aiService method name: ${plan.method}`);
            }
            aiService[plan.method](serviceArguments);
        } catch (error) {
            placeholderTextarea.value = `Error during AI call setup: ${error.message}`;
            placeholderTextarea.classList.remove('ai-loading');
            projectState.updateCardContentData(placeholderCardId, placeholderTextarea.value);
            enableConflictingActions();
        }
    }

    function run(action, cardId) {
        const card = projectState.getCard(cardId);
        if (!card) return;
        const siblings = action === 'summarize' || action === 'continue'
            ? projectState.getSiblingCards(cardId)
            : [];
        const plan = getAiActionPlan(action, card, siblings);
        if (plan) execute(cardId, plan);
    }

    function custom(cardId) {
        const card = projectState.getCard(cardId);
        if (!card) return;
        if (!aiService.areAiSettingsValid()) {
            alert('Please configure AI settings first.');
            return;
        }
        if (busy) {
            alert('Please wait for the current AI action to complete.');
            return;
        }

        createModal(
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
                execute(cardId, getAiActionPlan('custom', card), userPrompt);
            }
        );
    }

    function updateFeatureVisibility(isValid) {
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

    return {
        isBusy,
        summarize: cardId => run('summarize', cardId),
        continue: cardId => run('continue', cardId),
        breakdown: cardId => run('breakdown', cardId),
        expand: cardId => run('expand', cardId),
        custom,
        updateFeatureVisibility
    };
}

export { createAiWorkflow, getAiActionPlan };
