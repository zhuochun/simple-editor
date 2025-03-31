const AI_SERVICE_CONFIG = {
    SITE_URL: "http://localhost:8080", // Or your deployed URL
    SITE_NAME: "Interactive Writing Tool",
    STORAGE_KEY_AI_SETTINGS: 'writingToolAiSettings'
};

function getAiSettings() {
    const settingsStr = localStorage.getItem(AI_SERVICE_CONFIG.STORAGE_KEY_AI_SETTINGS);
    if (!settingsStr) {
        return { providerUrl: '', modelName: '', apiKey: '', isValid: false };
    }
    try {
        const settings = JSON.parse(settingsStr);
        const isValid = !!(settings.providerUrl && settings.modelName && settings.apiKey);
        return { ...settings, isValid };
    } catch (e) {
        console.error("Error parsing AI settings:", e);
        return { providerUrl: '', modelName: '', apiKey: '', isValid: false };
    }
}

async function streamChatCompletion({ messages, onChunk, onError, onDone }) {
    const settings = getAiSettings();
    if (!settings.isValid) {
        onError(new Error("AI settings are incomplete. Please configure them in the sidebar."));
        return;
    }

    try {
        const response = await fetch(settings.providerUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${settings.apiKey}`,
                "HTTP-Referer": AI_SERVICE_CONFIG.SITE_URL,
                "X-Title": AI_SERVICE_CONFIG.SITE_NAME,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: settings.modelName,
                messages: messages,
                stream: true // Enable streaming
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
            throw new Error(`API Error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
        }

        if (!response.body) {
            throw new Error("Response body is null");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let contentAccumulator = ''; // Accumulate content across chunks

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            // Process line by line for SSE
            let lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep the last partial line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.substring(6).trim();
                    if (dataStr === '[DONE]') {
                        break; // Stream finished signal
                    }
                    try {
                        const data = JSON.parse(dataStr);
                        const delta = data.choices?.[0]?.delta?.content;
                        if (delta) {
                            contentAccumulator += delta;
                            onChunk(delta); // Send only the new part
                        }
                    } catch (e) {
                        console.warn("Error parsing stream chunk:", e, "Data:", dataStr);
                        // Continue processing other lines/chunks
                    }
                }
            }
        }
        onDone(contentAccumulator); // Pass the full accumulated content when done

    } catch (error) {
        console.error("AI Service Error:", error);
        onError(error);
    }
}

// Export functions or the service object if preferred
const aiService = {
    getAiSettings,
    streamChatCompletion
};