import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { ProblemDocument } from './ProblemDocument';

const { getProblemDocument, saveProblemField } = vi.hoisted(() => ({ getProblemDocument: vi.fn(), saveProblemField: vi.fn() }));

vi.mock('../../lib/tauri', () => ({ getProblemDocument, saveProblemField }));

test('renders a saved problem as a reading document', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-1',
    title: '',
    status: 'inbox',
    updatedAt: 'version-2',
    fields: [
      { kind: 'stem', value: '财政扩张如何影响 IS 曲线？', updatedAt: 'version-2' },
      { kind: 'own_answer', value: '我认为 IS 会右移。', updatedAt: 'version-2' },
    ],
  });

  render(<ProblemDocument problemId="problem-1" />);

  expect(await screen.findByRole('heading', { name: '财政扩张如何影响 IS 曲线？' })).toBeVisible();
  expect(screen.getByText('我的作答')).toBeVisible();
  expect(screen.getByText('我认为 IS 会右移。')).toBeVisible();
});

test('saves an added stem with the document version', async () => {
  getProblemDocument.mockResolvedValue({ id: 'problem-2', title: '', status: 'inbox', updatedAt: 'version-1', fields: [] });
  saveProblemField.mockResolvedValue({ problemId: 'problem-2', kind: 'stem', value: 'LM 曲线何时右移？', updatedAt: 'version-2' });
  const user = userEvent.setup();

  render(<ProblemDocument problemId="problem-2" />);
  await user.click(await screen.findByRole('button', { name: '补充题干' }));
  await user.type(screen.getByLabelText('编辑题干'), 'LM 曲线何时右移？');
  await user.click(screen.getByRole('button', { name: '保存题干' }));

  expect(saveProblemField).toHaveBeenCalledWith('problem-2', 'stem', 'LM 曲线何时右移？', 'version-1');
  expect(await screen.findByRole('heading', { name: 'LM 曲线何时右移？' })).toBeVisible();
});
