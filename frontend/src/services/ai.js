import { GROUNDING_RULES, formatPrompt } from './aiContext';

const STORAGE_KEY = 'repomind.ai.settings';

// No default models: provider catalogues change often, so the user always names the model explicitly.
export const AI_PROVIDERS = {
  openai: {
    label: 'OpenAI',
    kind: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    modelHint: 'e.g. gpt-4.1-mini',
  },
  openaiCompatible: {
    label: 'OpenAI-compatible',
    kind: 'openai',
    endpoint: '',
    modelHint: 'Model ID served by your endpoint',
  },
  anthropic: {
    label: 'Anthropic',
    kind: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    modelHint: 'e.g. claude-sonnet-5',
  },
  gemini: {
    label: 'Google Gemini',
    kind: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    modelHint: 'e.g. gemini-2.5-flash',
  },
};

export function loadAISettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const apiKey = sessionStorage.getItem(STORAGE_KEY + '.apiKey') || '';
    return { ...saved, apiKey };
  } catch {
    return {};
  }
}
export function saveAISettings(settings) {
  const safe = {
    provider: settings.provider || 'openai',
    model: settings.model || '',
    endpoint: settings.endpoint || '',
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  if (settings.apiKey) sessionStorage.setItem(STORAGE_KEY + '.apiKey', settings.apiKey);
  else sessionStorage.removeItem(STORAGE_KEY + '.apiKey');
  return { ...safe, apiKey: settings.apiKey || '' };
}
function requireSettings(settings) {
  if (!settings?.apiKey) throw new Error('Add an API key in AI settings.');
  const provider = AI_PROVIDERS[settings.provider] || AI_PROVIDERS.openai;
  if (!settings.model?.trim())
    throw new Error('Enter a model in AI settings (' + provider.modelHint + ').');
  if (!(settings.endpoint || provider.endpoint))
    throw new Error('Enter an endpoint URL for the ' + provider.label + ' provider.');
  return { settings: { ...settings, model: settings.model.trim() }, provider };
}
async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body?.error?.message ||
        body?.message ||
        'AI provider request failed (' + response.status + ').',
    );
  return body;
}
async function callOpenAI(settings, provider, messages) {
  const endpoint = (settings.endpoint || provider.endpoint).replace(/\/$/, '');
  const body = await jsonFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey },
    body: JSON.stringify({ model: settings.model, messages, temperature: 0.2 }),
  });
  return body?.choices?.[0]?.message?.content || '';
}
async function callAnthropic(settings, provider, messages) {
  const system =
    messages.find((x) => x.role === 'system')?.content ||
    'You are RepoMind, a codebase analysis assistant.';
  const input = messages.filter((x) => x.role !== 'system');
  const body = await jsonFetch(settings.endpoint || provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: settings.model, max_tokens: 4096, system, messages: input }),
  });
  return (body?.content || [])
    .filter((x) => x.type === 'text')
    .map((x) => x.text)
    .join('\n');
}
async function callGemini(settings, provider, messages) {
  const model = encodeURIComponent(settings.model);
  const url =
    (settings.endpoint || provider.endpoint).replace(/\/$/, '') + '/' + model + ':generateContent';
  const prompt = messages.map((x) => x.role.toUpperCase() + ':\n' + x.content).join('\n\n');
  const body = await jsonFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  return body?.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
}
export async function askAI(rawSettings, messages) {
  const { settings, provider } = requireSettings(rawSettings);
  if (provider.kind === 'openai') return callOpenAI(settings, provider, messages);
  if (provider.kind === 'anthropic') return callAnthropic(settings, provider, messages);
  if (provider.kind === 'gemini') return callGemini(settings, provider, messages);
  return callOpenAI(settings, provider, messages);
}
/** System message with the grounding rules, then the task and repository context. */
export function buildAIMessages(task, context) {
  return [
    { role: 'system', content: GROUNDING_RULES },
    { role: 'user', content: formatPrompt(task, context) },
  ];
}

/** Sends an already-built prompt (as shown to and possibly edited by the user). */
export const promptMessages = (prompt) => [
  { role: 'system', content: GROUNDING_RULES },
  { role: 'user', content: prompt },
];
