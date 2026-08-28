import test from 'node:test';
import assert from 'node:assert/strict';

import { AI_SERVICE_CONFIG, createAiService, normalizeAiSettings } from '../aiService.js';

function createStorage(initialValue = null) {
    const values = new Map();
    if (initialValue !== null) {
        values.set(AI_SERVICE_CONFIG.STORAGE_KEY_AI_SETTINGS, JSON.stringify(initialValue));
    }
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        read: key => values.get(key) ?? null
    };
}

function createSseResponse(events) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            for (const event of events) controller.enqueue(encoder.encode(`data: ${event}\n\n`));
            controller.close();
        }
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

test('defaults an unconfigured browser to the OpenAI Thinking preset', () => {
    const settings = normalizeAiSettings();

    assert.equal(settings.provider, 'openai');
    assert.equal(settings.protocol, 'responses');
    assert.equal(settings.providerUrl, 'https://api.openai.com/v1/responses');
    assert.equal(settings.modelName, 'gpt-5.6-sol');
    assert.equal(settings.reasoningEffort, 'medium');
    assert.equal(settings.isValid, false);
});

test('normalizes the OpenAI preset to GPT-5.6 Sol and Responses while ignoring legacy temperature', () => {
    const settings = normalizeAiSettings({
        providerUrl: 'https://api.openai.com/v1/completions',
        modelName: '',
        apiKey: 'secret',
        temperature: '0.7'
    });

    assert.deepEqual(settings, {
        provider: 'openai',
        protocol: 'responses',
        providerUrl: 'https://api.openai.com/v1/responses',
        modelName: 'gpt-5.6-sol',
        apiKey: 'secret',
        reasoningEffort: 'medium',
        isValid: true
    });
    assert.equal('temperature' in settings, false);
});

test('persists the compatible settings key without temperature', () => {
    const storage = createStorage();
    const service = createAiService({ storage, fetchImpl: async () => { throw new Error('not used'); } });

    service.saveAiSettings({
        provider: 'openai',
        apiKey: 'secret',
        modelName: 'gpt-5.6-sol',
        reasoningEffort: 'high'
    });

    const persisted = JSON.parse(storage.read(AI_SERVICE_CONFIG.STORAGE_KEY_AI_SETTINGS));
    assert.equal(persisted.providerUrl, 'https://api.openai.com/v1/responses');
    assert.equal(persisted.protocol, 'responses');
    assert.equal(persisted.reasoningEffort, 'high');
    assert.equal('temperature' in persisted, false);
});

test('rejects a non-URL Custom endpoint before enabling or persisting AI', () => {
    const storage = createStorage();
    const service = createAiService({ storage, fetchImpl: async () => { throw new Error('not used'); } });
    const draft = {
        provider: 'custom',
        protocol: 'responses',
        providerUrl: 'not-a-url',
        modelName: 'test-model',
        apiKey: 'secret'
    };

    assert.equal(normalizeAiSettings(draft).isValid, false);
    assert.throws(() => service.saveAiSettings(draft), /complete http:\/\/ or https:\/\/ URL/i);
    assert.equal(storage.read(AI_SERVICE_CONFIG.STORAGE_KEY_AI_SETTINGS), null);
    assert.equal(service.areAiSettingsValid(), false);
});

test('builds an OpenAI Responses request and streams output_text deltas', async () => {
    let captured;
    const storage = createStorage({
        provider: 'openai',
        modelName: 'gpt-5.6-sol',
        apiKey: 'secret',
        reasoningEffort: 'medium'
    });
    const service = createAiService({
        storage,
        fetchImpl: async (url, options) => {
            captured = { url, options };
            return createSseResponse([
                JSON.stringify({ type: 'response.output_text.delta', delta: 'Hello' }),
                JSON.stringify({ type: 'response.output_text.delta', delta: ' world' }),
                JSON.stringify({ type: 'response.completed', response: { model: 'gpt-5.6-sol' } })
            ]);
        }
    });
    service.loadAiSettings();
    const chunks = [];

    const handle = service.generateContinuation({
        context: { currentCardContent: 'Source' },
        placement: { targetKind: 'card' },
        onChunk: chunk => chunks.push(chunk)
    });

    assert.equal(await handle.promise, 'Hello world');
    assert.equal(captured.url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(captured.options.body);
    assert.equal(body.model, 'gpt-5.6-sol');
    assert.deepEqual(body.reasoning, { effort: 'medium' });
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.equal('temperature' in body, false);
    assert.equal('messages' in body, false);
    assert.match(body.input, /Source/);
    assert.deepEqual(chunks, ['Hello', ' world']);
});

test('keeps Chat Completions support for OpenRouter without temperature', async () => {
    let captured;
    const service = createAiService({
        storage: createStorage(),
        fetchImpl: async (url, options) => {
            captured = { url, options };
            return createSseResponse([
                JSON.stringify({ choices: [{ delta: { content: 'Chat' } }] }),
                '[DONE]'
            ]);
        }
    });
    service.saveAiSettings({
        provider: 'openrouter',
        modelName: 'openai/gpt-5.6-sol',
        apiKey: 'secret'
    });

    const handle = service.generateExpand({ context: { currentCardContent: 'Source' } });

    assert.equal(await handle.promise, 'Chat');
    assert.equal(captured.url, 'https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(captured.options.body);
    assert.ok(Array.isArray(body.messages));
    assert.equal('temperature' in body, false);
    assert.equal(captured.options.headers['HTTP-Referer'], AI_SERVICE_CONFIG.SITE_URL);
});

test('cancels an in-flight request with a stable error code', async () => {
    const service = createAiService({
        storage: createStorage(),
        fetchImpl: (url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            });
        })
    });
    service.saveAiSettings({ provider: 'openai', modelName: 'gpt-5.6-sol', apiKey: 'secret' });

    const handle = service.generateSummary({ context: { currentCardContent: 'Source' } });
    handle.cancel();

    await assert.rejects(handle.promise, error => error.code === 'cancelled');
});

test('times out a stalled request with a distinct retryable error', async () => {
    const service = createAiService({
        storage: createStorage(),
        requestTimeoutMs: 1,
        setTimeoutImpl: callback => {
            queueMicrotask(callback);
            return 1;
        },
        clearTimeoutImpl() {},
        fetchImpl: (url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            });
        })
    });
    service.saveAiSettings({ provider: 'openai', modelName: 'gpt-5.6-sol', apiKey: 'secret' });

    const handle = service.generateSummary({ context: { currentCardContent: 'Source' } });

    await assert.rejects(handle.promise, error => error.code === 'timeout');
});
