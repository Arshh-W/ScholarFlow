import { GoogleGenAI } from "@google/genai";
import { UploadedFile } from '../types';

// Ensure API Key is available
const apiKey = process.env.API_KEY || ''; 
const ai = new GoogleGenAI({ apiKey });

// --- AGENT: HISTORIAN ---
// Task: Pre-process heavy documents into condensed knowledge so the Teacher is fast.
// Model: Gemini 3.0 Pro with Thinking Budget for deep analysis.
export const processDocumentWithHistorian = async (file: UploadedFile): Promise<string> => {
    if (!apiKey || !file.data) return "Error: No API Key or File Data";

    try {
        const mimeType = file.type || 'application/pdf'; 
        const data = file.data.split(',')[1] || file.data;

        // Model: Gemini 3.0 Pro (Preview)
        // Feature: Thinking Config enabled for deep reasoning on document structure and content
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: {
                parts: [
                    { 
                        text: "You are the Historian Agent. Analyze this document deeply. Extract the core philosophy, key facts, date-based events, and structural arguments. Create a dense knowledge summary for the Teacher Agent." 
                    },
                    {
                        inlineData: {
                            mimeType,
                            data
                        }
                    }
                ]
            },
            config: {
                // Enable thinking for better analysis of complex docs
                thinkingConfig: {
                    thinkingBudget: 4096 
                }
            }
        });

        return response.text || "The Historian could not extract text from this document.";
    } catch (error) {
        console.error("Historian Processing Error:", error);
        return "Error reading document. Please ensure it is a valid text-based PDF or image.";
    }
}

// --- AGENT: TEACHER ---
// Task: Quick Socratic reasoning using pre-processed context.
// UPGRADE: Switched to Gemini 3.0 Flash for valid low-latency chat (Fixing 404 on 2.5).
export const generateTeacherResponse = async (
    history: { role: string, content: string }[], 
    newMessage: string,
    contextNotes: string 
) => {
  if (!apiKey) throw new Error("API Key Missing");

  try {
    // Model: Gemini 3 Flash Preview (Valid Flash Model)
    const model = 'gemini-3-flash-preview';
    
    const systemInstruction = `You are a Socratic Teacher for ScholarFlow. 
    
    CONTEXT (Provided by Historian Agent):
    ${contextNotes.substring(0, 25000)} 
    
    INSTRUCTIONS:
    1. Answer the student's question using the Context above.
    2. If the answer isn't in the context, use general knowledge.
    3. Keep responses concise (under 3 sentences unless asked for more).
    4. Do not mention "The Historian" or "The notes". Just teach.
    `;

    const contents = [
        ...history.map(h => ({ role: h.role, parts: [{ text: h.content }] })),
        { role: 'user', parts: [{ text: newMessage }] }
    ];

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    return response.text || "I'm thinking...";
  } catch (error) {
    console.error("Teacher Error:", error);
    return "The Teacher is having trouble connecting. Please try again.";
  }
};

// --- AGENT: VOICE (Narration) ---
// Task: Instant Text-to-Speech (Web Speech API)
export const generateSpeech = async (text: string): Promise<boolean> => {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) {
            console.error("Web Speech API not supported");
            resolve(false);
            return;
        }

        // Cancel any existing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        
        // Select a good voice if available
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Female')) || voices[0];
        if (preferredVoice) utterance.voice = preferredVoice;

        utterance.rate = 1.1; // Slightly faster for flow
        utterance.pitch = 1.0;

        utterance.onend = () => resolve(true);
        utterance.onerror = () => resolve(false);

        window.speechSynthesis.speak(utterance);
    });
}

// --- AGENT: ARCHITECT ---
// UPGRADE: Gemini 3.0 Flash
export const generateArchitectFlowchart = async (topic: string, currentContext: string) => {
    if (!apiKey) return `graph TB\nA[${topic}] --> B[No API Key]`;
    
    try {
        const prompt = `Create a simple Mermaid.js flowchart (graph TB) for: "${topic}".
        Based on: ${currentContext.substring(0, 2000)}.
        Return ONLY code. No markdown.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });

        const text = response.text || "";
        return text.replace(/```mermaid/g, '').replace(/```/g, '').trim();

    } catch (error) {
        return `graph TB\nA[${topic}] --> B[Data Unavailable]`;
    }
}

// --- AGENT: ILLUSTRATOR ---
export const generateIllustration = async (topic: string, context: string) => {
    // Placeholder - Logic remains handled by client or future Imagen integration
    return `https://picsum.photos/seed/${encodeURIComponent(topic)}/500/300`;
}


/**
 * LIVE API (Real-time) - Keeping as is, but guarded
 */
export const connectLiveSession = async (
    onAudioData: (base64: string) => void, 
    onClose: () => void
) => {
    // Stubbed for now to prevent 404s if 2.5 Native Audio is unavailable
    console.warn("Live API temporarily disabled due to model availability.");
    onClose();
    return Promise.resolve(null);
};


export const decodeAudioData = async (base64: string, ctx: AudioContext) => {
    // Utility kept for future use
    return ctx.createBuffer(1, 1, 22050); 
}