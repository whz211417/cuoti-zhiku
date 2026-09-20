import { beforeEach, describe, expect, it, vi } from 'vitest';

const { checkMock, closeMock, downloadAndInstallMock, getVersionMock } = vi.hoisted(() => ({
  checkMock: vi.fn(),
  closeMock: vi.fn(),
  downloadAndInstallMock: vi.fn(),
  getVersionMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/app', () => ({ getVersion: getVersionMock }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: checkMock }));

import { nativeUpdateClient } from './updateClient';

describe('nativeUpdateClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVersionMock.mockResolvedValue('0.5.1');
  });

  it('reads the installed application version', async () => {
    await expect(nativeUpdateClient.getCurrentVersion()).resolves.toBe('0.5.1');
  });

  it('returns null when the signed endpoint has no update', async () => {
    checkMock.mockResolvedValue(null);

    await expect(nativeUpdateClient.check()).resolves.toBeNull();
  });

  it('normalizes metadata and cumulative download progress', async () => {
    downloadAndInstallMock.mockImplementation(async (onEvent: (event: unknown) => void) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 40 } });
      onEvent({ event: 'Progress', data: { chunkLength: 60 } });
      onEvent({ event: 'Finished' });
    });
    checkMock.mockResolvedValue({
      version: '0.5.2',
      body: '  更顺手的更新体验  ',
      downloadAndInstall: downloadAndInstallMock,
      close: closeMock,
    });
    const progress: Array<{ downloaded: number; total: number | null }> = [];

    const update = await nativeUpdateClient.check();
    await update?.downloadAndInstall((next) => progress.push(next));
    await update?.close();

    expect(update).toMatchObject({ version: '0.5.2', notes: '更顺手的更新体验' });
    expect(progress).toEqual([
      { downloaded: 0, total: 100 },
      { downloaded: 40, total: 100 },
      { downloaded: 100, total: 100 },
    ]);
    expect(downloadAndInstallMock).toHaveBeenCalledWith(expect.any(Function), { restartAfterInstall: true });
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it('keeps unknown download size explicit', async () => {
    downloadAndInstallMock.mockImplementation(async (onEvent: (event: unknown) => void) => {
      onEvent({ event: 'Started', data: {} });
      onEvent({ event: 'Progress', data: { chunkLength: 12 } });
    });
    checkMock.mockResolvedValue({
      version: '0.5.2',
      body: '   ',
      downloadAndInstall: downloadAndInstallMock,
      close: closeMock,
    });
    const progress: Array<{ downloaded: number; total: number | null }> = [];

    const update = await nativeUpdateClient.check();
    await update?.downloadAndInstall((next) => progress.push(next));

    expect(update?.notes).toBeNull();
    expect(progress).toEqual([
      { downloaded: 0, total: null },
      { downloaded: 12, total: null },
    ]);
  });
});
