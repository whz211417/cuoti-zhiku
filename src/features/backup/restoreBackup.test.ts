import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(), open: vi.fn() }));
vi.mock('../../lib/tauri', () => ({ restoreLibraryBackup: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

test('restores only after selecting a backup and confirming replacement', async () => {
  const { confirm, open } = await import('@tauri-apps/plugin-dialog');
  vi.mocked(open).mockResolvedValue('C:/backups/错题智库.czkbackup');
  vi.mocked(confirm).mockResolvedValue(true);
  const { restoreLibraryBackup } = await import('../../lib/tauri');
  vi.mocked(restoreLibraryBackup).mockResolvedValue('C:/backups/before-restore.sqlite3');
  const { restoreBackup } = await import('./restoreBackup');

  await expect(restoreBackup()).resolves.toEqual({
    restored: true,
    rescuePath: 'C:/backups/before-restore.sqlite3',
  });

  expect(confirm).toHaveBeenCalled();
  expect(restoreLibraryBackup).toHaveBeenCalledWith('C:/backups/错题智库.czkbackup');
});

test('does not restore when the user declines the final confirmation', async () => {
  const { confirm, open } = await import('@tauri-apps/plugin-dialog');
  vi.mocked(open).mockResolvedValue('C:/backups/错题智库.sqlite3');
  vi.mocked(confirm).mockResolvedValue(false);
  const { restoreLibraryBackup } = await import('../../lib/tauri');
  const { restoreBackup } = await import('./restoreBackup');

  await expect(restoreBackup()).resolves.toEqual({ restored: false, rescuePath: null });

  expect(restoreLibraryBackup).not.toHaveBeenCalled();
});
