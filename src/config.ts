export interface ApiKeys {
  anthropic?: string;
  xai?: string;
  deepseek?: string;
  moonshot?: string;
}

export function resolveKeys(override?: ApiKeys): ApiKeys {
  return {
    anthropic: override?.anthropic ?? process.env.ANTHROPIC_API_KEY,
    xai: override?.xai ?? process.env.XAI_API_KEY,
    deepseek: override?.deepseek ?? process.env.DEEPSEEK_API_KEY,
    moonshot: override?.moonshot ?? process.env.MOONSHOT_API_KEY,
  };
}

export function buildApiKeyRecord(keys: ApiKeys): Record<string, string> {
  const record: Record<string, string> = {};
  if (keys.anthropic) record['anthropic'] = keys.anthropic;
  if (keys.xai) record['xai'] = keys.xai;
  if (keys.deepseek) record['deepseek'] = keys.deepseek;
  if (keys.moonshot) record['moonshot'] = keys.moonshot;
  return record;
}

export function validateConfig(keys: ApiKeys): string | null {
  if (!keys.anthropic) {
    return 'ANTHROPIC_API_KEY is required.';
  }
  return null;
}
