import * as data from './data.js';
import DragDropService, { CSS_CLASSES, SCROLL_SPEED, SCROLL_TRIGGER_ZONE_HEIGHT } from './src/services/drag/DragDropService.js';

const dragDropServiceInstance = new DragDropService(data);

export const attachDragDrop = (container, dataHelpers, domHelpers) => dragDropServiceInstance.attach(container, dataHelpers, domHelpers);

export const dragDropService = {
    attach: attachDragDrop
};

export { CSS_CLASSES, SCROLL_SPEED, SCROLL_TRIGGER_ZONE_HEIGHT };
