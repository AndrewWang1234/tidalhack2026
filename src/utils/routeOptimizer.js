/**
 * Optimize task order using Featherless AI (Llama 3.3 Instruct)
 * @param {Array} tasks - Array of tasks with lat/lng and mustArriveBy
 * @param {Object} userLocation - { lat, lng }
 * @returns {Array} - Reordered tasks
 */
export async function optimizeRouteWithFeatherless(tasks, userLocation) {
  const prompt = `
You are a route optimization assistant. Given the following tasks and the user's current location, 
reorder the tasks to minimize driving distance while respecting any "mustArriveBy" constraints.

User's current location: ${userLocation.lat},${userLocation.lng}

Tasks:
${JSON.stringify(tasks)}

INSTRUCTIONS:
- Return tasks reordered for minimal driving distance.
- Do not change tasks' id or title.
- Respect any "mustArriveBy" constraints.
- Return ONLY the reordered JSON array. No explanations or markdown.
`;

  const response = await fetch('https://api.featherless.ai/v1/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_FEATHERLESS_API_KEY}` // use Vite env
    },
    body: JSON.stringify({
      model: 'meta-llama/Llama-3.3-70B-Instruct',
      prompt: prompt,
      max_tokens: 1000,
      temperature: 0
    })
  });

  const data = await response.json();

  try {
    return JSON.parse(data.choices[0].text.trim());
  } catch (err) {
    console.error("Failed to parse Featherless output:", data.choices[0].text);
    throw err;
  }
}

