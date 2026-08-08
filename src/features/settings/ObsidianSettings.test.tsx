import { open } from '@tauri-apps/plugin-dialog';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { exportObsidianVault, openObsidianCanvas } from '../../lib/tauri';
import { ObsidianSettings } from './ObsidianSettings';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../lib/tauri')>('../../lib/tauri');
  return { ...actual, exportObsidianVault: vi.fn(), openObsidianCanvas: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
});

test('canceling the directory picker does not start an export', async () => {
  vi.mocked(open).mockResolvedValue(null);
  render(<ObsidianSettings courseId="macro" />);

  await userEvent.click(screen.getByRole('button', { name: '选择 Vault 并导出' }));
  expect(exportObsidianVault).not.toHaveBeenCalled();
});

test('shows a conflict-aware report and opens the returned canvas', async () => {
  vi.mocked(open).mockResolvedValue('C:/Vault');
  vi.mocked(exportObsidianVault).mockResolvedValue({
    written: 5, unchanged: 2, conflicts: 1, failed: 0,
    courseCanvasPath: 'C:/Vault/错题智库/宏观/课程知识网络.canvas',
  });
  render(<ObsidianSettings courseId="macro" />);

  await userEvent.click(screen.getByRole('button', { name: '选择 Vault 并导出' }));
  expect(await screen.findByText(/1 个冲突副本/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: '在 Obsidian 打开' }));
  expect(openObsidianCanvas).toHaveBeenCalledWith('C:/Vault/错题智库/宏观/课程知识网络.canvas');
});
