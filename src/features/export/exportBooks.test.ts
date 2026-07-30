import { save } from '@tauri-apps/plugin-dialog';
import { beforeEach, expect, test, vi } from 'vitest';
import { saveProblemBook } from './exportBooks';

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('../../lib/tauri', () => ({ exportProblemBook: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

test('asks for a destination before exporting the answer book', async () => {
  vi.mocked(save).mockResolvedValue('C:/Users/test/Documents/答案解析册.md');
  const { exportProblemBook } = await import('../../lib/tauri');
  vi.mocked(exportProblemBook).mockResolvedValue({ markdown: '# 错题智库 · 答案解析册', problemCount: 3 });

  await expect(saveProblemBook('answers')).resolves.toEqual({ cancelled: false, problemCount: 3 });
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: '错题智库-答案解析册.md' }));
  expect(exportProblemBook).toHaveBeenCalledWith('C:/Users/test/Documents/答案解析册.md', true);
});

test('does not export anything when the save dialog is cancelled', async () => {
  vi.mocked(save).mockResolvedValue(null);
  const { exportProblemBook } = await import('../../lib/tauri');

  await expect(saveProblemBook('questions')).resolves.toEqual({ cancelled: true, problemCount: 0 });
  expect(exportProblemBook).not.toHaveBeenCalled();
});
