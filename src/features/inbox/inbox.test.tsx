import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { IngestDropzone } from './IngestDropzone';

const { open, importFiles, getInboxItems } = vi.hoisted(() => ({
  open: vi.fn(),
  importFiles: vi.fn(),
  getInboxItems: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open }));
vi.mock('../../lib/tauri', () => ({ getInboxItems, importFiles }));

beforeEach(() => {
  vi.clearAllMocks();
  getInboxItems.mockResolvedValue([]);
});

test('restores locally stored inbox items when the app opens', async () => {
  getInboxItems.mockResolvedValue([
    { id: 'inbox-stored', problemId: 'problem-stored', attachmentId: 'attachment-stored', filename: 'chapter-3.png', createdAt: '2' },
  ]);

  render(<IngestDropzone courseId={null} />);

  expect(await screen.findByText('chapter-3.png')).toBeVisible();
  expect(screen.getByText('已安全保存')).toBeVisible();
});

test('shows each successfully stored file in the inbox after selection', async () => {
  open.mockResolvedValue(['C:/notes/is-lm.pdf']);
  importFiles.mockResolvedValue([
    {
      sourcePath: 'C:/notes/is-lm.pdf',
      item: { id: 'inbox-1', problemId: 'problem-1', attachmentId: 'attachment-1', filename: 'is-lm.pdf', createdAt: '1' },
      error: null,
    },
  ]);

  render(<IngestDropzone courseId={null} />);
  await userEvent.click(screen.getByRole('button', { name: '投进题目' }));

  expect(await screen.findByText('is-lm.pdf')).toBeVisible();
  expect(screen.getByText('已安全保存')).toBeVisible();
});
