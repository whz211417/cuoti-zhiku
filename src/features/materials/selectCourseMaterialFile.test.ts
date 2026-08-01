import { expect, test, vi } from 'vitest';
import { selectCourseMaterialFile } from './selectCourseMaterialFile';

const { open } = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open }));

test('opens a single local learning-material picker and returns its path', async () => {
  open.mockResolvedValue('C:/course/chapter-2.pdf');

  await expect(selectCourseMaterialFile()).resolves.toBe('C:/course/chapter-2.pdf');
  expect(open).toHaveBeenCalledWith({
    multiple: false,
    filters: [{ name: '学习资料', extensions: ['pdf', 'md', 'markdown', 'txt'] }],
  });
});

test('returns null when the user cancels material selection', async () => {
  open.mockResolvedValue(null);
  await expect(selectCourseMaterialFile()).resolves.toBeNull();
});
