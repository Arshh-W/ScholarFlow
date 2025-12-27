import { GoogleGenAI, Modality } from "@google/genai";
import { UploadedFile } from '../types';

// Ensure API Key is available
const apiKey = process.env.API_KEY || ''; 
const ai = new GoogleGenAI({ apiKey });

/**
 * TEACHER AGENT: Text Generation with RAG
 */
export const generateTeacherResponse = async (
    history: { role: string, content: string }[], 
    newMessage: string,
    files: UploadedFile[] = []
) => {
  if (!apiKey) throw new Error("API Key Missing");

  try {
    const model = 'gemini-3-flash-preview';
    const systemInstruction = `You are a Socratic Teacher for ScholarFlow. 
    Your goal is to guide the student using questions and insights. 
    Use the provided file context (PDFs/Images) to answer accurately. 
    Do not give long lectures. Break concepts down. 
    Refer to "The Architect" (chart) or "The Illustrator" (visuals) to update context.`;

    // Prepare contents: History + New Message + File Context
    // We add files to the LAST user message to ensure they are in the current context window
    const fileParts = files.map(f => {
        if (!f.data) return null;
        // Determine mime type from data URL or fallback
        const mimeType = f.type || 'application/pdf'; 
        // Remove data URL header if present for API
        const data = f.data.split(',')[1] || f.data;
        
        return {
            inlineData: {
                mimeType,
                data
            }
        };
    }).filter(Boolean);

    const contents = [
        ...history.map(h => ({ role: h.role, parts: [{ text: h.content }] })),
        { 
            role: 'user', 
            parts: [
                { text: newMessage },
                ...fileParts as any[] // Add file context to the latest prompt
            ] 
        }
    ];

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    return response.text || "I'm pondering that thought...";
  } catch (error) {
    console.error("Teacher Error:", error);
    return "The Teacher is having trouble reading the materials. Please try again.";
  }
};

/**
 * VOICE NARRATION (TTS)
 */
export const generateSpeech = async (text: string): Promise<ArrayBuffer | null> => {
    if (!apiKey || !text) return null;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return null;

        // Decode Base64 to ArrayBuffer
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    } catch (e) {
        console.error("TTS Error:", e);
        return null;
    }
}

/**
 * ARCHITECT AGENT: Mermaid Code Generation
 */
export const generateArchitectFlowchart = async (topic: string, currentContext: string) => {
    if (!apiKey) return `graph TB\nA[${topic}] --> B[No API Key]`;
    
    try {
        const prompt = `You are The Architect. Create a valid Mermaid.js flowchart (graph TB) for the topic: "${topic}".
        Context: ${currentContext.substring(0, 2000)}.
        
        Rules:
        1. Only return the mermaid code. NO markdown formatting.
        2. Keep it concise (5-8 nodes).
        3. Use 'graph TB' (Top to Bottom) for better vertical scrolling fit.
        4. Style the central node with fill:#a78bfa.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });

        const text = response.text || "";
        return text.replace(/```mermaid/g, '').replace(/```/g, '').trim();

    } catch (error) {
        console.error("Architect Error", error);
        return `graph TB\nA[${topic}] --> B[Data Unavailable]`;
    }
}

/**
 * ILLUSTRATOR AGENT: Image Generation
 */
export const generateIllustration = async (topic: string, context: string) => {
    if (!apiKey) return "https://picsum.photos/400/300";

    try {
        // Attempt to use real image generation model
        const response = await ai.models.generateContent({
             model: 'gemini-2.5-flash-image',
             contents: {
                 parts: [{ text: `Create a clean, academic, flat-style illustration explaining: ${topic}. Context: ${context.substring(0, 100)}` }]
             }
        });

        // Check for inline image data in response
        let base64Image = null;
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                base64Image = part.inlineData.data;
                break;
            }
        }

        if (base64Image) {
            return `data:image/png;base64,${base64Image}`;
        }
        
        // Fallback to placeholder if model refuses or returns text
        return `https://picsum.photos/seed/${encodeURIComponent(topic)}/500/300`;

    } catch (e) {
        console.error("Illustrator Error", e);
        return "https://picsum.photos/400/300";
    }
}


/**
 * LIVE API (Real-time)
 */
export const connectLiveSession = async (
    onAudioData: (base64: string) => void, 
    onClose: () => void
) => {
    if (!apiKey) return null;

    const inputAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: "You are the Voice of ScholarFlow. Speak clearly.",
        },
        callbacks: {
            onopen: () => {
                const source = inputAudioContext.createMediaStreamSource(stream);
                const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                
                scriptProcessor.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);
                    const pcm16 = floatTo16BitPCM(inputData);
                    const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
                    
                    sessionPromise.then(session => {
                        session.sendRealtimeInput({
                            media: { mimeType: 'audio/pcm;rate=16000', data: base64 }
                        });
                    });
                };
                source.connect(scriptProcessor);
                scriptProcessor.connect(inputAudioContext.destination);
            },
            onmessage: (msg) => {
                const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (audioData) onAudioData(audioData);
            },
            onclose: () => {
                onClose();
                inputAudioContext.close();
                stream.getTracks().forEach(t => t.stop());
            },
            onerror: (e) => {
                console.error(e);
                onClose();
            }
        }
    });

    return sessionPromise;
};


// Helper: Float32 to Int16 PCM
function floatTo16BitPCM(float32Array: Float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
}

export const decodeAudioData = async (base64: string, ctx: AudioContext) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Convert PCM to AudioBuffer
    const dataInt16 = new Int16Array(bytes.buffer);
    const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i=0; i < dataInt16.length; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
}