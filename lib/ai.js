import { aiService, openaiClient } from "../services/ai.service";
export const generateSupportResponse = aiService.generateResponse.bind(aiService);
export default openaiClient;
