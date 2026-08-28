function createEditorDom({
    projectState,
    columnsContainer
}) {
    function getCardElement(cardId) {
        return document.getElementById(`card-${cardId}`);
    }

    function getGroupElement(parentId) {
        return document.getElementById(`group-${parentId}`);
    }

    function getColumnElementByIndex(index) {
        if (index < 0 || index >= columnsContainer.children.length) return null;
        return columnsContainer.children[index];
    }

    function getColumnIndex(columnElement) {
        if (!columnElement) return -1;
        return Array.from(columnsContainer.children).indexOf(columnElement);
    }

    function autoResizeTextarea(event) {
        const textarea = event.target;
        textarea.style.height = 'auto';
        textarea.style.height = window.getComputedStyle(textarea).height;
        textarea.style.height = `${textarea.scrollHeight}px`;
    }

    function scrollIntoViewIfNeeded(element) {
        element?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }

    function scrollHierarchy(cardId) {
        const cardElement = getCardElement(cardId);
        const focusedCard = projectState.getCard(cardId);
        if (!cardElement || !focusedCard) return;

        const getScrollContainer = element => (
            element?.closest('.column')?.querySelector('.cards-container') || null
        );
        const scrollTargets = new Map();
        const queueAlignment = (element, desiredViewportTop) => {
            const container = getScrollContainer(element);
            if (!container || !element || scrollTargets.has(container)) return;
            scrollTargets.set(container, { element, desiredViewportTop });
        };

        const focusedContainer = getScrollContainer(cardElement);
        if (!focusedContainer) return;
        const focusedContainerRect = focusedContainer.getBoundingClientRect();
        const focusedRect = cardElement.getBoundingClientRect();
        const ancestorAlignments = [];
        let ancestorCard = focusedCard;
        let ancestorElement = cardElement;
        let cumulativeAncestorOffset = 0;
        while (ancestorCard.parentId) {
            const siblingGroup = ancestorElement.closest('.card-group');
            const parentCard = projectState.getCard(ancestorCard.parentId);
            const parentElement = getCardElement(ancestorCard.parentId);
            if (!siblingGroup || !parentCard || !parentElement) break;

            cumulativeAncestorOffset += ancestorElement.getBoundingClientRect().top
                - siblingGroup.getBoundingClientRect().top;
            ancestorAlignments.push({
                element: parentElement,
                offsetFromFocusedCard: cumulativeAncestorOffset
            });
            ancestorCard = parentCard;
            ancestorElement = parentElement;
        }

        const preferredFocusedTop = focusedContainerRect.top + (focusedContainer.clientHeight * 0.3);
        const earliestAncestorVisibleTop = focusedContainerRect.top
            + 16
            + cumulativeAncestorOffset;
        const latestFullyVisibleTop = focusedContainerRect.top
            + Math.max(0, focusedContainer.clientHeight - focusedRect.height - 24);
        const focusedViewportTop = Math.min(
            Math.max(preferredFocusedTop, earliestAncestorVisibleTop),
            latestFullyVisibleTop
        );
        queueAlignment(cardElement, focusedViewportTop);

        for (const alignment of ancestorAlignments) {
            queueAlignment(
                alignment.element,
                focusedViewportTop - alignment.offsetFromFocusedCard
            );
        }

        let branchCard = focusedCard;
        let branchDesiredTop = focusedViewportTop;
        const visitedBranchIds = new Set();
        while (branchCard && !visitedBranchIds.has(branchCard.id)) {
            visitedBranchIds.add(branchCard.id);
            const childGroup = getGroupElement(branchCard.id);
            if (!childGroup) break;
            queueAlignment(childGroup, branchDesiredTop);

            const firstChild = projectState.getChildCards(branchCard.id, branchCard.columnIndex + 1)[0];
            const firstChildElement = firstChild ? getCardElement(firstChild.id) : null;
            if (!firstChild || !firstChildElement) break;

            const firstChildOffset = firstChildElement.getBoundingClientRect().top
                - childGroup.getBoundingClientRect().top;
            branchDesiredTop += firstChildOffset;
            branchCard = firstChild;
        }

        for (const [container, { element, desiredViewportTop }] of scrollTargets) {
            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
            const desiredTopInsideContainer = desiredViewportTop - containerRect.top;
            container.scrollTo({
                top: Math.max(0, relativeTop - desiredTopInsideContainer),
                behavior: 'smooth'
            });
        }
    }

    function clearHighlights() {
        document.querySelectorAll('.card.highlight, .card.editing, .card-group.highlight').forEach(element => {
            element.classList.remove('highlight', 'editing');
        });
    }

    function highlightHierarchy(cardId) {
        clearHighlights();
        if (!projectState.getCard(cardId)) return;

        const relatedIds = [
            cardId,
            ...projectState.getAncestorIds(cardId),
            ...projectState.getDescendantIds(cardId)
        ];
        for (const relatedId of relatedIds) {
            getCardElement(relatedId)?.classList.add('highlight');
            getGroupElement(relatedId)?.classList.add('highlight');
        }
    }

    function focusCardTextarea(cardId, position = 'preserve') {
        const textarea = getCardElement(cardId)?.querySelector('textarea.card-content');
        if (!textarea) return;

        const documentPane = textarea.closest('.document-current');
        textarea.style.display = '';
        textarea.focus(documentPane ? { preventScroll: true } : undefined);
        requestAnimationFrame(() => {
            try {
                if (typeof position === 'number') {
                    const cursor = Math.max(0, Math.min(textarea.value.length, position));
                    textarea.setSelectionRange(cursor, cursor);
                } else if (position === 'start') {
                    textarea.setSelectionRange(0, 0);
                } else if (position === 'end') {
                    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                }
            } catch (error) {
                console.error(`Error setting selection range for card ${cardId}:`, error);
            }
            if (documentPane) {
                textarea.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            } else {
                scrollHierarchy(cardId);
            }
            highlightHierarchy(cardId);
        });
        console.log(`Focused card ${cardId}, position: ${position}`);
    }

    function createModal(title, contentHtml, submitButtonText, onSubmit, onCancel) {
        document.querySelector('.modal-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        modal.innerHTML = `
            <h4>${title}</h4>
            ${contentHtml}
            <div class="modal-actions">
                <button class="modal-cancel-btn">Cancel</button>
                <button class="modal-submit-btn primary">${submitButtonText}</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const submitButton = modal.querySelector('.modal-submit-btn');
        const closeModal = () => {
            overlay.remove();
            document.removeEventListener('keydown', handleKeyDown);
        };
        const cancel = () => {
            onCancel?.();
            closeModal();
        };
        const handleKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
            } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.target.tagName === 'TEXTAREA') {
                event.preventDefault();
                submitButton.click();
            }
        };

        modal.querySelector('.modal-cancel-btn').addEventListener('click', cancel);
        submitButton.addEventListener('click', () => {
            onSubmit(modal);
            closeModal();
        });
        overlay.addEventListener('click', event => {
            if (event.target === overlay) cancel();
        });
        document.addEventListener('keydown', handleKeyDown);

        const firstInput = modal.querySelector('input, textarea');
        if (firstInput) {
            firstInput.focus();
            firstInput.select?.();
        }
    }

    return {
        autoResizeTextarea,
        clearHighlights,
        createModal,
        focusCardTextarea,
        getCardElement,
        getColumnElementByIndex,
        getColumnIndex,
        getGroupElement,
        highlightHierarchy,
        scrollHierarchy,
        scrollIntoViewIfNeeded
    };
}

export { createEditorDom };
