export async function extractSchema(markdown, userPrompt, apiKey, format = 'json') {
  const strictRule = `STRICT RULES:
- Extract ONLY what the user asked for. Do NOT add extra sections, categories, or information beyond the request.
- If the user asks for specific fields, return ONLY those fields.
- Do NOT add summaries, notes, eligibility info, submission requirements, or any other unrequested data.
- Answer the user's question precisely and concisely.`;
  const prompt = format === 'text'
    ? `${strictRule}\n\nUser request: ${userPrompt}\n\nReturn ONLY clean, readable plain text answering the user's exact request. Nothing more.\n\nContent:\n${markdown}`
    : `${strictRule}\n\nUser request: ${userPrompt}\n\nReturn ONLY a clean JSON object answering the user's exact request. Nothing more.\n\nContent:\n${markdown}`;
  const nvidiaUrl = process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
  const response = await fetch(nvidiaUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      reasoning_budget: 0,
      chat_template_kwargs: { enable_thinking: false }
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA API responded with status ${response.status}: ${errorText}`);
  }
  const json = await response.json();
  if (!json.choices?.[0]?.message?.content) throw new Error(`NVIDIA API returned unexpected response: ${JSON.stringify(json)}`);
  const text = json.choices[0].message.content.trim();
  let cleaned = text.startsWith('</think>') ? text.replace(/^<\/think>\s*/, '').trim() : text;
  if (format === 'text') return cleaned;
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Failed to parse Nemotron's response as JSON: ${error.message}. Content was: ${text}`);
  }
}
