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
    addCard,
    deleteCard,
    view
}) {
    let busy = false;

    function isBusy() {
        return busy;
    }

    function disableConflictingActions() {
        busy = true;
        view.setInteractionLocked(true);
    }

    function enableConflictingActions() {
        busy = false;
        view.setInteractionLocked(false);
    }

    function processMultiPartResponse(fullResponse, placeholderCardId, cardStream, originalCardId, targetColumnIndex, parentIdForNewCards) {
        const parts = fullResponse.split(AI_RESPONSE_SEPARATOR).map(part => part.trim()).filter(Boolean);
        let lastCardId = null;

        if (parts.length > 0) {
            const firstPartContent = parts[0];
            if (projectState.updateCardContentData(placeholderCardId, firstPartContent)) {
                cardStream.replace(firstPartContent, true);
                cardStream.finish();
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

        view.updateGroupHeaderDisplay(parentIdForNewCards);
        const cardIdToFocus = parts.length > 0 ? lastCardId : null;
        if (cardIdToFocus && projectState.getCard(cardIdToFocus)) {
            requestAnimationFrame(() => view.focusCard(cardIdToFocus, 'start'));
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

        const cardStream = view.createCardStream(placeholderCardId, AI_PLACEHOLDER_TEXT);
        if (!cardStream) {
            projectState.updateCardContentData(placeholderCardId, 'Error: Could not find card textarea.');
            enableConflictingActions();
            return;
        }

        try {
            const serviceArguments = {
                context,
                onChunk: delta => {
                    cardStream.append(delta);
                },
                onError: error => {
                    const errorContent = `AI Error: ${error.message}`;
                    cardStream.replace(errorContent);
                    cardStream.finish();
                    projectState.updateCardContentData(placeholderCardId, errorContent);
                    enableConflictingActions();
                },
                onDone: finalContent => {
                    cardStream.finish();
                    if (plan.useMultiPartResponseHandler) {
                        processMultiPartResponse(
                            finalContent,
                            placeholderCardId,
                            cardStream,
                            cardId,
                            plan.targetColumnIndex,
                            plan.parentIdForNewCards
                        );
                    } else {
                        if (projectState.updateCardContentData(placeholderCardId, finalContent)) {
                            view.updateGroupHeaderDisplay(placeholderCardId);
                        }
                        view.focusCard(placeholderCardId, 'start');
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
            const errorContent = `Error during AI call setup: ${error.message}`;
            cardStream.replace(errorContent);
            cardStream.finish();
            projectState.updateCardContentData(placeholderCardId, errorContent);
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

        view.showCustomAiPrompt(cardId, userPrompt => {
            execute(cardId, getAiActionPlan('custom', card), userPrompt);
        });
    }

    function updateFeatureVisibility(isValid) {
        view.updateAiFeatureVisibility(isValid);
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
