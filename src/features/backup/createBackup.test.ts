import { save } from '@tauri-apps/plugin-dialog';
import { expect, test, vi } from 'vitest';
import { createBackup } from './createBackup';

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('../../lib/tauri', () => ({ createLibraryBackup: vi.fn() }));

test('writes a backup only after a destination is selected', async () => {
  vi.mocked(save).mockResolvedValue('C:/backups/错题智库.sqlite3');
  const { createLibraryBackup } = await import('../../lib/tauri');

  await expect(createBackup()).resolves.toBe(true);
  expect(createLibraryBackup).toHaveBeenCalledWith('C:/backups/错题智库.sqlite3');
});
