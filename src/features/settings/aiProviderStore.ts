import { Store } from '@tauri-apps/plugin-store';
import {
  type AiProviderConfig,
  type AiProviderPresetKind,
  type AiProviderState,
  getAiProviderPreset,
} from './aiProviderCatalog';

const STORE_FILE = 'ai-providers.json';
const STORE_KEY = 'state';
const MIN_TIMEOUT_SECONDS = 10;
const MAX_TIMEOUT_SECONDS = 180;

type UnknownRecord = Record<string, unknown>;

const createEmptyState = (): AiProviderState => ({ providers: [], activeProviderId: null });

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPresetKind = (value: unknown): value is AiProviderPresetKind =>
  value === 'bailian' || value === 'deepseek' || value === 'zhipu'
  || value === 'moonshot' || value === 'openai' || value === 'custom';

const isStoredTimeout = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const normalizeTimeout = (value: number) => Math.min(MAX_TIMEOUT_SECONDS, Math.max(MIN_TIMEOUT_SECONDS, value));

const normalizeProvider = (value: unknown): AiProviderConfig | null => {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.displayName !== 'string'
    || typeof value.baseUrl !== 'string'
    || typeof value.selectedModel !== 'string'
    || !(typeof value.visionModel === 'string' || value.visionModel === null)
    || typeof value.supportsVision !== 'boolean'
    || !isStoredTimeout(value.requestTimeoutSeconds)
    || typeof value.isEnabled !== 'boolean'
    || !isPresetKind(value.preset)
    || typeof value.allowInsecureLocalhost !== 'boolean') {
    return null;
  }

  const preset = getAiProviderPreset(value.preset);
  const isKnownPreset = preset !== undefined && value.id === value.preset;
  const isValidCustom = value.preset === 'custom' && value.id.startsWith('custom-') && value.id.length > 'custom-'.length;
  if (!isKnownPreset && !isValidCustom) {
    return null;
  }

  return {
    id: value.id,
    displayName: value.displayName,
    baseUrl: value.baseUrl,
    selectedModel: value.selectedModel,
    visionModel: value.visionModel,
    supportsVision: value.supportsVision,
    requestTimeoutSeconds: normalizeTimeout(value.requestTimeoutSeconds),
    isEnabled: value.isEnabled,
    preset: value.preset,
    allowInsecureLocalhost: value.allowInsecureLocalhost,
  };
};

export const normalizeAiProviderState = (value: unknown): AiProviderState => {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    return createEmptyState();
  }

  const seenIds = new Set<string>();
  const providers = value.providers.flatMap((candidate) => {
    const provider = normalizeProvider(candidate);
    if (!provider || seenIds.has(provider.id)) {
      return [];
    }
    seenIds.add(provider.id);
    return [provider];
  });
  const requestedActiveId = typeof value.activeProviderId === 'string' ? value.activeProviderId : null;
  const activeProvider = providers.find((provider) => provider.id === requestedActiveId && provider.isEnabled)
    ?? providers.find((provider) => provider.isEnabled)
    ?? null;

  return { providers, activeProviderId: activeProvider?.id ?? null };
};

const loadStore = () => Store.load(STORE_FILE);

export const loadAiProviderState = async (): Promise<AiProviderState> => {
  try {
    const store = await loadStore();
    return normalizeAiProviderState(await store.get<unknown>(STORE_KEY));
  } catch {
    throw new Error('无法读取 AI 平台配置。请检查本地存储后重试。');
  }
};

export const saveAiProviderState = async (state: AiProviderState): Promise<void> => {
  try {
    const store = await loadStore();
    await store.set(STORE_KEY, normalizeAiProviderState(state));
    await store.save();
  } catch {
    throw new Error('无法保存 AI 平台配置。上一次可用配置没有被替换。');
  }
};
