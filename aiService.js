import * as data from './data.js';
import AIService, { AI_SERVICE_CONFIG } from './src/services/ai/AIService.js';

const aiServiceInstance = new AIService(data);

export const initializeAiSettings = (...args) => aiServiceInstance.initializeAiSettings(...args);
export const areAiSettingsValid = (...args) => aiServiceInstance.areAiSettingsValid(...args);
export const generateContinuation = (...args) => aiServiceInstance.generateContinuation(...args);
export const generateSummary = (...args) => aiServiceInstance.generateSummary(...args);
export const generateBreakdown = (...args) => aiServiceInstance.generateBreakdown(...args);
export const generateExpand = (...args) => aiServiceInstance.generateExpand(...args);
export const generateCustom = (...args) => aiServiceInstance.generateCustom(...args);

export const aiService = {
    initializeAiSettings,
    areAiSettingsValid,
    generateContinuation,
    generateSummary,
    generateBreakdown,
    generateExpand,
    generateCustom
};

export { AI_SERVICE_CONFIG };
