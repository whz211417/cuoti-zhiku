import { beforeEach, expect, test, vi } from 'vitest';
import { createPresetProvider } from './aiProviderCatalog';
import { loadAiProviderState, normalizeAiProviderState, saveAiProviderState } from './aiProviderStore';

const { storeGet, storeSet, storeSave, storeLoad } = vi.hoisted(() => ({
  storeGet: vi.fn(),
  storeSet: vi.fn(),
  storeSave: vi.fn(),
  storeLoad: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  Store: { load: storeLoad },
}));

beforeEach(() => {
  vi.clearAllMocks();
  storeLoad.mockResolvedValue({ get: storeGet, set: storeSet, save: storeSave });
});

test('repairs an invalid active provider without inventing a key', async () => {
  const bailian = createPresetProvider('bailian');
  storeGet.mockResolvedValue({ providers: [bailian], activeProviderId: 'missing' });

  await expect(loadAiProviderState()).resolves.toEqual({ providers: [bailian], activeProviderId: 'bailian' });
});

test('returns independent empty state arrays for separate corrupt values', () => {
  const first = normalizeAiProviderState(undefined);
  const second = normalizeAiProviderState(undefined);
  first.providers.push(createPresetProvider('bailian'));

  expect(second).toEqual({ providers: [], activeProviderId: null });
  expect(first.providers).not.toBe(second.providers);
});

test('recovers corrupt and duplicate persisted entries as an empty or deduplicated non-sensitive state', async () => {
  const bailian = createPresetProvider('bailian');
  storeGet.mockResolvedValue({
    providers: [bailian, { ...bailian, apiKey: 'must-not-survive' }, { id: 'invalid' }],
    activeProviderId: 'invalid',
    key: 'must-not-survive',
  });

  await expect(loadAiProviderState()).resolves.toEqual({ providers: [bailian], activeProviderId: 'bailian' });
});

test('serializes only approved configuration fields and no credential-shaped fields', async () => {
  const bailian = { ...createPresetProvider('bailian'), apiKey: 'not-allowed' };

  await saveAiProviderState({ providers: [bailian], activeProviderId: 'bailian' });

  expect(storeLoad).toHaveBeenCalledWith('ai-providers.json');
  expect(storeSet).toHaveBeenCalledWith('state', {
    providers: [expect.not.objectContaining({ apiKey: expect.anything() })],
    activeProviderId: 'bailian',
  });
  const serialized = JSON.stringify(storeSet.mock.calls[0][1]).toLowerCase();
  expect(serialized).not.toMatch(/apikey|secret|\"key\"/);
  expect(storeSave).toHaveBeenCalledOnce();
});

test('surfaces store read and write failures without replacing data', async () => {
  storeLoad.mockRejectedValueOnce(new Error('unavailable'));
  await expect(loadAiProviderState()).rejects.toThrow('无法读取 AI 平台配置');

  storeSet.mockRejectedValueOnce(new Error('disk full'));
  await expect(saveAiProviderState({ providers: [], activeProviderId: null })).rejects.toThrow('无法保存 AI 平台配置');
  expect(storeSave).not.toHaveBeenCalled();
});
