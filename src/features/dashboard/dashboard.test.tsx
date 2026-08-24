import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import type { DashboardOverview } from '../../lib/tauri';
import { LearningDashboard } from './LearningDashboard';

const { getDashboardOverview } = vi.hoisted(() => ({
  getDashboardOverview: vi.fn(),
}));

vi.mock('../../lib/tauri', () => ({ getDashboardOverview }));

const activityLastSevenDays = [
  { date: '2026-07-24', count: 0 },
  { date: '2026-07-25', count: 1 },
  { date: '2026-07-26', count: 0 },
  { date: '2026-07-27', count: 3 },
  { date: '2026-07-28', count: 1 },
  { date: '2026-07-29', count: 0 },
  { date: '2026-07-30', count: 2 },
];

function makeOverview(overrides: Partial<DashboardOverview> = {}): DashboardOverview {
  return {
    dueReviewCount: 3,
    pendingInboxCount: 2,
    courseCount: 5,
    materialCount: 8,
    courseSummaries: [
      {
        id: 'macro',
        name: '宏观经济学',
        color: '#007aff',
        problemCount: 12,
        pendingCount: 1,
        dueCount: 2,
        materialCount: 3,
        updatedAt: '2026-07-30T08:00:00Z',
      },
      {
        id: 'micro',
        name: '微观经济学',
        color: '#248a3d',
        problemCount: 9,
        pendingCount: 0,
        dueCount: 1,
        materialCount: 2,
        updatedAt: '2026-07-29T08:00:00Z',
      },
      {
        id: 'metrics',
        name: '计量经济学',
        color: '#af52de',
        problemCount: 7,
        pendingCount: 1,
        dueCount: 0,
        materialCount: 1,
        updatedAt: '2026-07-28T08:00:00Z',
      },
      {
        id: 'finance',
        name: '金融学',
        color: '#ff9500',
        problemCount: 5,
        pendingCount: 0,
        dueCount: 0,
        materialCount: 1,
        updatedAt: '2026-07-27T08:00:00Z',
      },
      {
        id: 'trade',
        name: '国际贸易',
        color: '#5ac8fa',
        problemCount: 4,
        pendingCount: 0,
        dueCount: 0,
        materialCount: 1,
        updatedAt: '2026-07-26T08:00:00Z',
      },
    ],
    recentProblems: [
      {
        id: 'problem-1',
        courseId: 'macro',
        courseName: '宏观经济学',
        title: 'IS 曲线题目',
        fallbackFilename: 'is-curve.pdf',
        status: 'active',
        updatedAt: '2026-07-30T08:30:00Z',
      },
    ],
    topMistakeReasons: [
      { label: '忽略价格黏性', count: 4 },
      { label: '混淆曲线移动', count: 2 },
    ],
    topKnowledgeTopics: [
      { label: 'IS-LM 模型', count: 6 },
      { label: '乘数效应', count: 3 },
    ],
    activityLastSevenDays,
    ...overrides,
  };
}

const callbacks = {
  onCreateCourse: vi.fn(),
  onIngest: vi.fn(),
  onImportMaterial: vi.fn(),
  onOpenCourse: vi.fn(),
  onOpenInbox: vi.fn(),
  onOpenProblem: vi.fn(),
  onStartReview: vi.fn(),
};

function renderDashboard(refreshToken?: number) {
  return render(<LearningDashboard {...callbacks} refreshToken={refreshToken} />);
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

test('prioritizes due review over pending organization', async () => {
  const user = userEvent.setup();
  getDashboardOverview.mockResolvedValue(makeOverview());

  renderDashboard();

  expect(await screen.findByRole('heading', { name: '3 道题等待复习' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '开始复习' }));
  expect(callbacks.onStartReview).toHaveBeenCalledOnce();
  expect(callbacks.onOpenInbox).not.toHaveBeenCalled();
});

test('continues pending organization when no review is due', async () => {
  const user = userEvent.setup();
  getDashboardOverview.mockResolvedValue(makeOverview({ dueReviewCount: 0, pendingInboxCount: 6 }));

  renderDashboard();

  expect(await screen.findByRole('heading', { name: '6 道题等待整理' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '继续整理' }));
  expect(callbacks.onOpenInbox).toHaveBeenCalledOnce();
});

test('resumes the latest problem when the library has no pending work', async () => {
  const user = userEvent.setup();
  getDashboardOverview.mockResolvedValue(makeOverview({ dueReviewCount: 0, pendingInboxCount: 0 }));

  renderDashboard();

  expect(await screen.findByRole('heading', { name: '继续上次题目' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '继续上次题目' }));
  expect(callbacks.onOpenProblem).toHaveBeenCalledWith('problem-1');
  expect(callbacks.onIngest).not.toHaveBeenCalled();
});

test('offers ingestion only when there is no pending work and no problem to resume', async () => {
  const user = userEvent.setup();
  getDashboardOverview.mockResolvedValue(makeOverview({
    dueReviewCount: 0,
    pendingInboxCount: 0,
    recentProblems: [],
  }));

  renderDashboard();

  expect(await screen.findByRole('heading', { name: '资料库已整理好' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '投进题目' }));
  expect(callbacks.onIngest).toHaveBeenCalledOnce();
});

test('shows a three-step path alongside the one recommended action', async () => {
  getDashboardOverview.mockResolvedValue(makeOverview());

  renderDashboard();

  const path = await screen.findByRole('list', { name: '今日路径' });
  expect(within(path).getAllByRole('listitem')).toHaveLength(3);
  expect(within(path).getByText('先复习')).toBeVisible();
  expect(within(path).getByText('再整理')).toBeVisible();
  expect(within(path).getByText('然后延续')).toBeVisible();
});

test('opens a course and a recent problem from the overview', async () => {
  const user = userEvent.setup();
  getDashboardOverview.mockResolvedValue(makeOverview());

  renderDashboard();

  await user.click(await screen.findByRole('button', { name: '打开 宏观经济学' }));
  await user.click(screen.getByRole('button', { name: '打开 IS 曲线题目' }));
  expect(callbacks.onOpenCourse).toHaveBeenCalledWith('macro');
  expect(callbacks.onOpenProblem).toHaveBeenCalledWith('problem-1');
  expect(screen.getByText('2026年7月30日更新')).toBeVisible();
});

test('shares the latest successful overview aggregate with its parent', async () => {
  const onOverviewLoaded = vi.fn();
  const overview = makeOverview();
  getDashboardOverview.mockResolvedValue(overview);

  render(<LearningDashboard {...callbacks} onOverviewLoaded={onOverviewLoaded} />);

  await screen.findByRole('heading', { name: '3 道题等待复习' });
  expect(onOverviewLoaded).toHaveBeenCalledWith(overview);
});

test('shows four courses first and can reveal and collapse the remainder', async () => {
  const user = userEvent.setup();
  getDashboardOverview.mockResolvedValue(makeOverview());

  renderDashboard();

  expect(await screen.findByRole('button', { name: '打开 金融学' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '打开 国际贸易' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '展开全部' }));
  expect(screen.getByRole('button', { name: '打开 国际贸易' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '收起' }));
  expect(screen.queryByRole('button', { name: '打开 国际贸易' })).not.toBeInTheDocument();
});

test('keeps real zero statistics visible without sample replacements', async () => {
  getDashboardOverview.mockResolvedValue(makeOverview({
    dueReviewCount: 0,
    pendingInboxCount: 0,
    courseCount: 0,
    materialCount: 0,
    courseSummaries: [],
  }));

  renderDashboard();

  const statistics = await screen.findByLabelText('学习统计');
  expect(within(statistics).getAllByText('0')).toHaveLength(4);
  expect(within(statistics).getByText('待复习')).toBeVisible();
  expect(within(statistics).getByText('待整理')).toBeVisible();
  expect(within(statistics).getByText('课程')).toBeVisible();
  expect(within(statistics).getByText('资料')).toBeVisible();
});

test('shows three real actions only for an empty library', async () => {
  getDashboardOverview.mockResolvedValue(makeOverview({
    courseCount: 0,
    pendingInboxCount: 0,
    materialCount: 0,
    courseSummaries: [],
    recentProblems: [],
  }));

  renderDashboard();

  expect(await screen.findByRole('button', { name: '拖入题目或题图' })).toBeVisible();
  expect(screen.getByRole('button', { name: '导入学习资料' })).toBeVisible();
  expect(screen.getByRole('button', { name: '新建课程' })).toBeVisible();
  expect(screen.queryByText(/本周已学习 12/)).not.toBeInTheDocument();
});

test('renders exactly seven locale-aware activity cells', async () => {
  getDashboardOverview.mockResolvedValue(makeOverview());

  renderDashboard();

  const activity = await screen.findByRole('list', { name: '最近七天学习活动' });
  expect(within(activity).getAllByRole('listitem')).toHaveLength(7);
  expect(within(activity).getByLabelText('7月30日，2次活动')).toBeVisible();
  expect(within(activity).getAllByLabelText(/月\d+日，\d+次活动/)).toHaveLength(7);
});

test('shows a shaped skeleton during the first load', () => {
  getDashboardOverview.mockReturnValue(new Promise(() => undefined));

  renderDashboard();

  const skeleton = screen.getByLabelText('正在读取学习总览');
  expect(skeleton.querySelectorAll('[data-skeleton-shape]')).toHaveLength(4);
});

test('shows a recoverable error and retries the query', async () => {
  const user = userEvent.setup();
  getDashboardOverview
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(makeOverview({ dueReviewCount: 0, pendingInboxCount: 1 }));

  renderDashboard();

  expect(await screen.findByText('学习总览暂时无法读取。')).toBeVisible();
  await user.click(screen.getByRole('button', { name: '重新读取' }));
  expect(await screen.findByRole('heading', { name: '1 道题等待整理' })).toBeVisible();
  expect(getDashboardOverview).toHaveBeenCalledTimes(2);
});

test('retains the last successful overview while a refresh is pending', async () => {
  let resolveRefresh!: (overview: DashboardOverview) => void;
  const pendingRefresh = new Promise<DashboardOverview>((resolve) => {
    resolveRefresh = resolve;
  });
  getDashboardOverview
    .mockResolvedValueOnce(makeOverview({ dueReviewCount: 3 }))
    .mockReturnValueOnce(pendingRefresh);

  const view = renderDashboard(0);
  expect(await screen.findByRole('heading', { name: '3 道题等待复习' })).toBeVisible();

  view.rerender(<LearningDashboard {...callbacks} refreshToken={1} />);

  expect(screen.getByRole('heading', { name: '3 道题等待复习' })).toBeVisible();
  expect(screen.getByRole('region', { name: '学习总览' })).toHaveAttribute('aria-busy', 'true');
  resolveRefresh(makeOverview({ dueReviewCount: 5 }));
  expect(await screen.findByRole('heading', { name: '5 道题等待复习' })).toBeVisible();
});

test('gives empty content sections useful next-step explanations', async () => {
  getDashboardOverview.mockResolvedValue(makeOverview({
    courseCount: 0,
    materialCount: 0,
    courseSummaries: [],
    recentProblems: [],
    topMistakeReasons: [],
    topKnowledgeTopics: [],
    activityLastSevenDays: activityLastSevenDays.map((day) => ({ ...day, count: 0 })),
  }));

  renderDashboard();

  expect(await screen.findByText('还没有课程概览。创建课程后，这里会汇总学习进度。')).toBeVisible();
  expect(screen.getByText('还没有最近更新的题目。投进一道题后，就能从这里继续整理。')).toBeVisible();
  expect(screen.getByText('记录错因后，这里会显示最常出现的薄弱环节。')).toBeVisible();
  expect(screen.getByText('整理知识点后，这里会逐步形成复习脉络。')).toBeVisible();
  expect(screen.getByText('最近七天还没有学习活动，从投进一道题开始吧。')).toBeVisible();
});

test('uses filenames and then a useful label for untitled recent problems', async () => {
  getDashboardOverview.mockResolvedValue(makeOverview({
    recentProblems: [
      {
        id: 'problem-file',
        courseId: 'macro',
        courseName: '宏观经济学',
        title: '',
        fallbackFilename: '课堂截图.png',
        status: 'inbox',
        updatedAt: '2026-07-29T08:30:00Z',
      },
      {
        id: 'problem-untitled',
        courseId: '',
        courseName: '',
        title: '',
        fallbackFilename: '',
        status: 'inbox',
        updatedAt: '2026-07-28T08:30:00Z',
      },
    ],
  }));

  renderDashboard();

  expect(await screen.findByRole('button', { name: '打开 课堂截图.png' })).toBeVisible();
  expect(screen.getByRole('button', { name: '打开 未命名题目' })).toBeVisible();
});

test('ignores an older load that resolves after a newer refresh', async () => {
  let resolveInitial!: (overview: DashboardOverview) => void;
  let resolveRefresh!: (overview: DashboardOverview) => void;
  getDashboardOverview
    .mockReturnValueOnce(new Promise<DashboardOverview>((resolve) => {
      resolveInitial = resolve;
    }))
    .mockReturnValueOnce(new Promise<DashboardOverview>((resolve) => {
      resolveRefresh = resolve;
    }));

  const view = renderDashboard(0);
  view.rerender(<LearningDashboard {...callbacks} refreshToken={1} />);

  await act(async () => {
    resolveRefresh(makeOverview({ dueReviewCount: 5 }));
  });
  expect(screen.getByRole('heading', { name: '5 道题等待复习' })).toBeVisible();

  await act(async () => {
    resolveInitial(makeOverview({ dueReviewCount: 3 }));
  });
  expect(screen.getByRole('heading', { name: '5 道题等待复习' })).toBeVisible();
});

test('requests the overview with the local calendar date', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 30, 23, 30));
  getDashboardOverview.mockReturnValue(new Promise(() => undefined));

  renderDashboard();

  expect(getDashboardOverview).toHaveBeenCalledWith('2026-07-30');
});

test('caps recent problems at five', async () => {
  const recentProblems = Array.from({ length: 6 }, (_, index) => ({
    id: `problem-${index + 1}`,
    courseId: 'macro',
    courseName: '宏观经济学',
    title: `最近题目 ${index + 1}`,
    fallbackFilename: `problem-${index + 1}.pdf`,
    status: 'active',
    updatedAt: `2026-07-${30 - index}T08:30:00Z`,
  }));
  getDashboardOverview.mockResolvedValue(makeOverview({ recentProblems }));

  renderDashboard();

  expect(await screen.findByRole('button', { name: '打开 最近题目 5' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '打开 最近题目 6' })).not.toBeInTheDocument();
});

test('shows native active and inbox problem statuses correctly', async () => {
  getDashboardOverview.mockResolvedValue(makeOverview({
    recentProblems: [
      {
        id: 'problem-active',
        courseId: 'macro',
        courseName: '宏观经济学',
        title: '已进入学习的题目',
        fallbackFilename: '',
        status: 'active',
        updatedAt: '2026-07-30T08:30:00Z',
      },
      {
        id: 'problem-inbox',
        courseId: 'macro',
        courseName: '宏观经济学',
        title: '刚投进来的题目',
        fallbackFilename: '',
        status: 'inbox',
        updatedAt: '2026-07-29T08:30:00Z',
      },
    ],
  }));

  renderDashboard();

  const recent = await screen.findByRole('region', { name: '接着上次的思路' });
  expect(within(recent).getByText('复习中')).toBeVisible();
  expect(within(recent).getByText('待整理')).toBeVisible();
});
