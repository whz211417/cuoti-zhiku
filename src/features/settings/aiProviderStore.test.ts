import { beforeEach, expect, test, vi } from 'vitest';
import { createPresetProvider } from './aiProviderCatalog';
import { loadAiProviderState, normalizeAiProviderState, saveAiProviderState } from './aiProviderStore';

const { storeDelete, storeGet, storeSet, storeSave, storeLoad } = vi.hoisted(() => ({
  storeDelete: vi.fn(),
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
  storeLoad.mockResolvedValue({ delete: storeDelete, get: storeGet, set: storeSet, save: storeSave });
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

test('normalizes persisted timeouts to the native 10 to 180 second contract', () => {
  const bailian = createPresetProvider('bailian');

  expect(normalizeAiProviderState({ providers: [{ ...bailian, requestTimeoutSeconds: 9 }], activeProviderId: 'bailian' }))
    .toEqual({ providers: [{ ...bailian, requestTimeoutSeconds: 10 }], activeProviderId: 'bailian' });
  expect(normalizeAiProviderState({ providers: [{ ...bailian, requestTimeoutSeconds: 300 }], activeProviderId: 'bailian' }))
    .toEqual({ providers: [{ ...bailian, requestTimeoutSeconds: 180 }], activeProviderId: 'bailian' });
  expect(normalizeAiProviderState({ providers: [{ ...bailian, requestTimeoutSeconds: 999_999_999 }], activeProviderId: 'bailian' }))
    .toEqual({ providers: [], activeProviderId: null });
  expect(normalizeAiProviderState({ providers: [{ ...bailian, requestTimeoutSeconds: 10.5 }], activeProviderId: 'bailian' }))
    .toEqual({ providers: [], activeProviderId: null });
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
  expect(serialized).not.toMatch(/apikey|secret|"key"/);
  expect(storeSave).toHaveBeenCalledOnce();
});

test('surfaces store read and write failures without replacing data', async () => {
  storeLoad.mockRejectedValueOnce(new Error('unavailable'));
  await expect(loadAiProviderState()).rejects.toThrow('无法读取 AI 平台配置');

  storeSet.mockRejectedValueOnce(new Error('disk full'));
  await expect(saveAiProviderState({ providers: [], activeProviderId: null })).rejects.toThrow('无法保存 AI 平台配置');
  expect(storeSave).not.toHaveBeenCalled();
});

test('rolls the Store memory state back when disk save rejects', async () => {
  const previous = { providers: [], activeProviderId: null };
  storeGet.mockResolvedValue(previous);
  storeSave.mockRejectedValueOnce(new Error('disk full'));

  await expect(saveAiProviderState({ providers: [createPresetProvider('bailian')], activeProviderId: 'bailian' }))
    .rejects.toThrow('无法保存 AI 平台配置');

  expect(storeSet).toHaveBeenLastCalledWith('state', previous);
});

test('removes a newly failed state from Store memory when no previous state existed', async () => {
  storeGet.mockResolvedValue(undefined);
  storeSave.mockRejectedValueOnce(new Error('disk full'));

  await expect(saveAiProviderState({ providers: [createPresetProvider('bailian')], activeProviderId: 'bailian' }))
    .rejects.toThrow('无法保存 AI 平台配置');

  expect(storeDelete).toHaveBeenCalledWith('state');
});
