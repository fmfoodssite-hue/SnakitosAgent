import OpenAI from "openai";
import { config } from "../config";
let clientInstance = null;
function getOpenAiClient() {
    if (!config.openai.apiKey) {
        throw new Error("OPENAI_API_KEY is not configured.");
    }
    if (!clientInstance) {
        clientInstance = new OpenAI({
            apiKey: config.openai.apiKey,
        });
    }
    return clientInstance;
}
export const openaiClient = new Proxy({}, {
    get(_target, property) {
        const client = getOpenAiClient();
        return Reflect.get(client, property);
    },
});
const SYSTEM_PROMPT = [
    "You are Snakitos customer support for snakitos.com.",
    "Never hallucinate order, shipping, product, or policy details.",
    "Only use the backend data provided in the assistant context.",
    "If information is missing, clearly ask for the missing field instead of guessing.",
    "For order tracking, require both order ID and phone number.",
    "Keep replies polite, human, and concise.",
    "If verification failed or the backend says data is unavailable, say so plainly and suggest WhatsApp support.",
].join(" ");
export class AiService {
    async generateResponse(input) {
        const completion = await getOpenAiClient().chat.completions.create({
            model: config.app.openAiModel,
            temperature: 0.2,
            max_tokens: 350,
            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPT,
                },
                {
                    role: "assistant",
                    content: this.buildStructuredContext(input.intent, input.context),
                },
                {
                    role: "user",
                    content: input.userMessage,
                },
            ],
        });
        return (completion.choices[0]?.message?.content?.trim() ||
            "I could not generate a response right now.");
    }
    buildStructuredContext(intent, context) {
        return JSON.stringify({
            intent,
            backend_context: context,
            instructions: "Respond using backend_context only.",
        }, null, 2);
    }
}
export const aiService = new AiService();
