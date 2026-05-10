/**
 * Gemini model listing.
 * The @google/genai SDK doesn't expose a models.list() method,
 * so we use the REST API directly for discovery only.
 * All generation calls go through the SDK (see gemini.ts).
 */

export type GeminiModel = string;

export interface GeminiModelInfo {
  id: GeminiModel;
  label: string;
  description: string;
  displayName?: string;
}

let cachedModels: Map<string, GeminiModelInfo[]> = new Map();

/** Clear the model cache (call when the API key changes). */
export function clearModelCache(): void {
  cachedModels = new Map();
}

/**
 * Fetch available text-generation Gemini models for the given API key.
 * Results are cached per key so subsequent opens are instant.
 */
export async function fetchAvailableModels(apiKey: string): Promise<GeminiModelInfo[]> {
  if (cachedModels.has(apiKey)) {
    return cachedModels.get(apiKey)!;
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
    { headers: { "x-goog-api-key": apiKey } },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = await response.json();

  const results: GeminiModelInfo[] = (data.models ?? [])
    .filter((m: Record<string, unknown>) => {
      if (!Array.isArray(m.supportedGenerationMethods) || !m.supportedGenerationMethods.includes("generateContent")) return false;
      const id: string = typeof m.name === "string" ? m.name.replace("models/", "") : "";
      if (!id.startsWith("gemini-")) return false;
      const excluded = [
        "-tts", "-image", "-audio", "-native-audio", "-live",
        "-robotics", "-computer-use", "deep-research", "flash-image", "pro-image",
      ];
      return !excluded.some((s) => id.includes(s));
    })
    .map((m: Record<string, unknown>) => ({
      id: typeof m.name === "string" ? m.name.replace("models/", "") : "",
      label: typeof m.displayName === "string" ? m.displayName : (typeof m.name === "string" ? m.name.replace("models/", "") : ""),
      description: typeof m.description === "string" ? m.description : "",
      displayName: typeof m.displayName === "string" ? m.displayName : undefined,
    }))
    .filter((m: GeminiModelInfo) => m.id);

  if (results.length > 0) {
    cachedModels.set(apiKey, results);
  }

  return results;
}
