import { invoke } from '@tauri-apps/api/core';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  clearAiProviderKey,
  getAiCredentialMigrationStatus,
  getDashboardOverview,
  getLibraryHealth,
  hasAiProviderKey,
  importFiles,
  retryAiCredentialMigration,
  runProblemAnalysis,
  saveAiProviderKey,
  searchLibrary,
  testAiProvider,
} from './tauri';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

test('requests the local library health through a narrow native command', async () => {
  vi.mocked(invoke).mockResolvedValue({
    schemaVersion: 1,
    foreignKeysEnabled: true,
    journalMode: 'wal',
  });

  await expect(getLibraryHealth()).resolves.toMatchObject({ schemaVersion: 1 });
  expect(invoke).toHaveBeenCalledWith('get_library_health');
});

test('sends a batch of selected paths to the native inbox command', async () => {
  vi.mocked(invoke).mockResolvedValue([]);

  await expect(importFiles(['C:/notes/is-lm.pdf'])).resolves.toEqual([]);
  expect(invoke).toHaveBeenCalledWith('import_files', {
    paths: ['C:/notes/is-lm.pdf'],
    courseId: undefined,
  });
});

test('requests the local dashboard and bounded search', async () => {
  vi.mocked(invoke).mockResolvedValue({});

  await getDashboardOverview('2026-07-30');
  expect(invoke).toHaveBeenCalledWith('get_dashboard_overview', { today: '2026-07-30' });

  await searchLibrary('IS-LM', 12);
  expect(invoke).toHaveBeenCalledWith('search_library', { query: 'IS-LM', limit: 12 });
});

test('uses the bounded default search limit', async () => {
  vi.mocked(invoke).mockResolvedValue([]);

  await searchLibrary('IS-LM');

  expect(invoke).toHaveBeenCalledWith('search_library', { query: 'IS-LM', limit: 12 });
});

test('keeps provider credentials behind narrow native commands', async () => {
  vi.mocked(invoke).mockResolvedValue(true);

  await expect(hasAiProviderKey('deepseek')).resolves.toBe(true);
  expect(invoke).toHaveBeenCalledWith('has_ai_provider_key', { providerId: 'deepseek' });

  await saveAiProviderKey('deepseek', 'test-only-key');
  expect(invoke).toHaveBeenCalledWith('save_ai_provider_key', {
    providerId: 'deepseek',
    apiKey: 'test-only-key',
  });

  await clearAiProviderKey('deepseek');
  expect(invoke).toHaveBeenCalledWith('clear_ai_provider_key', { providerId: 'deepseek' });
});

test('queries and retries credential migration without requesting a credential value', async () => {
  vi.mocked(invoke).mockResolvedValue('conflict');

  await expect(getAiCredentialMigrationStatus()).resolves.toBe('conflict');
  expect(invoke).toHaveBeenCalledWith('get_ai_credential_migration_status');

  await expect(retryAiCredentialMigration()).resolves.toBe('conflict');
  expect(invoke).toHaveBeenCalledWith('retry_ai_credential_migration');
});

test('sends only the native-safe provider config to AI commands', async () => {
  vi.mocked(invoke).mockResolvedValue({ authenticated: true, modelAvailable: true, visionDeclared: false });
  const config = {
    id: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    selectedModel: 'deepseek-v4-flash',
    visionModel: null,
    supportsVision: false,
    requestTimeoutSeconds: 60,
    isEnabled: true,
    preset: 'deepseek' as const,
    allowInsecureLocalhost: false,
  };
  const nativeConfig = {
    id: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    selectedModel: 'deepseek-v4-flash',
    visionModel: null,
    supportsVision: false,
    requestTimeoutSeconds: 60,
    allowInsecureLocalhost: false,
  };

  await testAiProvider(config);
  expect(invoke).toHaveBeenCalledWith('test_ai_provider', { config: nativeConfig });

  await runProblemAnalysis('problem-1', 'deep', config);
  expect(invoke).toHaveBeenCalledWith('run_problem_analysis', {
    problemId: 'problem-1',
    mode: 'deep',
    config: nativeConfig,
  });
});
