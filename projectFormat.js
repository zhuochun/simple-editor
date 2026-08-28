const LEGACY_PROJECT_SCHEMA_VERSION = 1;
const CURRENT_PROJECT_SCHEMA_VERSION = 2;
const MIN_PROJECT_COLUMNS = 3;
const OPTION_SOURCES = new Set(['Manual', 'AI']);

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createColumnId() {
    return `col-${Date.now().toString(36)}${Math.random().toString(36).substring(2, 10)}`;
}

function failure(code, message) {
    return { ok: false, error: { code, message } };
}

function normalizeOptionSnapshot(sourceSnapshot, optionKey) {
    if (!isPlainObject(sourceSnapshot) || !Array.isArray(sourceSnapshot.cards)) {
        return failure('invalid-option-snapshot', `Option ${optionKey} must contain a snapshot cards array.`);
    }

    const seenCardIds = new Set();
    const normalizedSnapshotCards = [];
    for (const [index, sourceCard] of sourceSnapshot.cards.entries()) {
        if (!isPlainObject(sourceCard)) {
            return failure('invalid-option-snapshot-card', `Option ${optionKey} snapshot Card ${index} must be an object.`);
        }
        if (typeof sourceCard.id !== 'string' || !sourceCard.id.trim()) {
            return failure('invalid-option-snapshot-card-id', `Option ${optionKey} snapshot Card ${index} has an invalid ID.`);
        }
        if (seenCardIds.has(sourceCard.id)) {
            return failure('duplicate-option-snapshot-card', `Option ${optionKey} contains duplicate snapshot Card ID ${sourceCard.id}.`);
        }
        if (sourceCard.name !== undefined && sourceCard.name !== null && typeof sourceCard.name !== 'string') {
            return failure('invalid-option-snapshot-card-name', `Option ${optionKey} snapshot Card ${sourceCard.id} has an invalid name.`);
        }
        if (sourceCard.content !== undefined && typeof sourceCard.content !== 'string') {
            return failure('invalid-option-snapshot-card-content', `Option ${optionKey} snapshot Card ${sourceCard.id} has non-text content.`);
        }
        if (!Number.isFinite(sourceCard.order)) {
            return failure('invalid-option-snapshot-card-order', `Option ${optionKey} snapshot Card ${sourceCard.id} has an invalid order.`);
        }
        if ('parentId' in sourceCard || 'columnIndex' in sourceCard || 'color' in sourceCard) {
            return failure('invalid-option-snapshot-scope', `Option ${optionKey} snapshot Cards cannot store hierarchy or derived color fields.`);
        }

        seenCardIds.add(sourceCard.id);
        normalizedSnapshotCards.push({
            ...sourceCard,
            name: sourceCard.name ?? null,
            content: sourceCard.content ?? ''
        });
    }

    return {
        ok: true,
        value: {
            ...sourceSnapshot,
            cards: normalizedSnapshotCards
        },
        cardIds: seenCardIds
    };
}

function normalizeOptions(sourceOptions, normalizedCards) {
    if (!isPlainObject(sourceOptions)) {
        return failure('invalid-options', 'Version 2 project data must contain an options object.');
    }

    const normalizedOptions = {};
    for (const [optionKey, sourceOption] of Object.entries(sourceOptions)) {
        if (!isPlainObject(sourceOption)) {
            return failure('invalid-option', `Option ${optionKey} must be an object.`);
        }
        if (typeof sourceOption.id !== 'string' || sourceOption.id !== optionKey) {
            return failure('option-id-mismatch', `Option key ${optionKey} does not match its Option ID.`);
        }
        if (typeof sourceOption.cardId !== 'string' || !normalizedCards[sourceOption.cardId]) {
            return failure('missing-option-owner', `Option ${optionKey} references a missing owner Card.`);
        }
        if (!OPTION_SOURCES.has(sourceOption.source)) {
            return failure('invalid-option-source', `Option ${optionKey} has an invalid creation source.`);
        }
        if (!Number.isFinite(sourceOption.createdAt) || sourceOption.createdAt < 0) {
            return failure('invalid-option-created-at', `Option ${optionKey} has an invalid creation time.`);
        }

        const snapshotResult = normalizeOptionSnapshot(sourceOption.snapshot, optionKey);
        if (!snapshotResult.ok) return snapshotResult;
        if (!snapshotResult.cardIds.has(sourceOption.cardId)) {
            return failure('missing-option-owner-snapshot', `Option ${optionKey} snapshot does not contain its owner Card.`);
        }

        normalizedOptions[optionKey] = {
            ...sourceOption,
            snapshot: snapshotResult.value
        };
    }

    return { ok: true, value: normalizedOptions };
}

function normalizeProjectExport(payload, options = {}) {
    if (!isPlainObject(payload)) {
        return failure('invalid-envelope', 'The imported JSON must contain a project object.');
    }

    const schemaVersion = payload.schemaVersion ?? LEGACY_PROJECT_SCHEMA_VERSION;
    if (!Number.isInteger(schemaVersion) || ![LEGACY_PROJECT_SCHEMA_VERSION, CURRENT_PROJECT_SCHEMA_VERSION].includes(schemaVersion)) {
        const detail = Number.isInteger(schemaVersion) && schemaVersion > CURRENT_PROJECT_SCHEMA_VERSION
            ? `Project format version ${schemaVersion} is newer than the supported version ${CURRENT_PROJECT_SCHEMA_VERSION}.`
            : `Project format version ${schemaVersion} is not supported.`;
        return failure('unsupported-version', detail);
    }

    if (!isPlainObject(payload.data)) {
        return failure('invalid-data', 'The imported project must contain a data object.');
    }
    if (!Array.isArray(payload.data.columns)) {
        return failure('invalid-columns', 'Project data must contain a columns array.');
    }
    if (!isPlainObject(payload.data.cards)) {
        return failure('invalid-cards', 'Project data must contain a cards object.');
    }
    if (schemaVersion === LEGACY_PROJECT_SCHEMA_VERSION && Object.hasOwn(payload.data, 'options')) {
        return failure('options-require-version-2', 'Project Options require schema version 2.');
    }

    const generateColumnId = options.generateColumnId || createColumnId;
    const normalizedColumns = [];

    for (let index = 0; index < payload.data.columns.length; index++) {
        const sourceColumn = payload.data.columns[index];
        if (!isPlainObject(sourceColumn)) {
            return failure('invalid-column', `Column ${index} must be an object.`);
        }
        if (sourceColumn.id !== undefined && (typeof sourceColumn.id !== 'string' || !sourceColumn.id.trim())) {
            return failure('invalid-column-id', `Column ${index} has an invalid ID.`);
        }
        if (sourceColumn.prompt !== undefined && typeof sourceColumn.prompt !== 'string') {
            return failure('invalid-column-prompt', `Column ${index} has a non-text prompt.`);
        }
        normalizedColumns.push({
            ...sourceColumn,
            id: sourceColumn.id || generateColumnId(),
            prompt: sourceColumn.prompt ?? ''
        });
    }

    while (normalizedColumns.length < MIN_PROJECT_COLUMNS) {
        normalizedColumns.push({ id: generateColumnId(), prompt: '' });
    }

    const normalizedCards = {};
    for (const [cardKey, sourceCard] of Object.entries(payload.data.cards)) {
        if (!isPlainObject(sourceCard)) {
            return failure('invalid-card', `Card ${cardKey} must be an object.`);
        }
        if (typeof sourceCard.id !== 'string' || sourceCard.id !== cardKey) {
            return failure('card-id-mismatch', `Card key ${cardKey} does not match its card ID.`);
        }
        if (sourceCard.parentId !== null && typeof sourceCard.parentId !== 'string') {
            return failure('invalid-parent', `Card ${cardKey} must have a parent ID or null.`);
        }
        if (!Number.isInteger(sourceCard.columnIndex) || sourceCard.columnIndex < 0 || sourceCard.columnIndex >= normalizedColumns.length) {
            return failure('invalid-column-index', `Card ${cardKey} has an invalid column index.`);
        }
        if (!Number.isFinite(sourceCard.order)) {
            return failure('invalid-order', `Card ${cardKey} has an invalid order.`);
        }
        if (sourceCard.content !== undefined && typeof sourceCard.content !== 'string') {
            return failure('invalid-content', `Card ${cardKey} has non-text content.`);
        }
        if (sourceCard.name !== undefined && sourceCard.name !== null && typeof sourceCard.name !== 'string') {
            return failure('invalid-name', `Card ${cardKey} has an invalid name.`);
        }

        normalizedCards[cardKey] = {
            ...sourceCard,
            name: sourceCard.name ?? null,
            content: sourceCard.content ?? '',
            color: ''
        };
    }

    for (const card of Object.values(normalizedCards)) {
        if (card.parentId === null) {
            if (card.columnIndex !== 0) {
                return failure('root-column-mismatch', `Root card ${card.id} must be in column 0.`);
            }
            continue;
        }

        const parent = normalizedCards[card.parentId];
        if (!parent) {
            return failure('missing-parent', `Card ${card.id} references a missing parent.`);
        }
        if (card.columnIndex !== parent.columnIndex + 1) {
            return failure('child-column-mismatch', `Card ${card.id} must be in the column immediately after its parent.`);
        }
    }

    const visitState = new Map();
    function visit(cardId) {
        const state = visitState.get(cardId);
        if (state === 'visiting') return false;
        if (state === 'visited') return true;

        visitState.set(cardId, 'visiting');
        const parentId = normalizedCards[cardId].parentId;
        if (parentId && !visit(parentId)) return false;
        visitState.set(cardId, 'visited');
        return true;
    }

    for (const cardId of Object.keys(normalizedCards)) {
        if (!visit(cardId)) {
            return failure('cyclic-hierarchy', 'The imported card hierarchy contains a cycle.');
        }
    }

    const title = typeof payload.title === 'string' && payload.title.trim()
        ? payload.title.trim()
        : 'Imported Project';
    const globalPrompt = payload.data.globalPrompt ?? '';
    if (typeof globalPrompt !== 'string') {
        return failure('invalid-global-prompt', 'The project global prompt must be text.');
    }

    const optionsResult = schemaVersion === CURRENT_PROJECT_SCHEMA_VERSION
        ? normalizeOptions(payload.data.options, normalizedCards)
        : { ok: true, value: {} };
    if (!optionsResult.ok) return optionsResult;

    return {
        ok: true,
        value: {
            title,
            data: {
                ...payload.data,
                columns: normalizedColumns,
                cards: normalizedCards,
                globalPrompt,
                options: optionsResult.value
            }
        }
    };
}

function parseProjectExport(jsonText, options = {}) {
    try {
        return normalizeProjectExport(JSON.parse(jsonText), options);
    } catch (error) {
        return failure('invalid-json', `The imported file is not valid JSON: ${error.message}`);
    }
}

function createProjectExport(project) {
    return {
        schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
        title: project.title,
        data: {
            ...project.data,
            options: project.data.options ?? {}
        }
    };
}

function projectToPlainText(project) {
    if (!project?.data || !isPlainObject(project.data.cards)) return '';

    const cards = project.data.cards;
    const childrenByParent = new Map();
    for (const card of Object.values(cards)) {
        const parentKey = card.parentId || null;
        if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
        childrenByParent.get(parentKey).push(card);
    }
    for (const children of childrenByParent.values()) {
        children.sort((left, right) => left.order - right.order);
    }

    const content = [];
    function append(card) {
        if (card.content?.trim()) content.push(card.content.trim());
        for (const child of childrenByParent.get(card.id) || []) append(child);
    }
    for (const root of childrenByParent.get(null) || []) append(root);
    return content.join('\n\n');
}

export {
    CURRENT_PROJECT_SCHEMA_VERSION,
    createProjectExport,
    normalizeProjectExport,
    parseProjectExport,
    projectToPlainText
};
