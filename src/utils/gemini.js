import JSON5 from "json5";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

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

export async function extractTasksFromText(userText, userLocation, currentTimeIso, existingTasks = []) {
  const now = new Date(currentTimeIso);
  const todayDateString = now.toISOString().split('T')[0]; // "2026-02-07"
  
  const loc = userLocation
    ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`
    : "unknown";

  const existingContext = existingTasks.length > 0
    ? `\n\nEXISTING TASKS:\n${existingTasks.map(t => `- ${t.title} at ${t.location}${t.fixedTime ? ` (by ${new Date(t.mustArriveBy).toLocaleTimeString()})` : ''}`).join('\n')}`
    : "";
    
  const prompt = `
You are a task extraction assistant. Extract ALL tasks from the user's message and identify EVERY time constraint.

User's location: ${loc} (College Station, TX)
Current time: ${currentTimeIso}
TODAY'S DATE: ${todayDateString}
${existingContext}

User message: "${userText}"

INSTRUCTIONS:
- If user says "add" or "also", include all existing tasks PLUS new ones
- Extract EVERY task mentioned
- Identify EVERY time constraint (look for "by", "at", "before", etc.)
- Use simple location names for better search results

Each task object must have:
- id: unique incremental string ("task-1", "task-2", etc.)
- title: brief description of what to do
- location: simple business/place name
- durationMinutes: estimated time at location (default 30)
- mustArriveBy: ISO 8601 timestamp if ANY time mentioned, null if no time
- fixedTime: true if mustArriveBy is set, false otherwise

CRITICAL TIME PARSING:
Today's date: ${todayDateString}
- "by 9:40 PM" → "${todayDateString}T21:40:00-06:00" (9:40 PM = 21:40 in 24h format)
- "at 10:30 PM" → "${todayDateString}T22:30:00-06:00" (10:30 PM = 22:30 in 24h format)
- "by 9:15" → "${todayDateString}T09:15:00-06:00" (assume AM if < 12)
- "at 7:00" → "${todayDateString}T19:00:00-06:00" (assume PM if context suggests evening)
- Always use 24-hour format and -06:00 timezone (Central Time)

IMPORTANT: If a task mentions "by [time]" or "at [time]", set mustArriveBy and fixedTime: true

LOCATION NAMES (use specific searchable terms):
- "HEB" → "HEB"
- "Memorial Student Center" or "MSC" → "Memorial Student Center"  
- "Evans Library" → "Evans Library"
- "Starbucks" → "Starbucks Northgate" (more specific)
- "coffee" → "Starbucks Northgate"
- "mcdonald's" → "McDonald's University Drive"
- "gym" → "Rec Center"
- "post office" → "US Post Office College Station"
- "bank" → "Wells Fargo Bank"
- "grocery store" → "HEB"
- "pharmacy" → "CVS Pharmacy"

EXAMPLE for input "I need to stop by HEB today, but I also need to get to the memorial student center by 9:40 PM and then the evans library at 10:30 PM":

[
  {
    "id": "task-1",
    "title": "Stop by HEB",
    "location": "HEB",
    "durationMinutes": 45,
    "mustArriveBy": null,
    "fixedTime": false
  },
  {
    "id": "task-2",
    "title": "Get to Memorial Student Center",
    "location": "Memorial Student Center",
    "durationMinutes": 30,
    "mustArriveBy": "${todayDateString}T21:40:00-06:00",
    "fixedTime": true
  },
  {
    "id": "task-3",
    "title": "Get to Evans Library",
    "location": "Evans Library",
    "durationMinutes": 30,
    "mustArriveBy": "${todayDateString}T22:30:00-06:00",
    "fixedTime": true
  }
]

Return ONLY the JSON array with NO markdown or explanation:
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
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const errMsg = data?.error?.message || response.statusText;
    throw new Error(`Gemini API error: ${errMsg}`);
  }

  const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  if (!textOutput) {
    throw new Error("No response from Gemini");
  }

  try {
    const jsonText = extractCompleteJsonArray(textOutput) || textOutput;
    const tasks = JSON5.parse(jsonText);
    const parsedTasks = Array.isArray(tasks) ? tasks : [tasks];
    
    // Debug: Log parsed tasks to verify time constraints
    console.log("Parsed tasks from Gemini:", parsedTasks.map(t => ({
      title: t.title,
      fixedTime: t.fixedTime,
      mustArriveBy: t.mustArriveBy
    })));
    
    return parsedTasks;
  } catch (e) {
    console.error("Failed to parse Gemini output:", textOutput, e);
    return [];
  }
}