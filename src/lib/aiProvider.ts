// Ollama AI Provider - Uses locally running Ollama service
// Ollama API is OpenAI-compatible at http://localhost:11434 by default

const OLLAMA_API_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'mistral';

export interface AskAIOptions {
  systemInstruction?: string;
}

/**
 * Ollama'dan gelen farklı yanıt formatlarını parse eder.
 */
function parseOllamaResponse(data: any): string {
  if (!data) return '';
  if (typeof data.response === 'string' && data.response.trim()) return data.response.trim();
  if (typeof data.text === 'string' && data.text.trim()) return data.text.trim();
  
  if (Array.isArray(data.results) && data.results.length > 0) {
    const first = data.results[0];
    if (typeof first.content === 'string' && first.content.trim()) return first.content.trim();
    if (Array.isArray(first.content)) {
      return first.content.map((item: any) => typeof item.text === 'string' ? item.text : '').join('').trim();
    }
  }
  
  if (Array.isArray(data.output) && data.output.length > 0) {
    return data.output.map((item: any) => typeof item.text === 'string' ? item.text : '').join('').trim();
  }
  return '';
}

/**
 * Merkezi AI çağrı fonksiyonu.
 */
export async function askAI(prompt: string, context?: string, options?: AskAIOptions): Promise<string> {
  try {
    let fullPrompt = prompt;
    if (options?.systemInstruction) {
      fullPrompt = `${options.systemInstruction}\n\n${prompt}`;
    }
    if (context) {
      fullPrompt = `Context:\n${context}\n\nQuestion:\n${fullPrompt}`;
    }

    const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: fullPrompt,
        stream: false,
        temperature: 0.7,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const resultText = parseOllamaResponse(data);
    
    if (!resultText) {
      throw new Error('Ollama returned an empty response.');
    }
    return resultText;
    
  } catch (error: any) {
    console.error('[AI_CORE_FAILURE]:', error);
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        'CONNECTION_ERROR: Cannot reach Ollama service.\n' +
        'Checklist:\n' +
        '1. Ensure Ollama is installed (https://ollama.ai)\n' +
        '2. Run: "ollama serve"\n' +
        '3. Ensure model is pulled: "ollama pull ' + OLLAMA_MODEL + '"\n' +
        '4. Verify VITE_OLLAMA_URL in .env.local'
      );
    }
    throw error;
  }
}