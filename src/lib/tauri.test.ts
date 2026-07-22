import { invoke } from '@tauri-apps/api/core';
import { beforeEach, expect, test, vi } from 'vitest';
import { getLibraryHealth, importFiles } from './tauri';

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
