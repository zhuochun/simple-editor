function createEditorDom({
    projectState,
    columnsContainer,
    cardNameMaxLength = 50,
    groupHeaderPreviewLength = 60
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
        if (!cardElement) return;

        const scrolledContainers = new Set();
        const scrollToTarget = (container, targetElement, center = true, scrollToTopIfTaller = false) => {
            if (!container || !targetElement || scrolledContainers.has(container)) return;

            const containerRect = container.getBoundingClientRect();
            const elementRect = targetElement.getBoundingClientRect();
            const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
            let targetScroll = relativeTop;
            if (!(scrollToTopIfTaller && elementRect.height > window.innerHeight) && center) {
                targetScroll = relativeTop - (container.clientHeight / 2) + (elementRect.height / 2);
            }
            container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
            scrolledContainers.add(container);
        };

        scrollToTarget(
            cardElement.closest('.column')?.querySelector('.cards-container'),
            cardElement,
            true
        );

        for (const ancestorId of projectState.getAncestorIds(cardId)) {
            const ancestorElement = getCardElement(ancestorId);
            scrollToTarget(
                ancestorElement?.closest('.column')?.querySelector('.cards-container'),
                ancestorElement,
                true
            );
        }

        const descendantIds = projectState.getDescendantIds(cardId);
        for (const currentId of [cardId, ...descendantIds]) {
            const card = projectState.getCard(currentId);
            const groupElement = getGroupElement(currentId);
            if (!card || !groupElement) continue;

            const groupColumn = groupElement.closest('.column');
            const groupColumnIndex = groupColumn ? Number.parseInt(groupColumn.dataset.columnIndex, 10) : -1;
            if (groupColumnIndex === card.columnIndex + 1) {
                scrollToTarget(
                    groupColumn.querySelector('.cards-container'),
                    groupElement,
                    true,
                    true
                );
            }
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

    function updateGroupHeaderDisplay(parentCardId) {
        const groupElement = getGroupElement(parentCardId);
        const parentCard = projectState.getCard(parentCardId);
        const header = groupElement?.querySelector('.group-header');
        if (!header || !parentCard) return;

        if (parentCard.name) {
            const truncatedName = parentCard.name.length > cardNameMaxLength
                ? `${parentCard.name.substring(0, cardNameMaxLength)}...`
                : parentCard.name;
            header.textContent = `>> ${truncatedName}`;
            header.title = `Children of ${parentCard.name}`;
            return;
        }

        const idPart = `#${parentCardId.slice(-4)}`;
        const trimmedContent = parentCard.content?.trim() || '';
        const preview = trimmedContent.substring(0, groupHeaderPreviewLength);
        const ellipsis = trimmedContent.length > groupHeaderPreviewLength ? '...' : '';
        header.textContent = `>> ${idPart}${preview ? `: ${preview}${ellipsis}` : ''}`;
        header.title = `Children of ${idPart}${preview ? `: ${trimmedContent}` : ''}`;
    }

    function focusCardTextarea(cardId, position = 'preserve') {
        const textarea = getCardElement(cardId)?.querySelector('textarea.card-content');
        if (!textarea) return;

        textarea.style.display = '';
        textarea.focus();
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
            scrollHierarchy(cardId);
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
        scrollIntoViewIfNeeded,
        updateGroupHeaderDisplay
    };
}

export { createEditorDom };
