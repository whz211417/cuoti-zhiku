import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ProblemDocument } from './ProblemDocument';

const { getProblemDocument, hasAiApiKey, runProblemAnalysis, saveProblemField } = vi.hoisted(() => ({
  getProblemDocument: vi.fn(),
  hasAiApiKey: vi.fn(),
  runProblemAnalysis: vi.fn(),
  saveProblemField: vi.fn(),
}));

vi.mock('../../lib/tauri', () => ({ getProblemDocument, hasAiApiKey, runProblemAnalysis, saveProblemField }));

beforeEach(() => vi.resetAllMocks());

test('renders a saved problem as a reading document', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-1',
    title: '',
    status: 'inbox',
    updatedAt: '2026-07-30T08:00:00Z',
    version: 'version-2',
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
  getProblemDocument.mockResolvedValue({ id: 'problem-2', title: '', status: 'inbox', updatedAt: '2026-07-30T08:00:00Z', version: 'version-1', fields: [] });
  saveProblemField.mockResolvedValue({ problemId: 'problem-2', kind: 'stem', value: 'LM 曲线何时右移？', updatedAt: '2026-07-30T08:01:00Z', version: 'version-2' });
  const onSaved = vi.fn();
  const user = userEvent.setup();

  render(<ProblemDocument onSaved={onSaved} problemId="problem-2" />);
  await user.click(await screen.findByRole('button', { name: '补充题干' }));
  await user.type(screen.getByLabelText('编辑题干'), 'LM 曲线何时右移？');
  await user.click(screen.getByRole('button', { name: '保存题干' }));

  expect(saveProblemField).toHaveBeenCalledWith('problem-2', 'stem', 'LM 曲线何时右移？', 'version-1');
  expect(await screen.findByRole('heading', { name: 'LM 曲线何时右移？' })).toBeVisible();
  expect(onSaved).toHaveBeenCalledOnce();
});

test('runs AI only after consent and accepts suggestions one field at a time', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-ai',
    title: '',
    status: 'inbox',
    updatedAt: '2026-07-30T08:00:00Z',
    version: 'version-1',
    fields: [{ kind: 'stem', value: '财政扩张如何影响 IS 曲线？', updatedAt: 'version-1' }],
  });
  hasAiApiKey.mockResolvedValue(true);
  runProblemAnalysis.mockResolvedValue([
    { kind: 'standard_answer', value: 'IS 曲线向右移动。' },
    { kind: 'explanation', value: '政府购买增加会提高总需求。' },
  ]);
  saveProblemField.mockResolvedValue({
    problemId: 'problem-ai',
    kind: 'standard_answer',
    value: 'IS 曲线向右移动。',
    updatedAt: '2026-07-30T08:01:00Z',
    version: 'version-2',
  });
  const onSaved = vi.fn();
  const user = userEvent.setup();
  render(<ProblemDocument onSaved={onSaved} problemId="problem-ai" />);

  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  expect(runProblemAnalysis).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '确认发送给通义千问' }));
  await user.click(await screen.findByRole('button', { name: '采纳标准答案' }));

  expect(runProblemAnalysis).toHaveBeenCalledWith('problem-ai', 'flash');
  expect(saveProblemField).toHaveBeenCalledWith(
    'problem-ai',
    'standard_answer',
    'IS 曲线向右移动。',
    'version-1',
  );
  expect(onSaved).toHaveBeenCalledOnce();
  expect(screen.getByText('政府购买增加会提高总需求。')).toBeVisible();
});

test('keeps the draft mounted and retries a user field after persistence fails', async () => {
  getProblemDocument.mockResolvedValue({ id: 'problem-failed', title: '', status: 'inbox', updatedAt: '2026-07-30T08:00:00Z', version: 'version-1', fields: [] });
  saveProblemField
    .mockRejectedValueOnce(new Error('database busy'))
    .mockResolvedValueOnce({
      problemId: 'problem-failed',
      kind: 'stem',
      value: '不会被丢失的草稿',
      updatedAt: '2026-07-30T08:01:00Z',
      version: 'version-2',
    });
  const onSaved = vi.fn();
  const user = userEvent.setup();

  render(<ProblemDocument onSaved={onSaved} problemId="problem-failed" />);
  await user.click(await screen.findByRole('button', { name: '补充题干' }));
  await user.type(screen.getByLabelText('编辑题干'), '不会被丢失的草稿');
  await user.click(screen.getByRole('button', { name: '保存题干' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('保存没有完成');
  expect(screen.getByRole('article', { name: '题目档案' })).toBeVisible();
  expect(screen.getByLabelText('编辑题干')).toHaveValue('不会被丢失的草稿');
  expect(onSaved).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: '重试保存题干' }));

  expect(saveProblemField).toHaveBeenCalledTimes(2);
  expect(saveProblemField).toHaveBeenLastCalledWith(
    'problem-failed',
    'stem',
    '不会被丢失的草稿',
    'version-1',
  );
  expect(await screen.findByRole('heading', { name: '不会被丢失的草稿' })).toBeVisible();
  expect(onSaved).toHaveBeenCalledOnce();
});

test('reloads a stale document version without discarding the draft before retry', async () => {
  getProblemDocument
    .mockResolvedValueOnce({
      id: 'problem-conflict',
      title: '',
      status: 'inbox',
      updatedAt: '2026-07-30T08:00:00Z',
      version: 'version-1',
      fields: [{ kind: 'stem', value: '打开时的题干', updatedAt: '2026-07-30T08:00:00Z' }],
    })
    .mockResolvedValueOnce({
      id: 'problem-conflict',
      title: '',
      status: 'inbox',
      updatedAt: '2026-07-30T08:01:00Z',
      version: 'version-2',
      fields: [{ kind: 'stem', value: '另一处保存的题干', updatedAt: '2026-07-30T08:01:00Z' }],
    });
  saveProblemField
    .mockRejectedValueOnce(new Error('stale document version'))
    .mockResolvedValueOnce({
      problemId: 'problem-conflict',
      kind: 'stem',
      value: '保留的本地草稿',
      updatedAt: '2026-07-30T08:02:00Z',
      version: 'version-3',
    });
  const user = userEvent.setup();

  render(<ProblemDocument problemId="problem-conflict" />);
  await user.click(await screen.findByRole('button', { name: '编辑题干' }));
  const editor = screen.getByLabelText('编辑题干');
  await user.clear(editor);
  await user.type(editor, '保留的本地草稿');
  await user.click(screen.getByRole('button', { name: '保存题干' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('已重新载入最新内容');
  expect(getProblemDocument).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('编辑题干')).toHaveValue('保留的本地草稿');

  await user.click(screen.getByRole('button', { name: '重试保存题干' }));

  expect(saveProblemField).toHaveBeenLastCalledWith(
    'problem-conflict',
    'stem',
    '保留的本地草稿',
    'version-2',
  );
  expect(await screen.findByRole('heading', { name: '保留的本地草稿' })).toBeVisible();
});

test('lets the learner explicitly choose deep analysis before sending', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-deep',
    title: '',
    status: 'inbox',
    updatedAt: '2026-07-30T08:00:00Z',
    version: 'version-1',
    fields: [{ kind: 'stem', value: '解释流动性陷阱。', updatedAt: 'version-1' }],
  });
  hasAiApiKey.mockResolvedValue(true);
  runProblemAnalysis.mockResolvedValue([]);
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-deep" />);

  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  expect(screen.getByText('若原件为题图，本次会一并发送')).toBeVisible();
  await user.click(screen.getByRole('radio', { name: '深度分析' }));
  await user.click(screen.getByRole('button', { name: '确认发送给通义千问' }));

  expect(runProblemAnalysis).toHaveBeenCalledWith('problem-deep', 'deep');
});
