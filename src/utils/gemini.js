import JSON5 from "json5";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * Extracts the first JSON array from text, if present
 */
function extractCompleteJsonArray(text) {
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return null;
    return text.slice(start, end + 1);
  } catch {
    return null;
  }
}

/**
 * If the model output was truncated mid-JSON, try to extract complete objects.
 * Handles: (1) truncation between objects `},{` (2) truncation after `},` with no `{`
 */
function tryRepairTruncatedJson(text) {
  const start = text.indexOf("[");
  if (start === -1) return null;
  const body = text.slice(start + 1);

  // Case 1: Find last complete boundary `},{` - use everything up to that `}`
  const boundaryMatches = [...body.matchAll(/\}\s*,\s*\{/g)];
  if (boundaryMatches.length > 0) {
    const last = boundaryMatches[boundaryMatches.length - 1];
    const endOfLastComplete = start + 1 + last.index + 1;
    return text.slice(0, endOfLastComplete) + "]";
  }

  // Case 2: Truncation after `},` (no following `{`) - find last `},` and close there
  const trailingMatches = [...body.matchAll(/\}\s*,/g)];
  if (trailingMatches.length > 0) {
    const last = trailingMatches[trailingMatches.length - 1];
    const endOfLastComplete = start + 1 + last.index + 1;
    return text.slice(0, endOfLastComplete) + "]";
  }

  return null;
}


/**
 * Option A: Full Gemini-powered route planning.
 * Parses tasks, resolves locations (with lat/lng), and returns optimal visit order.
 * No geocoding step - Gemini handles everything.
 */
export async function planRouteFromText(userText, userLocation, currentTimeIso) {
  const loc = userLocation
    ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`
    : "unknown";
  const prompt = `
  You are a day planner assistant. The user may describe multiple tasks in one sentence or paragraph. Your job is to:

  1. **Identify all tasks** mentioned, even if they are written in a single sentence.
  2. Split each task into its own object in a JSON array.
  3. Resolve locations to the closest relevant places near the user.
  4. Assign approximate latitude and longitude for each location.
  5. Determine the most efficient visit order considering:
    - The user's current location
    - Travel times between stops
    - Any fixed-time constraints
  6. Provide estimated travel minutes from the previous stop (0 for the first stop)
  7. Include task duration (durationMinutes) and mustArriveBy/fixedTime as applicable.

  User's current location (lat, lng): ${loc}
  Current date and time: ${currentTimeIso}

  User message: "${userText}"

  Return **ONLY** a JSON array of objects (no markdown, no code fences). Each object must have:
  - id: unique string (e.g., "task-1")
  - title: short description of the task
  - address: full street address or place name with city/state
  - lat: number (approximate latitude for map display)
  - lng: number (approximate longitude for map display)
  - order: number (1-based optimal visit order)
  - estimatedTravelMinutes: number (minutes to reach this stop from previous; 0 for first)
  - durationMinutes: number (estimated task duration)
  - mustArriveBy: ISO timestamp string or null
  - fixedTime: boolean (true if mustArriveBy exists)

  IMPORTANT:
  - The JSON array must include **every task mentioned**, even if multiple tasks are in one sentence.
  - Provide reasonable lat/lng for locations near the user.
  - Do NOT add extra text outside the JSON array.
  - Use double quotes for all property names and string values.
  `;



  if (!GEMINI_API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY is not set in .env");
  }

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const errMsg =
      data?.error?.message || data?.error?.status || response.statusText;
    throw new Error(`Gemini API error: ${errMsg}`);
  }

  const textOutput =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  if (!textOutput) {
    const reason = data?.candidates?.[0]?.finishReason;
    throw new Error(
      reason === "SAFETY"
        ? "Response was blocked by safety filters."
        : "No text in Gemini response."
    );
  }

  try {
    let jsonText = extractCompleteJsonArray(textOutput) || textOutput;

    let tasks;
    try {
      tasks = JSON5.parse(jsonText);
    } catch (parseErr) {
      // Output may have been truncated; try to salvage complete objects
      jsonText = tryRepairTruncatedJson(textOutput);
      if (jsonText) {
        tasks = JSON5.parse(jsonText);
      } else {
        throw parseErr;
      }
    }

    // Ensure lat/lng are numbers; sort by order
    const normalized = Array.isArray(tasks) ? tasks : [tasks];
    return normalized
      .filter((t) => t != null && (t.lat != null || t.lat === 0) && (t.lng != null || t.lng === 0))
      .map((t) => ({
        ...t,
        lat: typeof t.lat === "number" ? t.lat : parseFloat(t.lat),
        lng: typeof t.lng === "number" ? t.lng : parseFloat(t.lng),
      }))
      .filter((t) => !Number.isNaN(t.lat) && !Number.isNaN(t.lng))
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  } catch (e) {
    console.error("Failed to parse Gemini output:", textOutput, e);
    return [];
  }
}
