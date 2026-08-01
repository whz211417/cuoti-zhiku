export type PresetAiProviderId = 'bailian' | 'deepseek' | 'zhipu' | 'moonshot' | 'openai';
export type AiProviderId = PresetAiProviderId | `custom-${string}`;
export type AiProviderPresetKind = PresetAiProviderId | 'custom';

export type AiModelOption = {
  id: string;
  label: string;
  purpose: 'fast' | 'quality';
  supportsVision: boolean;
};

export type AiProviderConfig = {
  id: string;
  displayName: string;
  baseUrl: string;
  selectedModel: string;
  visionModel: string | null;
  supportsVision: boolean;
  requestTimeoutSeconds: number;
  isEnabled: boolean;
  preset: AiProviderPresetKind;
  allowInsecureLocalhost: boolean;
};

export type AiProviderState = {
  providers: AiProviderConfig[];
  activeProviderId: string | null;
};

export type AiProviderPreset = {
  id: PresetAiProviderId;
  displayName: string;
  baseUrl: string;
  models: readonly AiModelOption[];
  defaultModelId: string;
  defaultVisionModel: string | null;
  supportsVision: boolean;
};

const model = (
  id: string,
  label: string,
  purpose: AiModelOption['purpose'],
  supportsVision: boolean,
): AiModelOption => ({ id, label, purpose, supportsVision });

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: 'bailian',
    displayName: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      model('qwen3.6-flash', 'Qwen 3.6 Flash（快速 / 图片）', 'fast', true),
      model('qwen3.7-plus', 'Qwen 3.7 Plus（深入 / 图片）', 'quality', true),
    ],
    defaultModelId: 'qwen3.6-flash',
    defaultVisionModel: 'qwen3.6-flash',
    supportsVision: true,
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: [
      model('deepseek-v4-flash', 'DeepSeek V4 Flash（快速）', 'fast', false),
      model('deepseek-v4-pro', 'DeepSeek V4 Pro（深入）', 'quality', false),
    ],
    defaultModelId: 'deepseek-v4-flash',
    defaultVisionModel: null,
    supportsVision: false,
  },
  {
    id: 'zhipu',
    displayName: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      model('glm-5.2', 'GLM-5.2（文本）', 'quality', false),
      model('glm-4.5v', 'GLM-4.5V（图片）', 'fast', true),
    ],
    defaultModelId: 'glm-5.2',
    defaultVisionModel: 'glm-4.5v',
    supportsVision: true,
  },
  {
    id: 'moonshot',
    displayName: '月之暗面',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      model('kimi-k3', 'Kimi K3（文本）', 'quality', false),
      model('kimi-k2.6', 'Kimi K2.6（图片）', 'fast', true),
    ],
    defaultModelId: 'kimi-k3',
    defaultVisionModel: 'kimi-k2.6',
    supportsVision: true,
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      model('gpt-5.6-luna', 'GPT-5.6 Luna（高效 / 图片）', 'fast', true),
      model('gpt-5.6-terra', 'GPT-5.6 Terra（平衡 / 图片）', 'quality', true),
    ],
    defaultModelId: 'gpt-5.6-luna',
    defaultVisionModel: 'gpt-5.6-luna',
    supportsVision: true,
  },
];

export const getAiProviderPreset = (id: string): AiProviderPreset | undefined =>
  AI_PROVIDER_PRESETS.find((preset) => preset.id === id);

export const createPresetProvider = (id: PresetAiProviderId): AiProviderConfig => {
  const preset = getAiProviderPreset(id);
  if (!preset) {
    throw new Error(`未知 AI 平台预设：${id}`);
  }

  return {
    id: preset.id,
    displayName: preset.displayName,
    baseUrl: preset.baseUrl,
    selectedModel: preset.defaultModelId,
    visionModel: preset.defaultVisionModel,
    supportsVision: preset.supportsVision,
    requestTimeoutSeconds: 60,
    isEnabled: true,
    preset: preset.id,
    allowInsecureLocalhost: false,
  };
};

const newCustomId = () => {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `custom-${suffix}`;
};

export const createCustomProvider = (): AiProviderConfig => ({
  id: newCustomId(),
  displayName: '自定义兼容平台',
  baseUrl: 'https://',
  selectedModel: '',
  visionModel: null,
  supportsVision: false,
  requestTimeoutSeconds: 60,
  isEnabled: true,
  preset: 'custom',
  allowInsecureLocalhost: false,
});
