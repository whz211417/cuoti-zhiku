import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { saveProblemBook } from '../features/export/exportBooks';
import { selectProblemFiles } from '../features/inbox/selectProblemFiles';
import { App } from './App';

const { completeReview, getDueReviewProblems, searchLibraryMock } = vi.hoisted(() => ({
  completeReview: vi.fn(),
  getDueReviewProblems: vi.fn(),
  searchLibraryMock: vi.fn(),
}));

vi.mock('../features/export/exportBooks', () => ({ saveProblemBook: vi.fn() }));
vi.mock('../features/inbox/selectProblemFiles', () => ({ selectProblemFiles: vi.fn() }));
vi.mock('../features/settings/AiSettings', () => ({ AiSettings: () => <div>AI 设置</div> }));
vi.mock('../lib/tauri', () => ({
  completeReview,
  getDueReviewProblems,
  searchLibrary: searchLibraryMock,
}));

vi.mock('../features/dashboard/LearningDashboard', () => ({
  LearningDashboard: ({
    onIngest,
    onOpenCourse,
    onOpenInbox,
    onOpenProblem,
    onStartReview,
    refreshToken = 0,
  }: {
    onIngest: () => void;
    onOpenCourse: (id: string) => void;
    onOpenInbox: () => void;
    onOpenProblem: (id: string) => void;
    onStartReview: () => void;
    refreshToken?: number;
  }) => (
    <section aria-label="学习总览">
      <output aria-label="总览刷新令牌">{refreshToken}</output>
      <button onClick={onStartReview} type="button">开始复习</button>
      <button onClick={onOpenInbox} type="button">继续整理</button>
      <button onClick={onIngest} type="button">总览投进题目</button>
      <button onClick={() => onOpenCourse('course-dashboard')} type="button">打开课程摘要</button>
      <button onClick={() => onOpenProblem('problem-dashboard')} type="button">打开最近题目</button>
    </section>
  ),
}));

vi.mock('../features/courses/CourseSidebar', () => ({
  CourseSidebar: ({
    onCourseCreated,
    onSelectCourse,
    selectedCourseId,
  }: {
    onCourseCreated?: () => void;
    onSelectCourse: (id: string | null) => void;
    selectedCourseId: string | null;
  }) => (
    <div>
      <button onClick={() => onSelectCourse('course-sidebar')} type="button">选择课程</button>
      <button
        onClick={() => {
          onSelectCourse('course-created');
          onCourseCreated?.();
        }}
        type="button"
      >
        创建课程
      </button>
      <span>{selectedCourseId ?? '未分类'}</span>
    </div>
  ),
}));

vi.mock('../features/inbox/IngestDropzone', () => ({
  IngestDropzone: ({
    onImported,
    onOpenProblem,
  }: {
    onImported?: () => void;
    onOpenProblem?: (id: string) => void;
  }) => (
    <section aria-label="收件箱投题">
      <button onClick={onImported} type="button">完成收件箱导入</button>
      <button onClick={() => onOpenProblem?.('problem-inbox')} type="button">打开收件箱题目</button>
    </section>
  ),
}));

vi.mock('../features/problems/ProblemDocument', () => ({
  ProblemDocument: ({ onSaved, problemId }: { onSaved?: () => void; problemId: string }) => (
    <article aria-label="题目档案">
      <p>{`problem:${problemId}`}</p>
      <button onClick={onSaved} type="button">保存题目字段</button>
    </article>
  ),
}));

vi.mock('../features/materials/MaterialsLibrary', () => ({
  MaterialsLibrary: ({
    courseId,
    initialQuery = '',
    onSaved,
  }: {
    courseId: string | null;
    initialQuery?: string;
    onSaved?: () => void;
  }) => (
    <section aria-label="课程资料库">
      <p>{`materials:${courseId ?? ''}:${initialQuery}`}</p>
      <button onClick={onSaved} type="button">保存课程资料</button>
    </section>
  ),
}));

vi.mock('../features/review/ReviewReader', () => ({
  ReviewReader: ({ onGrade }: { onGrade: (grade: 'mastered') => void }) => (
    <section aria-label="专注复习">
      <button onClick={() => onGrade('mastered')} type="button">完成评分</button>
    </section>
  ),
}));

const savedImport = [{
  sourcePath: 'C:/notes/is-lm.pdf',
  item: { id: 'inbox-1', problemId: 'problem-1', attachmentId: 'attachment-1', filename: 'is-lm.pdf', createdAt: '1' },
  error: null,
}];

beforeEach(() => {
  vi.clearAllMocks();
  getDueReviewProblems.mockResolvedValue([]);
  completeReview.mockResolvedValue(undefined);
  searchLibraryMock.mockResolvedValue([]);
});

test('opens on the learning overview and navigates from its primary review action', async () => {
  const user = userEvent.setup();
  render(<App />);

  expect(screen.getByRole('application', { name: '错题智库' })).toBeVisible();
  expect(screen.getByRole('heading', { name: '学习总览' })).toBeVisible();

  await user.click(screen.getByRole('button', { name: '开始复习' }));

  expect(screen.getByRole('heading', { name: '今日复习' })).toBeVisible();
});

test('retains inbox, review and archive navigation in the sidebar', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: '收件箱 本地' }));
  expect(screen.getByRole('heading', { name: '收件箱' })).toBeVisible();

  await user.click(screen.getByRole('button', { name: '今日复习' }));
  expect(screen.getByRole('heading', { name: '今日复习' })).toBeVisible();

  await user.click(screen.getByRole('button', { name: '全部档案' }));
  expect(screen.getByRole('heading', { name: '全部档案' })).toBeVisible();
});

test('opens and cleans up global search from the toolbar and Ctrl+K', async () => {
  const addEventListener = vi.spyOn(window, 'addEventListener');
  const removeEventListener = vi.spyOn(window, 'removeEventListener');
  const user = userEvent.setup();
  const view = render(<App />);
  const keydownListeners = addEventListener.mock.calls.filter(([type]) => type === 'keydown');

  expect(keydownListeners).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: '全局搜索' }));
  expect(screen.getByRole('dialog', { name: '全局搜索' })).toBeVisible();

  await user.click(screen.getByRole('button', { name: '关闭全局搜索' }));
  await user.keyboard('{Control>}k{/Control}');
  expect(screen.getByRole('dialog', { name: '全局搜索' })).toBeVisible();

  view.unmount();
  expect(removeEventListener).toHaveBeenCalledWith('keydown', keydownListeners[0][1]);
});

test('search results open problems, courses and materials with the active query', async () => {
  const user = userEvent.setup();
  render(<App />);

  searchLibraryMock.mockResolvedValueOnce([{
    kind: 'problem', id: 'problem-search', courseId: 'course-problem', title: 'problem-result', snippet: 'stem', updatedAt: '1',
  }]);
  await user.click(screen.getByRole('button', { name: '全局搜索' }));
  await user.type(screen.getByRole('searchbox', { name: '搜索本地资料库' }), 'problem');
  await user.click(await screen.findByRole('button', { name: /problem-result/ }));
  expect(screen.getByText('problem:problem-search')).toBeVisible();
  expect(screen.queryByRole('dialog', { name: '全局搜索' })).not.toBeInTheDocument();

  searchLibraryMock.mockResolvedValueOnce([{
    kind: 'course', id: 'course-search', courseId: 'course-search', title: 'course-result', snippet: '', updatedAt: '2',
  }]);
  await user.click(screen.getByRole('button', { name: '全局搜索' }));
  await user.type(screen.getByRole('searchbox', { name: '搜索本地资料库' }), 'course');
  await user.click(await screen.findByRole('button', { name: /course-result/ }));
  expect(screen.getByText('materials:course-search:')).toBeVisible();

  searchLibraryMock.mockResolvedValueOnce([{
    kind: 'material', id: 'material-search', courseId: 'course-material', title: 'material-result', snippet: 'LM', updatedAt: '3',
  }]);
  await user.click(screen.getByRole('button', { name: '全局搜索' }));
  await user.type(screen.getByRole('searchbox', { name: '搜索本地资料库' }), 'LM curve');
  await user.click(await screen.findByRole('button', { name: /material-result/ }));
  expect(screen.getByText('materials:course-material:LM curve')).toBeVisible();
});

test('increments one refresh token after every successful mutation', async () => {
  const user = userEvent.setup();
  vi.mocked(selectProblemFiles).mockResolvedValue(savedImport);
  getDueReviewProblems.mockResolvedValue([{ id: 'review-1', stem: 'stem', ownAnswer: '', standardAnswer: '', explanation: '' }]);
  render(<App />);

  expect(screen.getByRole('status', { name: '总览刷新令牌' })).toHaveTextContent('0');

  await user.click(screen.getByRole('button', { name: '投进题目' }));
  expect(await screen.findByRole('heading', { name: '收件箱' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '完成收件箱导入' }));
  await user.click(screen.getByRole('button', { name: '学习总览' }));
  expect(screen.getByRole('status', { name: '总览刷新令牌' })).toHaveTextContent('2');

  await user.click(screen.getByRole('button', { name: '总览投进题目' }));
  await user.click(screen.getByRole('button', { name: '学习总览' }));
  expect(screen.getByRole('status', { name: '总览刷新令牌' })).toHaveTextContent('3');

  await user.click(screen.getByRole('button', { name: '创建课程' }));
  expect(screen.getByRole('status', { name: '总览刷新令牌' })).toHaveTextContent('4');

  await user.click(screen.getByRole('button', { name: '打开最近题目' }));
  await user.click(screen.getByRole('button', { name: '保存题目字段' }));
  await user.click(screen.getByRole('button', { name: '学习总览' }));
  expect(screen.getByRole('status', { name: '总览刷新令牌' })).toHaveTextContent('5');

  await user.click(screen.getByRole('button', { name: '开始复习' }));
  await user.click(await screen.findByRole('button', { name: '完成评分' }));
  await waitFor(() => expect(completeReview).toHaveBeenCalledOnce());
  await user.click(screen.getByRole('button', { name: '学习总览' }));
  expect(screen.getByRole('status', { name: '总览刷新令牌' })).toHaveTextContent('6');

  await user.click(screen.getByRole('button', { name: '打开课程摘要' }));
  await user.click(screen.getByRole('button', { name: '保存课程资料' }));
  await user.click(screen.getByRole('button', { name: '学习总览' }));
  expect(screen.getByRole('status', { name: '总览刷新令牌' })).toHaveTextContent('7');
});

test('does not refresh or leave the overview after cancelled and failed file selection', async () => {
  const user = userEvent.setup();
  render(<App />);

  vi.mocked(selectProblemFiles).mockResolvedValueOnce([]);
  await user.click(screen.getByRole('button', { name: '投进题目' }));
  expect(screen.getByRole('status', { name: '总览刷新令牌' })).toHaveTextContent('0');
  expect(screen.getByRole('heading', { name: '学习总览' })).toBeVisible();

  vi.mocked(selectProblemFiles).mockResolvedValueOnce([{ sourcePath: 'broken.pdf', item: null, error: 'disk full' }]);
  await user.click(screen.getByRole('button', { name: '总览投进题目' }));
  expect(screen.getByRole('status', { name: '总览刷新令牌' })).toHaveTextContent('0');
  expect(screen.getByRole('heading', { name: '学习总览' })).toBeVisible();

  vi.mocked(selectProblemFiles).mockRejectedValueOnce(new Error('dialog failed'));
  await user.click(screen.getByRole('button', { name: '投进题目' }));
  expect(screen.getByRole('status', { name: '总览刷新令牌' })).toHaveTextContent('0');
});

test('does not refresh after a failed review grade', async () => {
  const user = userEvent.setup();
  getDueReviewProblems.mockResolvedValue([{ id: 'review-1', stem: 'stem', ownAnswer: '', standardAnswer: '', explanation: '' }]);
  completeReview.mockRejectedValue(new Error('write failed'));
  render(<App />);

  await user.click(screen.getByRole('button', { name: '开始复习' }));
  await user.click(await screen.findByRole('button', { name: '完成评分' }));
  await waitFor(() => expect(completeReview).toHaveBeenCalledOnce());
  await user.click(screen.getByRole('button', { name: '学习总览' }));

  expect(screen.getByRole('status', { name: '总览刷新令牌' })).toHaveTextContent('0');
});

test('opens the preferences inspector from the toolbar', async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole('button', { name: '设置' }));

  expect(screen.getByRole('dialog', { name: '偏好设置' })).toBeVisible();
});

test('exports the question book only after the user requests it from preferences', async () => {
  const user = userEvent.setup();
  vi.mocked(saveProblemBook).mockResolvedValue({ cancelled: false, problemCount: 2 });
  render(<App />);

  await user.click(screen.getByRole('button', { name: '设置' }));
  await user.click(screen.getByRole('button', { name: '导出题目册' }));

  expect(saveProblemBook).toHaveBeenCalledWith('questions');
  expect(await screen.findByText('已导出 2 道题目。')).toBeVisible();
});
