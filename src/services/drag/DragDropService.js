export const CSS_CLASSES = {
    DRAGGING: 'dragging',
    INDICATOR: 'drag-over-indicator',
    OVER_CARD: 'drag-over-card',
    OVER_GROUP: 'drag-over-group',
    OVER_EMPTY: 'drag-over-empty',
    OVER_PARENT: 'drag-over-parent'
};

export const SCROLL_SPEED = 10;
export const SCROLL_TRIGGER_ZONE_HEIGHT = 50;

export default class DragDropService {
    constructor(dataService, domHelpers = {}) {
        this.dataService = dataService;
        this.getCardElement = domHelpers.getCardElement || (() => null);
        this.getColumnIndex = domHelpers.getColumnIndex || (() => -1);

        this.draggedCardId = null;
        this.draggedElement = null;
        this.dragIndicator = null;
        this.scrollIntervalId = null;
        this.currentScrollContainer = null;
        this.scrollAnimationFrameId = null;
        this.getCardData = (id) => this.dataService.getCard(id);
        this.moveCardData = (...args) => this.dataService.moveCardData(...args);

        this.handleDragStart = this.handleDragStart.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);
        this.handleDragOver = this.handleDragOver.bind(this);
        this.handleDragEnter = this.handleDragEnter.bind(this);
        this.handleDragLeave = this.handleDragLeave.bind(this);
        this.handleDrop = this.handleDrop.bind(this);
    }

    ensureDragIndicator() {
        if (!this.dragIndicator) {
            this.dragIndicator = document.createElement('div');
            this.dragIndicator.className = CSS_CLASSES.INDICATOR;
            this.dragIndicator.style.display = 'none';
            document.body.appendChild(this.dragIndicator);
        }
    }

    clearDragStyles(removeIndicatorInstance = true) {
        const classesToRemove = [
            CSS_CLASSES.OVER_CARD,
            CSS_CLASSES.OVER_GROUP,
            CSS_CLASSES.OVER_EMPTY,
            CSS_CLASSES.OVER_PARENT
        ];
        document.querySelectorAll(`.${classesToRemove.join(', .')}`).forEach(el => {
            el.classList.remove(...classesToRemove);
        });
        if (this.dragIndicator) {
            this.dragIndicator.style.display = 'none';
            if (removeIndicatorInstance && this.dragIndicator.parentNode) {
                this.dragIndicator.parentNode.removeChild(this.dragIndicator);
                this.dragIndicator = null;
            }
        }
    }

    setCompactMode(enabled) {
        document.body.classList.toggle('dragging-cards', enabled);
    }

    stopScrolling() {
        if (this.scrollAnimationFrameId) {
            cancelAnimationFrame(this.scrollAnimationFrameId);
            this.scrollAnimationFrameId = null;
        }
        this.currentScrollContainer = null;
    }

    startScrolling(container, direction) {
        if (this.currentScrollContainer === container && this.scrollAnimationFrameId) {
            return;
        }
        this.stopScrolling();
        this.currentScrollContainer = container;

        const scroll = () => {
            if (!this.currentScrollContainer || this.currentScrollContainer !== container) {
                this.scrollAnimationFrameId = null;
                return;
            }
            const amount = direction === 'up' ? -SCROLL_SPEED : SCROLL_SPEED;
            this.currentScrollContainer.scrollTop += amount;
            this.scrollAnimationFrameId = requestAnimationFrame(scroll);
        };
        this.scrollAnimationFrameId = requestAnimationFrame(scroll);
    }

    attachTouchDragSupport(container) {
        let touchDataTransfer = null;
        let touchDragTarget = null;

        container.addEventListener('touchstart', (e) => {
            const header = e.target.closest('.card-header');
            if (!header) return;
            e.preventDefault();
            touchDragTarget = header;
            touchDataTransfer = new DataTransfer();
            this.handleDragStart({ target: header, dataTransfer: touchDataTransfer, preventDefault: () => {} });
        }, { passive: false });

        container.addEventListener('touchmove', (e) => {
            if (!touchDataTransfer) return;
            e.preventDefault();
            const touch = e.touches[0];
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            this.handleDragOver({ ...e, target: element, clientX: touch.clientX, clientY: touch.clientY, dataTransfer: touchDataTransfer, preventDefault: () => {} });
        }, { passive: false });

        container.addEventListener('touchend', (e) => {
            if (!touchDataTransfer) return;
            e.preventDefault();
            const touch = e.changedTouches[0];
            const element = document.elementFromPoint(touch.clientX, touch.clientY);
            this.handleDrop({ ...e, target: element, clientX: touch.clientX, clientY: touch.clientY, dataTransfer: touchDataTransfer, preventDefault: () => {} });
            this.handleDragEnd(e);
            touchDataTransfer = null;
            touchDragTarget = null;
        });

        container.addEventListener('touchcancel', () => {
            if (touchDragTarget) {
                this.handleDragEnd({ target: touchDragTarget });
            }
            touchDataTransfer = null;
            touchDragTarget = null;
        });
    }

    handleDragStart(event) {
        if (event.target.tagName === 'BUTTON' || event.target.closest('button')) {
            event.preventDefault();
            return;
        }
        const headerEl = event.target.closest('.card-header');
        const cardEl = headerEl ? headerEl.closest('.card') : null;
        if (!cardEl) {
            event.preventDefault();
            return;
        }
        const cardId = cardEl.dataset.cardId;
        if (!this.getCardData(cardId)) {
            event.preventDefault();
            this.draggedCardId = null;
            return;
        }
        this.draggedCardId = cardId;
        this.draggedElement = cardEl;
        event.dataTransfer.setData('text/plain', cardId);
        event.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(() => {
            if (this.draggedElement === cardEl) {
                this.draggedElement.classList.add(CSS_CLASSES.DRAGGING);
            }
        });
        this.ensureDragIndicator();
        this.setCompactMode(true);
    }

    handleDragEnd(event) {
        if (this.draggedElement) {
            this.draggedElement.classList.remove(CSS_CLASSES.DRAGGING);
        } else if (this.draggedCardId) {
            const cardEl = this.getCardElement(this.draggedCardId);
            if (cardEl) cardEl.classList.remove(CSS_CLASSES.DRAGGING);
        }
        this.stopScrolling();
        this.clearDragStyles(true);
        this.setCompactMode(false);
        this.draggedCardId = null;
        this.draggedElement = null;
    }

    handleDragOver(event) {
        event.preventDefault();
        if (!this.draggedCardId) return;

        event.dataTransfer.dropEffect = 'move';
        this.ensureDragIndicator();

        const targetElement = event.target;
        const targetCard = targetElement.closest('.card');
        const targetGroup = targetElement.closest('.card-group');
        const targetCardsContainer = targetElement.closest('.cards-container');
        const scrollContainer = targetCardsContainer || targetGroup?.closest('.cards-container');

        this.clearDragStyles(false);

        if (scrollContainer) {
            const rect = scrollContainer.getBoundingClientRect();
            const mouseY = event.clientY;

            if (mouseY < rect.top + SCROLL_TRIGGER_ZONE_HEIGHT) {
                this.startScrolling(scrollContainer, 'up');
            } else if (mouseY > rect.bottom - SCROLL_TRIGGER_ZONE_HEIGHT) {
                this.startScrolling(scrollContainer, 'down');
            } else if (this.currentScrollContainer === scrollContainer) {
                this.stopScrolling();
            }
        } else {
            this.stopScrolling();
        }

        let validDropTarget = false;
        let indicatorParent = null;
        let indicatorNextSibling = null;
        let isOverParentTarget = false;

        if (targetCard && targetCard.dataset.cardId === this.draggedCardId) {
            validDropTarget = false;
        } else if (targetCard) {
            targetCard.classList.add(CSS_CLASSES.OVER_PARENT);
            isOverParentTarget = true;
            validDropTarget = true;
            if (this.dragIndicator) this.dragIndicator.style.display = 'none';
        } else if (targetGroup) {
            const groupParentId = targetGroup.dataset.parentId;
            if (groupParentId === this.draggedCardId) {
                validDropTarget = false;
            } else {
                targetGroup.classList.add(CSS_CLASSES.OVER_GROUP);
                validDropTarget = true;
                const cardsInGroup = Array.from(targetGroup.querySelectorAll(':scope > .card'));
                let closestCard = null;
                let smallest = Infinity;
                cardsInGroup.forEach(card => {
                    const r = card.getBoundingClientRect();
                    const dist = Math.abs(event.clientY - (r.top + r.height / 2));
                    if (dist < smallest) { smallest = dist; closestCard = card; }
                });
                indicatorParent = targetGroup;
                if (closestCard) {
                    const r = closestCard.getBoundingClientRect();
                    indicatorNextSibling = (event.clientY < r.top + r.height / 2) ? closestCard : closestCard.nextSibling;
                } else {
                    indicatorNextSibling = targetGroup.firstElementChild?.classList.contains('group-header') ? targetGroup.firstElementChild.nextSibling : null;
                }
            }
        } else if (targetCardsContainer) {
            targetCardsContainer.classList.add(CSS_CLASSES.OVER_EMPTY);
            validDropTarget = true;
            indicatorParent = targetCardsContainer;
            indicatorNextSibling = targetCardsContainer.firstElementChild;
        } else {
            validDropTarget = false;
        }

        if (validDropTarget && !isOverParentTarget && this.dragIndicator) {
            this.dragIndicator.style.display = '';
            if (indicatorParent) {
                indicatorParent.insertBefore(this.dragIndicator, indicatorNextSibling);
            }
        }
    }

    handleDragEnter(event) {
        event.preventDefault();
    }

    handleDragLeave(event) {
        if (this.currentScrollContainer && !event.currentTarget.contains(event.relatedTarget)) {
            this.stopScrolling();
        }
    }

    handleDrop(event) {
        event.preventDefault();
        if (!this.draggedCardId) return;

        const droppedCardId = this.draggedCardId;
        const targetElement = event.target;
        const targetCard = targetElement.closest('.card');
        const targetGroup = targetElement.closest('.card-group');
        const targetCardsContainer = targetElement.closest('.cards-container');

        let targetColumnIndex = -1;
        let newParentId = null;
        let insertBeforeCardId = null;

        if (targetCard && targetCard.dataset.cardId !== droppedCardId) {
            newParentId = targetCard.dataset.cardId;
            targetColumnIndex = this.getColumnIndex(targetCard) + 1;
        } else if (targetGroup) {
            newParentId = targetGroup.dataset.parentId || null;
            targetColumnIndex = this.getColumnIndex(targetGroup.closest('.card')) + 1;
            if (this.dragIndicator && this.dragIndicator.parentNode === targetGroup) {
                const insertBeforeElement = this.dragIndicator.nextElementSibling;
                if (insertBeforeElement && insertBeforeElement.classList.contains('card')) {
                    insertBeforeCardId = insertBeforeElement.dataset.cardId;
                } else if (insertBeforeElement && insertBeforeElement.classList.contains('card-group')) {
                    const firstCard = insertBeforeElement.querySelector('.card');
                    insertBeforeCardId = firstCard ? firstCard.dataset.cardId : null;
                } else {
                    insertBeforeCardId = null;
                }
            } else {
                insertBeforeCardId = null;
            }
        } else if (targetCardsContainer) {
            targetColumnIndex = this.getColumnIndex(targetCardsContainer.closest('.card'));
            if (this.dragIndicator && this.dragIndicator.parentNode === targetCardsContainer) {
                const insertBeforeElement = this.dragIndicator.nextElementSibling;
                if (insertBeforeElement && insertBeforeElement.classList.contains('card')) {
                    insertBeforeCardId = insertBeforeElement.dataset.cardId;
                } else if (insertBeforeElement && insertBeforeElement.classList.contains('card-group')) {
                    const firstCardInGroup = insertBeforeElement.querySelector('.card');
                    insertBeforeCardId = firstCardInGroup ? firstCardInGroup.dataset.cardId : null;
                } else {
                    insertBeforeCardId = null;
                }
            } else {
                insertBeforeCardId = null;
            }
        } else {
            this.clearDragStyles(true);
            this.draggedCardId = null;
            this.draggedElement = null;
            return;
        }

        if (targetColumnIndex === -1) {
            this.clearDragStyles(true);
            this.draggedCardId = null;
            this.draggedElement = null;
            return;
        }

        const moveResult = this.moveCardData(droppedCardId, targetColumnIndex, newParentId, insertBeforeCardId);
        this.clearDragStyles(true);
        this.draggedCardId = null;
        this.draggedElement = null;
        return moveResult;
    }

    attach(container, dataHelpers = {}, domHelpers = {}) {
        if (dataHelpers.getCard) this.getCardData = dataHelpers.getCard;
        if (dataHelpers.moveCardData) this.moveCardData = dataHelpers.moveCardData;
        if (domHelpers.getCardElement) this.getCardElement = domHelpers.getCardElement;
        if (domHelpers.getColumnIndex) this.getColumnIndex = domHelpers.getColumnIndex;

        container.addEventListener('dragstart', this.handleDragStart);
        container.addEventListener('dragend', this.handleDragEnd);
        container.addEventListener('dragover', this.handleDragOver);
        container.addEventListener('dragenter', this.handleDragEnter);
        container.addEventListener('dragleave', this.handleDragLeave);
        container.addEventListener('drop', this.handleDrop);
        this.attachTouchDragSupport(container);
    }
}
