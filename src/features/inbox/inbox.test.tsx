import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { IngestDropzone } from './IngestDropzone';

const { open, importFiles } = vi.hoisted(() => ({
  open: vi.fn(),
  importFiles: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open }));
vi.mock('../../lib/tauri', () => ({ importFiles }));

beforeEach(() => vi.clearAllMocks());

test('shows each successfully stored file in the inbox after selection', async () => {
  open.mockResolvedValue(['C:/notes/is-lm.pdf']);
  importFiles.mockResolvedValue([
    {
      sourcePath: 'C:/notes/is-lm.pdf',
      item: { id: 'inbox-1', attachmentId: 'attachment-1', filename: 'is-lm.pdf', createdAt: '1' },
      error: null,
    },
  ]);

  render(<IngestDropzone />);
  await userEvent.click(screen.getByRole('button', { name: '投进题目' }));

  expect(await screen.findByText('is-lm.pdf')).toBeVisible();
  expect(screen.getByText('已安全保存')).toBeVisible();
});
