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
    let activeRequest = null;
    let lastRetry = null;

    function isBusy() {
        return busy;
    }

    function disableConflictingActions(retryAction) {
        busy = true;
        lastRetry = retryAction;
        view.setInteractionLocked(true);
        view.setAiJobStatus?.({
            state: 'running',
            message: 'AI is thinking…',
            onCancel: () => activeRequest?.cancel?.()
        });
    }

    function enableConflictingActions() {
        busy = false;
        activeRequest = null;
        view.setInteractionLocked(false);
    }

    function showFailureStatus(error) {
        const message = typeof error === 'string' ? error : error?.message;
        view.setAiJobStatus?.({
            state: 'error',
            message: message || 'The AI request failed.',
            onRetry: lastRetry
        });
    }

    function getPlacement(cardId, plan) {
        if (plan.targetKind === 'option') {
            return {
                targetKind: 'option',
                targetCardContent: projectState.getCard(plan.targetCardId)?.content || ''
            };
        }
        return {
            targetKind: plan.parentIdForNewCards === cardId ? 'children' : 'card'
        };
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
            return { success: false, message: 'The provider returned an empty response.' };
        }

        const firstPartContent = parts[0];
        if (!projectState.updateCardContentData(placeholderCardId, firstPartContent)) {
            return { success: false, message: 'The generated Card is no longer available.' };
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
            if (!newCardId) {
                return { success: false, message: 'One or more generated Cards could not be added.' };
            }
            lastCardId = newCardId;
        }

        view.updateGroupHeaderDisplay(plan.parentIdForNewCards);
        if (projectState.getCard(lastCardId)) view.focusCard(lastCardId, 'start');
        console.log('AI multi-part processing completed for ' + originalCardId + '. Last Card: ' + lastCardId);
        return { success: true, lastCardId };
    }

    function executeOptionTarget(cardId, plan, userPrompt) {
        const optionStream = view.createOptionStream(plan.targetCardId, AI_PLACEHOLDER_TEXT);
        if (!optionStream) {
            enableConflictingActions();
            showAlert('Could not display the generated Option.');
            return false;
        }

        let settled = false;
        const finishFailure = error => {
            if (settled) return;
            settled = true;
            const message = typeof error === 'string' ? error : error?.message;
            optionStream.replace('AI Error: ' + message);
            optionStream.finish(true);
            enableConflictingActions();
            showFailureStatus(error);
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
            view.setAiJobStatus?.({
                state: 'success',
                message: `AI Option created for Card #${plan.targetCardId.slice(-4)}.`,
                onOpenHistory: () => view.openDocument?.(plan.targetCardId)
            });
        };

        const serviceArguments = {
            context: projectState.getCardContextData(cardId),
            placement: getPlacement(cardId, plan),
            onChunk: delta => {
                if (!settled) optionStream.append(delta);
            },
            onError: finishFailure,
            onDone: finishSuccess
        };
        if (userPrompt !== null && plan.method === 'generateCustom') serviceArguments.userPrompt = userPrompt;

        try {
            if (typeof aiService[plan.method] !== 'function') {
                throw new Error('Invalid aiService method name: ' + plan.method);
            }
            const request = aiService[plan.method](serviceArguments);
            if (!settled) activeRequest = request || null;
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
        const finishFailure = error => {
            if (settled) return;
            settled = true;
            const message = typeof error === 'string' ? error : error?.message;
            writeCardError(placeholderCardId, cardStream, message);
            enableConflictingActions();
            showFailureStatus(error);
        };
        const finishSuccess = finalContent => {
            if (settled) return;
            if (typeof finalContent !== 'string' || !finalContent.trim()) {
                finishFailure('The provider returned an empty response.');
                return;
            }

            if (plan.useMultiPartResponseHandler) {
                const result = processMultiPartResponse(finalContent, placeholderCardId, cardStream, cardId, plan);
                if (!result.success) {
                    finishFailure(result.message);
                    return;
                }
            } else {
                if (!projectState.updateCardContentData(placeholderCardId, finalContent)) {
                    finishFailure('The generated Card is no longer available.');
                    return;
                }
                cardStream.replace(finalContent);
                cardStream.finish(false);
                view.updateGroupHeaderDisplay(placeholderCardId);
                view.focusCard(placeholderCardId, 'start');
            }
            settled = true;
            enableConflictingActions();
            view.setAiJobStatus?.({
                state: 'success',
                message: plan.useMultiPartResponseHandler
                    ? 'AI child Cards created.'
                    : `AI Card #${placeholderCardId.slice(-4)} created.`
            });
        };

        const serviceArguments = {
            context: projectState.getCardContextData(cardId),
            placement: getPlacement(cardId, plan),
            onChunk: delta => {
                if (!settled) cardStream.append(delta);
            },
            onError: finishFailure,
            onDone: finishSuccess
        };
        if (userPrompt !== null && plan.method === 'generateCustom') serviceArguments.userPrompt = userPrompt;

        try {
            if (typeof aiService[plan.method] !== 'function') {
                throw new Error('Invalid aiService method name: ' + plan.method);
            }
            const request = aiService[plan.method](serviceArguments);
            if (!settled) activeRequest = request || null;
            return true;
        } catch (error) {
            finishFailure('AI call setup failed: ' + error.message);
            return false;
        }
    }

    function execute(cardId, plan, userPrompt = null, retryAction = null) {
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

        disableConflictingActions(retryAction);
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
        return plan ? execute(cardId, plan, null, () => run(action, cardId)) : false;
    }

    function runCustom(cardId, userPrompt, target, mode) {
        const card = projectState.getCard(cardId);
        if (!card) return false;
        const siblingsForTarget = target === 'next' ? projectState.getSiblingCards(cardId) : [];
        const plan = getAiActionPlan('custom', card, siblingsForTarget, {
            mode,
            customTarget: target
        });
        return plan
            ? execute(cardId, plan, userPrompt, () => runCustom(cardId, userPrompt, target, getMode()))
            : false;
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
            runCustom(cardId, userPrompt, target, mode);
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
