interface Env {
  AI: Ai;
}

interface DistractorRequest {
  correctAnswer: string;
  questionType: "translate" | "conjugation" | "noun_form" | "fill_blank";
  entryType: "word" | "expression" | "noun" | "verb" | "adjective";
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Current score ratio 0-1 for scaling difficulty */
  scoreRatio: number;
  /** The source word/prompt for context */
  prompt: string;
  /** Language of the correct answer */
  answerLang: "danish" | "english";
  /** Existing pool of valid answers to avoid duplicating */
  existingAnswers?: string[];
}

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8", ...init?.headers },
    ...init,
  });

function hasValidAccessToken(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  return cookies.some((c) => c.startsWith("CF_Authorization="));
}

function buildPrompt(req: DistractorRequest): string {
  const lang = req.answerLang === "danish" ? "Danish" : "English";
  const similarity = req.difficulty === "advanced" || req.scoreRatio > 0.7
    ? "very similar (differing by only 1-2 letters, endings, or articles)"
    : req.difficulty === "intermediate"
    ? "somewhat similar (same word family or pattern)"
    : "plausible but clearly different";

  let typeHint = "";
  if (req.questionType === "conjugation") {
    typeHint = `These should be other plausible ${lang} verb conjugation forms (wrong tense, wrong ending).`;
  } else if (req.questionType === "noun_form") {
    typeHint = `These should be other plausible ${lang} noun declension forms (wrong article, wrong plural ending).`;
  } else {
    typeHint = `These should be other real ${lang} words that could be confused with the correct answer.`;
  }

  const avoid = req.existingAnswers?.length
    ? `\nDo NOT include any of these: ${req.existingAnswers.join(", ")}`
    : "";

  return `Generate exactly 3 wrong answer options (distractors) for a ${lang} language quiz.

Correct answer: "${req.correctAnswer}"
Source prompt: "${req.prompt}"
Word type: ${req.entryType}
Question type: ${req.questionType}

${typeHint}
The distractors should be ${similarity} to the correct answer.${avoid}

Return ONLY a JSON array of 3 strings, no explanation. Example: ["word1", "word2", "word3"]`;
}

function parseDistractors(text: string): string[] {
  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s: string) => s.trim())
      .slice(0, 3);
  } catch {
    return [];
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hasValidAccessToken(request)) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: DistractorRequest;
  try {
    payload = (await request.json()) as DistractorRequest;
  } catch {
    return json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!payload.correctAnswer?.trim()) {
    return json({ error: "Missing correctAnswer." }, { status: 400 });
  }

  const prompt = buildPrompt(payload);

  try {
    const result: AiTextGenerationOutput = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: "You are a language quiz assistant. Return only JSON arrays, no other text." },
        { role: "user", content: prompt },
      ],
      max_tokens: 100,
      temperature: payload.difficulty === "advanced" ? 0.3 : 0.5,
    });

    const text = "response" in result ? (result as { response: string }).response : "";
    const distractors = parseDistractors(text);

    return json({ distractors });
  } catch (err) {
    console.error("Workers AI error:", err);
    return json({ distractors: [] });
  }
};
