const AI_PLACEHOLDER_TEXT = 'AI is thinking...';
const AI_RESPONSE_SEPARATOR = '---';

function findNextSiblingId(cardId, siblings) {
    const currentIndex = siblings.findIndex(card => card.id === cardId);
    return currentIndex !== -1 && currentIndex + 1 < siblings.length
        ? siblings[currentIndex + 1].id
        : null;
}

function createSequentialPlan(method, card, siblings, requiresContentCheck) {
    const nextSiblingId = findNextSiblingId(card.id, siblings);
    if (nextSiblingId) {
        return {
            method,
            targetKind: 'option',
            targetCardId: nextSiblingId,
            requiresContentCheck,
            useMultiPartResponseHandler: false
        };
    }
    return {
        method,
        targetKind: 'card',
        targetColumnIndex: card.columnIndex,
        parentIdForNewCards: card.parentId,
        insertBeforeId: null,
        requiresContentCheck,
        useMultiPartResponseHandler: false
    };
}

function createChildPlan(method, card, useMultiPartResponseHandler) {
    return {
        method,
        targetKind: 'card',
        targetColumnIndex: card.columnIndex + 1,
        parentIdForNewCards: card.id,
        insertBeforeId: null,
        requiresContentCheck: method !== 'generateCustom',
        useMultiPartResponseHandler
    };
}

function getAiActionPlan(action, card, siblings = [], options = {}) {
    const mode = options.mode || 'map';
    switch (action) {
        case 'summarize':
            return createSequentialPlan('generateSummary', card, siblings, true);
        case 'continue':
            return createSequentialPlan('generateContinuation', card, siblings, false);
        case 'breakdown':
            return mode === 'document' ? null : createChildPlan('generateBreakdown', card, true);
        case 'expand':
            return mode === 'document' ? null : createChildPlan('generateExpand', card, false);
        case 'custom':
            if (options.customTarget === 'rewrite') {
                return {
                    method: 'generateCustom',
                    targetKind: 'option',
                    targetCardId: card.id,
                    requiresContentCheck: false,
                    useMultiPartResponseHandler: false
                };
            }
            if (options.customTarget === 'next') {
                return {
                    ...createSequentialPlan('generateCustom', card, siblings, false),
                    useMultiPartResponseHandler: false
                };
            }
            if (options.customTarget === 'children' && mode !== 'document') {
                return createChildPlan('generateCustom', card, true);
            }
            return null;
        default:
            return null;
    }
}

function createAiWorkflow({
    projectState,
    aiService,
    addCard,
    getMode = () => 'map',
    showAlert = message => globalThis.alert(message),
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

    function writeCardError(cardId, cardStream, message) {
        const content = 'AI Error: ' + message;
        cardStream?.replace(content);
        cardStream?.finish(true);
        projectState.updateCardContentData(cardId, content);
    }

    function processMultiPartResponse(fullResponse, placeholderCardId, cardStream, originalCardId, plan) {
        const parts = fullResponse.split(AI_RESPONSE_SEPARATOR).map(part => part.trim()).filter(Boolean);
        if (parts.length === 0) {
            writeCardError(placeholderCardId, cardStream, 'The provider returned an empty response.');
            return;
        }

        const firstPartContent = parts[0];
        if (!projectState.updateCardContentData(placeholderCardId, firstPartContent)) {
            writeCardError(placeholderCardId, cardStream, 'The generated Card is no longer available.');
            return;
        }

        cardStream.replace(firstPartContent);
        cardStream.finish(false);
        let lastCardId = placeholderCardId;
        for (const partContent of parts.slice(1)) {
            let insertBeforeId = null;
            if (projectState.getCard(lastCardId)) {
                insertBeforeId = findNextSiblingId(lastCardId, projectState.getSiblingCards(lastCardId));
            }
            const newCardId = addCard(
                plan.targetColumnIndex,
                plan.parentIdForNewCards,
                partContent,
                insertBeforeId
            );
            if (newCardId) lastCardId = newCardId;
        }

        view.updateGroupHeaderDisplay(plan.parentIdForNewCards);
        if (projectState.getCard(lastCardId)) view.focusCard(lastCardId, 'start');
        console.log('AI multi-part processing completed for ' + originalCardId + '. Last Card: ' + lastCardId);
    }

    function executeOptionTarget(cardId, plan, userPrompt) {
        const optionStream = view.createOptionStream(plan.targetCardId, AI_PLACEHOLDER_TEXT);
        if (!optionStream) {
            enableConflictingActions();
            showAlert('Could not display the generated Option.');
            return false;
        }

        let settled = false;
        const finishFailure = message => {
            if (settled) return;
            settled = true;
            optionStream.replace('AI Error: ' + message);
            optionStream.finish(true);
            enableConflictingActions();
        };
        const finishSuccess = finalContent => {
            if (settled) return;
            if (typeof finalContent !== 'string' || !finalContent.trim()) {
                finishFailure('The provider returned an empty response.');
                return;
            }

            const result = projectState.createOptionData(
                plan.targetCardId,
                'AI',
                { content: finalContent }
            );
            if (!result.success) {
                finishFailure(result.reason === 'persistence-failed'
                    ? 'The Option could not be saved.'
                    : 'The Option could not be created.');
                return;
            }

            settled = true;
            optionStream.replace(finalContent);
            optionStream.finish(false);
            view.optionCreated?.(plan.targetCardId, result.option);
            enableConflictingActions();
        };

        const serviceArguments = {
            context: projectState.getCardContextData(cardId),
            onChunk: delta => {
                if (!settled) optionStream.append(delta);
            },
            onError: error => finishFailure(error.message),
            onDone: finishSuccess
        };
        if (userPrompt !== null && plan.method === 'generateCustom') serviceArguments.userPrompt = userPrompt;

        try {
            if (typeof aiService[plan.method] !== 'function') {
                throw new Error('Invalid aiService method name: ' + plan.method);
            }
            aiService[plan.method](serviceArguments);
            return true;
        } catch (error) {
            finishFailure('AI call setup failed: ' + error.message);
            return false;
        }
    }

    function executeCardTarget(cardId, plan, userPrompt) {
        const placeholderCardId = addCard(
            plan.targetColumnIndex,
            plan.parentIdForNewCards,
            AI_PLACEHOLDER_TEXT,
            plan.insertBeforeId,
            true
        );
        if (!placeholderCardId) {
            enableConflictingActions();
            return false;
        }

        const cardStream = view.createCardStream(placeholderCardId, AI_PLACEHOLDER_TEXT);
        if (!cardStream) {
            projectState.updateCardContentData(placeholderCardId, 'AI Error: Could not display the generated Card.');
            enableConflictingActions();
            return false;
        }

        let settled = false;
        const finishFailure = message => {
            if (settled) return;
            settled = true;
            writeCardError(placeholderCardId, cardStream, message);
            enableConflictingActions();
        };
        const finishSuccess = finalContent => {
            if (settled) return;
            if (typeof finalContent !== 'string' || !finalContent.trim()) {
                finishFailure('The provider returned an empty response.');
                return;
            }

            settled = true;
            if (plan.useMultiPartResponseHandler) {
                processMultiPartResponse(finalContent, placeholderCardId, cardStream, cardId, plan);
            } else {
                projectState.updateCardContentData(placeholderCardId, finalContent);
                cardStream.replace(finalContent);
                cardStream.finish(false);
                view.updateGroupHeaderDisplay(placeholderCardId);
                view.focusCard(placeholderCardId, 'start');
            }
            enableConflictingActions();
        };

        const serviceArguments = {
            context: projectState.getCardContextData(cardId),
            onChunk: delta => {
                if (!settled) cardStream.append(delta);
            },
            onError: error => finishFailure(error.message),
            onDone: finishSuccess
        };
        if (userPrompt !== null && plan.method === 'generateCustom') serviceArguments.userPrompt = userPrompt;

        try {
            if (typeof aiService[plan.method] !== 'function') {
                throw new Error('Invalid aiService method name: ' + plan.method);
            }
            aiService[plan.method](serviceArguments);
            return true;
        } catch (error) {
            finishFailure('AI call setup failed: ' + error.message);
            return false;
        }
    }

    function execute(cardId, plan, userPrompt = null) {
        if (!aiService.areAiSettingsValid()) {
            showAlert('Please configure AI settings first.');
            return false;
        }
        if (busy) {
            showAlert('Please wait for the current AI action to complete.');
            return false;
        }

        const card = projectState.getCard(cardId);
        if (!card || !plan) return false;
        if (plan.requiresContentCheck && !card.content?.trim()) {
            showAlert('Card #' + cardId.slice(-4) + ' has no content for this action.');
            return false;
        }
        if (!projectState.getCardContextData(cardId)) return false;

        disableConflictingActions();
        return plan.targetKind === 'option'
            ? executeOptionTarget(cardId, plan, userPrompt)
            : executeCardTarget(cardId, plan, userPrompt);
    }

    function run(action, cardId) {
        const card = projectState.getCard(cardId);
        if (!card) return false;
        const siblings = action === 'summarize' || action === 'continue'
            ? projectState.getSiblingCards(cardId)
            : [];
        const plan = getAiActionPlan(action, card, siblings, { mode: getMode() });
        return plan ? execute(cardId, plan) : false;
    }

    function custom(cardId) {
        const card = projectState.getCard(cardId);
        if (!card) return false;
        if (!aiService.areAiSettingsValid()) {
            showAlert('Please configure AI settings first.');
            return false;
        }
        if (busy) {
            showAlert('Please wait for the current AI action to complete.');
            return false;
        }

        const mode = getMode();
        const targets = mode === 'document'
            ? ['rewrite', 'next']
            : ['rewrite', 'next', 'children'];
        view.showCustomAiPrompt(cardId, targets, ({ userPrompt, target }) => {
            const siblingsForTarget = target === 'next' ? projectState.getSiblingCards(cardId) : [];
            const plan = getAiActionPlan('custom', card, siblingsForTarget, {
                mode,
                customTarget: target
            });
            if (plan) execute(cardId, plan, userPrompt);
        });
        return true;
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
