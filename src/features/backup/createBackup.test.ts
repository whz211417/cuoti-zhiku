import { save } from '@tauri-apps/plugin-dialog';
import { expect, test, vi } from 'vitest';
import { createBackup } from './createBackup';

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('../../lib/tauri', () => ({ createLibraryBackup: vi.fn() }));

test('writes a backup only after a destination is selected', async () => {
  vi.mocked(save).mockResolvedValue('C:/backups/错题智库.czkbackup');
  const { createLibraryBackup } = await import('../../lib/tauri');
  vi.mocked(createLibraryBackup).mockResolvedValue({ originalCount: 4, totalBytes: 2048 });

  await expect(createBackup()).resolves.toEqual({ originalCount: 4, totalBytes: 2048 });
  expect(createLibraryBackup).toHaveBeenCalledWith('C:/backups/错题智库.czkbackup');
  expect(save).toHaveBeenCalledWith(expect.objectContaining({
    defaultPath: '错题智库-完整备份.czkbackup',
  }));
});
