const BASE_URL = 'https://api.z.ai/api/coding/paas/v4';
const DEFAULT_MODEL = 'glm-5-turbo';
const TIMEOUT_MS = 300_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function loadConfig(): ProviderConfig {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    throw new Error('GLM_API_KEY environment variable is required. Get one at https://open.bigmodel.cn');
  }

  return {
    baseUrl: process.env.GLM_BASE_URL || BASE_URL,
    apiKey,
    model: process.env.GLM_MODEL || DEFAULT_MODEL,
  };
}

export interface CallParams {
  config: ProviderConfig;
  systemPrompt: string;
  userMessage: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callProvider(params: CallParams): Promise<string> {
  const { config, systemPrompt, userMessage } = params;
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };

  const body = JSON.stringify({
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    } catch (error: unknown) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`GLM provider did not respond within ${TIMEOUT_MS / 1000}s`);
      }
      throw new Error(`Cannot reach GLM provider at ${config.baseUrl}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const status = response.status;
      let errorBody = '';
      try { errorBody = await response.text(); } catch {}

      if (status === 401 || status === 403) {
        throw new Error(`GLM authentication failed. Check GLM_API_KEY. ${errorBody}`);
      }

      if (RETRYABLE_STATUSES.has(status) && attempt < MAX_RETRIES) {
        lastError = new Error(`GLM error ${status}: ${errorBody}`);
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
        continue;
      }

      throw new Error(`GLM error ${status}: ${errorBody}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('GLM returned unexpected response format');
    }
    return content;
  }

  throw lastError ?? new Error('GLM request failed after retries');
}
