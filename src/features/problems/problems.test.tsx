import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import type { ProblemDocument as ProblemDocumentModel } from '../../lib/tauri';
import type { AiProviderConfig } from '../settings/aiProviderCatalog';
import { ProblemDocument } from './ProblemDocument';

const { getProblemDocument, hasAiProviderKey, loadAiProviderState, runProblemAnalysis, saveProblemField, searchCourseMaterial } = vi.hoisted(() => ({
  getProblemDocument: vi.fn(),
  hasAiProviderKey: vi.fn(),
  loadAiProviderState: vi.fn(),
  runProblemAnalysis: vi.fn(),
  saveProblemField: vi.fn(),
  searchCourseMaterial: vi.fn(),
}));

vi.mock('../../lib/tauri', () => ({ getProblemDocument, hasAiProviderKey, runProblemAnalysis, saveProblemField, searchCourseMaterial }));
vi.mock('../settings/aiProviderStore', () => ({ loadAiProviderState }));

const deepseekConfig: AiProviderConfig = {
  id: 'deepseek',
  displayName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  selectedModel: 'deepseek-v4-flash',
  visionModel: null,
  supportsVision: false,
  requestTimeoutSeconds: 60,
  isEnabled: true,
  preset: 'deepseek',
  allowInsecureLocalhost: false,
};
const visionConfig: AiProviderConfig = {
  ...deepseekConfig,
  id: 'zhipu',
  displayName: '智谱 AI',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  selectedModel: 'glm-5.2',
  visionModel: 'glm-4.5v',
  supportsVision: true,
  preset: 'zhipu',
};

beforeEach(() => {
  vi.resetAllMocks();
  loadAiProviderState.mockResolvedValue({ providers: [deepseekConfig], activeProviderId: 'deepseek' });
  hasAiProviderKey.mockResolvedValue(true);
  searchCourseMaterial.mockResolvedValue([]);
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

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

test('ignores an initial document response after a different problem is selected', async () => {
  const problemA = deferred<ProblemDocumentModel>();
  const problemB = deferred<ProblemDocumentModel>();
  getProblemDocument.mockImplementation((problemId: string) => (
    problemId === 'problem-race-a' ? problemA.promise : problemB.promise
  ));
  const { rerender } = render(<ProblemDocument problemId="problem-race-a" />);

  rerender(<ProblemDocument problemId="problem-race-b" />);
  await act(async () => problemB.resolve({
    id: 'problem-race-b',
    title: '',
    status: 'inbox',
    updatedAt: '2026-07-30T08:01:00Z',
    version: 'version-b1',
    fields: [{ kind: 'stem', value: '题目 B 的题干', updatedAt: '2026-07-30T08:01:00Z' }],
  }));
  expect(await screen.findByRole('heading', { name: '题目 B 的题干' })).toBeVisible();

  await act(async () => problemA.resolve({
    id: 'problem-race-a',
    title: '',
    status: 'inbox',
    updatedAt: '2026-07-30T08:00:00Z',
    version: 'version-a1',
    fields: [{ kind: 'stem', value: '迟到的题目 A', updatedAt: '2026-07-30T08:00:00Z' }],
  }));

  expect(screen.getByRole('heading', { name: '题目 B 的题干' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: '迟到的题目 A' })).not.toBeInTheDocument();
});

test('ignores an initial document rejection after a different problem is selected', async () => {
  const problemA = deferred<ProblemDocumentModel>();
  getProblemDocument.mockImplementation((problemId: string) => (
    problemId === 'problem-race-a'
      ? problemA.promise
      : Promise.resolve({
        id: 'problem-race-b',
        title: '',
        status: 'inbox',
        updatedAt: '2026-07-30T08:01:00Z',
        version: 'version-b1',
        fields: [{ kind: 'stem', value: '题目 B 的题干', updatedAt: '2026-07-30T08:01:00Z' }],
      })
  ));
  const { rerender } = render(<ProblemDocument problemId="problem-race-a" />);

  rerender(<ProblemDocument problemId="problem-race-b" />);
  expect(await screen.findByRole('heading', { name: '题目 B 的题干' })).toBeVisible();
  await act(async () => problemA.reject(new Error('late problem A failure')));

  expect(screen.getByRole('heading', { name: '题目 B 的题干' })).toBeVisible();
  expect(screen.queryByText('暂时无法打开这份题目档案。')).not.toBeInTheDocument();
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
    courseId: 'macro',
    hasImageAttachment: true,
    title: '',
    status: 'inbox',
    updatedAt: '2026-07-30T08:00:00Z',
    version: 'version-1',
    fields: [{ kind: 'stem', value: '财政扩张如何影响 IS 曲线？', updatedAt: 'version-1' }],
  });
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
  expect(screen.getByText('DeepSeek · deepseek-v4-flash')).toBeVisible();
  expect(screen.getByText('题干：财政扩张如何影响 IS 曲线？')).toBeVisible();
  expect(screen.getByText('有题图，本次不发送')).toBeVisible();
  expect(screen.getByText('学习资料片段：0 段')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '仅本次发送' }));
  await user.click(await screen.findByRole('button', { name: '采纳标准答案' }));

  expect(runProblemAnalysis).toHaveBeenCalledWith('problem-ai', 'flash', deepseekConfig, [], 'version-1', false);
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

test('ignores a late conflict refresh after another problem is selected', async () => {
  const conflictRefresh = deferred<ProblemDocumentModel>();
  let problemALoads = 0;
  getProblemDocument.mockImplementation((problemId: string) => {
    if (problemId === 'problem-race-a') {
      problemALoads += 1;
      return problemALoads === 1
        ? Promise.resolve({
          id: 'problem-race-a',
          title: '',
          status: 'inbox',
          updatedAt: '2026-07-30T08:00:00Z',
          version: 'version-a1',
          fields: [{ kind: 'stem', value: '题目 A 的题干', updatedAt: '2026-07-30T08:00:00Z' }],
        })
        : conflictRefresh.promise;
    }
    return Promise.resolve({
      id: 'problem-race-b',
      title: '',
      status: 'inbox',
      updatedAt: '2026-07-30T08:02:00Z',
      version: 'version-b1',
      fields: [{ kind: 'stem', value: '题目 B 的题干', updatedAt: '2026-07-30T08:02:00Z' }],
    });
  });
  saveProblemField.mockRejectedValueOnce(new Error('stale document version'));
  const user = userEvent.setup();
  const { rerender } = render(<ProblemDocument problemId="problem-race-a" />);

  await user.click(await screen.findByRole('button', { name: '编辑题干' }));
  await user.clear(screen.getByLabelText('编辑题干'));
  await user.type(screen.getByLabelText('编辑题干'), '题目 A 的本地草稿');
  await user.click(screen.getByRole('button', { name: '保存题干' }));
  await waitFor(() => expect(getProblemDocument).toHaveBeenCalledTimes(2));

  rerender(<ProblemDocument problemId="problem-race-b" />);
  expect(await screen.findByRole('heading', { name: '题目 B 的题干' })).toBeVisible();
  await act(async () => conflictRefresh.resolve({
    id: 'problem-race-a',
    title: '',
    status: 'inbox',
    updatedAt: '2026-07-30T08:01:00Z',
    version: 'version-a2',
    fields: [{ kind: 'stem', value: '题目 A 的远端更新', updatedAt: '2026-07-30T08:01:00Z' }],
  }));

  expect(screen.getByRole('heading', { name: '题目 B 的题干' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '重试保存题干' })).not.toBeInTheDocument();
  expect(saveProblemField).toHaveBeenCalledTimes(1);
});

test('ignores a late conflict-refresh rejection in the next problem editor', async () => {
  const conflictRefresh = deferred<ProblemDocumentModel>();
  let problemALoads = 0;
  getProblemDocument.mockImplementation((problemId: string) => {
    if (problemId === 'problem-race-a') {
      problemALoads += 1;
      return problemALoads === 1
        ? Promise.resolve({
          id: 'problem-race-a',
          title: '',
          status: 'inbox',
          updatedAt: '2026-07-30T08:00:00Z',
          version: 'version-a1',
          fields: [{ kind: 'stem', value: '题目 A 的题干', updatedAt: '2026-07-30T08:00:00Z' }],
        })
        : conflictRefresh.promise;
    }
    return Promise.resolve({
      id: 'problem-race-b',
      title: '',
      status: 'inbox',
      updatedAt: '2026-07-30T08:02:00Z',
      version: 'version-b1',
      fields: [{ kind: 'stem', value: '题目 B 的题干', updatedAt: '2026-07-30T08:02:00Z' }],
    });
  });
  saveProblemField.mockRejectedValueOnce(new Error('stale document version'));
  const user = userEvent.setup();
  const { rerender } = render(<ProblemDocument problemId="problem-race-a" />);

  await user.click(await screen.findByRole('button', { name: '编辑题干' }));
  await user.click(screen.getByRole('button', { name: '保存题干' }));
  await waitFor(() => expect(getProblemDocument).toHaveBeenCalledTimes(2));

  rerender(<ProblemDocument problemId="problem-race-b" />);
  await user.click(await screen.findByRole('button', { name: '编辑题干' }));
  await user.clear(screen.getByLabelText('编辑题干'));
  await user.type(screen.getByLabelText('编辑题干'), '题目 B 的本地草稿');
  await act(async () => conflictRefresh.reject(new Error('late problem A refresh failure')));

  expect(screen.getByLabelText('编辑题干')).toHaveValue('题目 B 的本地草稿');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('lets the learner explicitly choose deep analysis before sending', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-deep',
    courseId: 'macro',
    title: '',
    status: 'inbox',
    updatedAt: '2026-07-30T08:00:00Z',
    version: 'version-1',
    fields: [{ kind: 'stem', value: '解释流动性陷阱。', updatedAt: 'version-1' }],
  });
  runProblemAnalysis.mockResolvedValue([]);
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-deep" />);

  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  expect(screen.getByText('不包含题图')).toBeVisible();
  await user.click(screen.getByRole('radio', { name: '深度分析' }));
  await user.click(screen.getByRole('button', { name: '仅本次发送' }));

  expect(runProblemAnalysis).toHaveBeenCalledWith('problem-deep', 'deep', deepseekConfig, [], 'version-1', false);
});

test('sends a question image only after explicit consent and shows the actual vision model', async () => {
  loadAiProviderState.mockResolvedValue({ providers: [visionConfig], activeProviderId: 'zhipu' });
  getProblemDocument.mockResolvedValue({
    id: 'problem-image', courseId: 'macro', hasImageAttachment: true, title: '', status: 'inbox',
    updatedAt: '2026-07-30', version: 'version-image', fields: [],
  });
  runProblemAnalysis.mockResolvedValue([]);
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-image" />);
  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  const imageConsent = screen.getByRole('checkbox', { name: '本次发送题目原图' });
  expect(imageConsent).not.toBeChecked();
  expect(screen.getByText('智谱 AI · glm-5.2')).toBeVisible();
  await user.click(imageConsent);
  expect(screen.getByText('智谱 AI · glm-4.5v')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '仅本次发送' }));

  expect(runProblemAnalysis).toHaveBeenCalledWith(
    'problem-image', 'flash', visionConfig, [], 'version-image', true,
  );
});

test('opens AI settings without changing the local record when no active provider exists', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-no-provider', courseId: 'macro', title: '', status: 'inbox',
    updatedAt: '2026-07-30T08:00:00Z', version: 'version-1', fields: [],
  });
  loadAiProviderState.mockResolvedValue({ providers: [], activeProviderId: null });
  const onOpenAiSettings = vi.fn();
  const user = userEvent.setup();
  render(<ProblemDocument onOpenAiSettings={onOpenAiSettings} problemId="problem-no-provider" />);

  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));

  expect(onOpenAiSettings).toHaveBeenCalledOnce();
  expect(runProblemAnalysis).not.toHaveBeenCalled();
  expect(saveProblemField).not.toHaveBeenCalled();
});

test('opens AI settings without sending when the active provider has no saved key', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-no-key', courseId: 'macro', title: '', status: 'inbox',
    updatedAt: '2026-07-30T08:00:00Z', version: 'version-1', fields: [],
  });
  hasAiProviderKey.mockResolvedValue(false);
  const onOpenAiSettings = vi.fn();
  const user = userEvent.setup();
  render(<ProblemDocument onOpenAiSettings={onOpenAiSettings} problemId="problem-no-key" />);

  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));

  expect(hasAiProviderKey).toHaveBeenCalledWith(deepseekConfig);
  expect(onOpenAiSettings).toHaveBeenCalledOnce();
  expect(runProblemAnalysis).not.toHaveBeenCalled();
  expect(saveProblemField).not.toHaveBeenCalled();
});

test('sends only explicitly selected same-course material chunks in request order', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-materials', courseId: 'macro', title: '', status: 'inbox',
    updatedAt: '2026-07-30T08:00:00Z', version: 'version-1',
    fields: [{ kind: 'stem', value: '需求弹性是什么？', updatedAt: 'version-1' }],
  });
  searchCourseMaterial.mockResolvedValue([
    { chunkId: 'm1-c1', materialId: 'm1', filename: '第一章.pdf', excerpt: '片段一' },
    { chunkId: 'm1-c2', materialId: 'm1', filename: '第一章.pdf', excerpt: '片段二' },
    { chunkId: 'm2-c1', materialId: 'm2', filename: '讲义.md', excerpt: '片段三' },
  ]);
  runProblemAnalysis.mockResolvedValue([]);
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-materials" />);

  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  await user.type(screen.getByRole('searchbox', { name: '搜索本课程学习资料' }), '需求弹性');
  await user.click(screen.getByRole('button', { name: '查找片段' }));
  for (const excerpt of ['片段一', '片段二', '片段三']) {
    await user.click(await screen.findByRole('checkbox', { name: excerpt }));
  }
  await user.clear(screen.getByRole('searchbox', { name: '搜索本课程学习资料' }));
  expect(screen.getByRole('region', { name: '本次已选片段' })).toHaveTextContent('第一章.pdf');
  expect(screen.getByRole('region', { name: '本次已选片段' })).toHaveTextContent('片段三');
  expect(screen.getByText('片段三')).toBeVisible();
  expect(screen.getByText('学习资料片段：3 段')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '仅本次发送' }));

  expect(searchCourseMaterial).toHaveBeenCalledWith('macro', '需求弹性');
  expect(runProblemAnalysis).toHaveBeenCalledWith(
    'problem-materials', 'flash', deepseekConfig, ['m1-c1', 'm1-c2', 'm2-c1'], 'version-1', false,
  );
});

test('does not allow more than three material snippets', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-limit', courseId: 'macro', title: '', status: 'inbox',
    updatedAt: '2026-07-30T08:00:00Z', version: 'version-1',
    fields: [{ kind: 'stem', value: '题干', updatedAt: 'version-1' }],
  });
  searchCourseMaterial.mockResolvedValue([1, 2, 3, 4].map((number) => ({
    chunkId: `chunk-${number}`, materialId: 'm1', filename: '教材.pdf', excerpt: `片段${number}`,
  })));
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-limit" />);
  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  await user.type(screen.getByRole('searchbox', { name: '搜索本课程学习资料' }), '片段');
  await user.click(screen.getByRole('button', { name: '查找片段' }));
  for (const excerpt of ['片段1', '片段2', '片段3']) await user.click(await screen.findByRole('checkbox', { name: excerpt }));

  expect(screen.getByRole('checkbox', { name: '片段4' })).toBeDisabled();
});

test('ignores a late AI response after another problem is selected', async () => {
  const response = deferred<{ kind: string; value: string }[]>();
  getProblemDocument.mockImplementation((id: string) => Promise.resolve({
    id, courseId: 'macro', title: '', status: 'inbox', updatedAt: '2026-07-30', version: 'v1',
    fields: [{ kind: 'stem', value: id === 'p1' ? '题目一' : '题目二', updatedAt: 'v1' }],
  }));
  runProblemAnalysis.mockReturnValue(response.promise);
  const user = userEvent.setup();
  const { rerender } = render(<ProblemDocument problemId="p1" />);
  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  await user.click(screen.getByRole('button', { name: '仅本次发送' }));

  rerender(<ProblemDocument problemId="p2" />);
  await act(async () => response.resolve([{ kind: 'stem', value: '迟到的旧建议' }]));

  expect(await screen.findByRole('heading', { name: '题目二' })).toBeVisible();
  expect(screen.queryByDisplayValue('迟到的旧建议')).not.toBeInTheDocument();
});

test('discards a late AI response when the active provider model changes', async () => {
  const response = deferred<{ kind: string; value: string }[]>();
  const changedProvider = { ...deepseekConfig, selectedModel: 'deepseek-v4-pro' };
  loadAiProviderState
    .mockResolvedValueOnce({ providers: [deepseekConfig], activeProviderId: 'deepseek' })
    .mockResolvedValueOnce({ providers: [changedProvider], activeProviderId: 'deepseek' });
  getProblemDocument.mockResolvedValue({
    id: 'problem-provider-change', courseId: 'macro', title: '', status: 'inbox',
    updatedAt: '2026-07-30', version: 'v1',
    fields: [{ kind: 'stem', value: '题干', updatedAt: 'v1' }],
  });
  runProblemAnalysis.mockReturnValue(response.promise);
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-provider-change" />);
  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  await user.click(screen.getByRole('button', { name: '仅本次发送' }));
  await act(async () => response.resolve([{ kind: 'stem', value: '旧模型建议' }]));

  expect(screen.queryByDisplayValue('旧模型建议')).not.toBeInTheDocument();
  expect(await screen.findByText('AI 平台配置已改变，请核对后重新发送。')).toBeVisible();
});

test('ignores a late material search after the query changes', async () => {
  const searchResponse = deferred<Array<{ chunkId: string; materialId: string; filename: string; excerpt: string }>>();
  searchCourseMaterial.mockReturnValue(searchResponse.promise);
  getProblemDocument.mockResolvedValue({
    id: 'problem-search-race', courseId: 'macro', title: '', status: 'inbox',
    updatedAt: '2026-07-30', version: 'v1', fields: [{ kind: 'stem', value: '题干', updatedAt: 'v1' }],
  });
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-search-race" />);
  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  const input = screen.getByRole('searchbox', { name: '搜索本课程学习资料' });
  await user.type(input, '旧查询');
  await user.click(screen.getByRole('button', { name: '查找片段' }));
  await user.clear(input);
  await user.type(input, '新查询');
  await act(async () => searchResponse.resolve([
    { chunkId: 'old-chunk', materialId: 'old', filename: '旧资料.md', excerpt: '迟到的旧片段' },
  ]));

  expect(screen.queryByText('迟到的旧片段')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查找片段' })).toBeEnabled();
});

test('ignores a late AI response after the review dialog closes', async () => {
  const response = deferred<{ kind: string; value: string }[]>();
  getProblemDocument.mockResolvedValue({
    id: 'problem-close', courseId: 'macro', title: '', status: 'inbox', updatedAt: '2026-07-30', version: 'v1',
    fields: [{ kind: 'stem', value: '题干', updatedAt: 'v1' }],
  });
  runProblemAnalysis.mockReturnValue(response.promise);
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-close" />);
  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  await user.click(screen.getByRole('button', { name: '仅本次发送' }));
  await user.click(screen.getByRole('button', { name: '关闭 AI 审核' }));
  await act(async () => response.resolve([{ kind: 'stem', value: '关闭后的建议' }]));

  expect(screen.queryByRole('dialog', { name: 'AI 建议审核' })).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('关闭后的建议')).not.toBeInTheDocument();
});

test('shows a string rejection from the native AI command', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-error', courseId: 'macro', title: '', status: 'inbox', updatedAt: '2026-07-30', version: 'v1',
    fields: [{ kind: 'stem', value: '题干', updatedAt: 'v1' }],
  });
  runProblemAnalysis.mockRejectedValue('AI 账户额度不足或计费不可用，请检查余额。');
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-error" />);
  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  await user.click(screen.getByRole('button', { name: '仅本次发送' }));

  expect(await screen.findByText('AI 账户额度不足或计费不可用，请检查余额。')).toBeVisible();
});

test('traps focus in the modal, closes with Escape, and restores the AI trigger', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-focus', courseId: 'macro', title: '', status: 'inbox', updatedAt: '2026-07-30', version: 'v1',
    fields: [{ kind: 'stem', value: '题干', updatedAt: 'v1' }],
  });
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-focus" />);
  const trigger = await screen.findByRole('button', { name: 'AI 辅助整理' });
  await user.click(trigger);
  const close = screen.getByRole('button', { name: '关闭 AI 审核' });
  const send = screen.getByRole('button', { name: '仅本次发送' });
  expect(close).toHaveFocus();
  await user.tab({ shift: true });
  expect(send).toHaveFocus();
  await user.tab();
  expect(close).toHaveFocus();
  await user.keyboard('{Escape}');

  expect(screen.queryByRole('dialog', { name: 'AI 建议审核' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test('keeps image sending disabled for a text-only provider while allowing the text request', async () => {
  getProblemDocument.mockResolvedValue({
    id: 'problem-text-only', courseId: 'macro', hasImageAttachment: true, title: '', status: 'inbox',
    updatedAt: '2026-07-30', version: 'v1',
    fields: [{ kind: 'stem', value: '只发送文字的题干', updatedAt: 'v1' }],
  });
  runProblemAnalysis.mockResolvedValue([]);
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-text-only" />);

  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  expect(screen.getByRole('checkbox', { name: '本次发送题目原图' })).toBeDisabled();
  expect(screen.getByText('当前平台不支持题图；仍可只发送文字')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '仅本次发送' }));

  expect(runProblemAnalysis).toHaveBeenCalledWith(
    'problem-text-only', 'flash', deepseekConfig, [], 'v1', false,
  );
});

test('locks every suggestion control while one accepted field is saving', async () => {
  const save = deferred<{ problemId: string; kind: string; value: string; updatedAt: string; version: string }>();
  getProblemDocument.mockResolvedValue({
    id: 'problem-lock', courseId: 'macro', title: '', status: 'inbox', updatedAt: '2026-07-30', version: 'v1',
    fields: [{ kind: 'stem', value: '题干', updatedAt: 'v1' }],
  });
  runProblemAnalysis.mockResolvedValue([
    { kind: 'standard_answer', value: '答案' },
    { kind: 'explanation', value: '解析' },
  ]);
  saveProblemField.mockReturnValue(save.promise);
  const user = userEvent.setup();
  render(<ProblemDocument problemId="problem-lock" />);

  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  await user.click(screen.getByRole('button', { name: '仅本次发送' }));
  await user.click(await screen.findByRole('button', { name: '采纳标准答案' }));

  expect(screen.getByRole('textbox', { name: '编辑 AI 解析建议' })).toBeDisabled();
  expect(screen.getAllByRole('button', { name: '拒绝' }).every((button) => button.hasAttribute('disabled'))).toBe(true);
  expect(screen.getByRole('button', { name: '采纳解析' })).toBeDisabled();
});

test('does not merge an accepted suggestion after switching problems', async () => {
  const saved = deferred<{ problemId: string; kind: string; value: string; updatedAt: string; version: string }>();
  getProblemDocument.mockImplementation((id: string) => Promise.resolve({
    id, courseId: 'macro', title: '', status: 'inbox', updatedAt: '2026-07-30', version: 'v1',
    fields: [{ kind: 'stem', value: id === 'accept-a' ? '题目 A' : '题目 B', updatedAt: 'v1' }],
  }));
  runProblemAnalysis.mockResolvedValue([{ kind: 'standard_answer', value: '题目 A 的建议答案' }]);
  saveProblemField.mockReturnValue(saved.promise);
  const user = userEvent.setup();
  const view = render(<ProblemDocument problemId="accept-a" />);
  await user.click(await screen.findByRole('button', { name: 'AI 辅助整理' }));
  await user.click(screen.getByRole('button', { name: '仅本次发送' }));
  await user.click(await screen.findByRole('button', { name: '采纳标准答案' }));

  view.rerender(<ProblemDocument problemId="accept-b" />);
  await act(async () => saved.resolve({
    problemId: 'accept-a', kind: 'standard_answer', value: '题目 A 的建议答案', updatedAt: '2026-07-31', version: 'v2',
  }));

  expect(await screen.findByRole('heading', { name: '题目 B' })).toBeVisible();
  expect(screen.queryByText('题目 A 的建议答案')).not.toBeInTheDocument();
});
