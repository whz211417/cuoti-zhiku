import { invoke } from '@tauri-apps/api/core';
import { beforeEach, expect, test, vi } from 'vitest';
import { getDashboardOverview, getLibraryHealth, importFiles, searchLibrary } from './tauri';

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
