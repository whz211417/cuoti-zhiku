import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { CourseSidebar } from './CourseSidebar';

const { createCourse, getCourses } = vi.hoisted(() => ({ createCourse: vi.fn(), getCourses: vi.fn() }));
vi.mock('../../lib/tauri', () => ({ createCourse, getCourses }));

beforeEach(() => {
  vi.clearAllMocks();
  getCourses.mockResolvedValue([]);
});

test('shows local courses in the sidebar', async () => {
  getCourses.mockResolvedValue([{ id: 'macro', name: '宏观经济学', term: '2026 春季', color: '#CE8876', kind: 'school' }]);

  render(<CourseSidebar onSelectCourse={() => undefined} selectedCourseId={null} />);

  expect(await screen.findByRole('button', { name: '宏观经济学' })).toBeVisible();
});

test('creates a language course with an explicit kind', async () => {
  getCourses.mockResolvedValue([{ id: 'existing', name: '现有课程', term: '', color: '#7895A5', kind: 'school' }]);
  createCourse.mockResolvedValue({ id: 'c1', name: '日语 N2', term: '', color: '#7895A5', kind: 'language' });
  render(<CourseSidebar onSelectCourse={vi.fn()} selectedCourseId={null} />);
  await screen.findByRole('button', { name: '现有课程' });
  await userEvent.click(screen.getByRole('button', { name: /新建课程/ }));
  await userEvent.type(screen.getByLabelText('课程名称'), '日语 N2');
  await userEvent.selectOptions(screen.getByLabelText('课程类型'), 'language');
  await userEvent.click(screen.getByRole('button', { name: '添加' }));
  expect(createCourse).toHaveBeenCalledWith('日语 N2', '', '#7895A5', 'language');
});

test('opens course creation from a new request token and returns the exact created course', async () => {
  const created = { id: 'course-exact', name: '统计学', term: '', color: '#7895A5', kind: 'school' as const };
  const onCourseCreated = vi.fn();
  getCourses.mockResolvedValue([]);
  createCourse.mockResolvedValue(created);
  const view = render(<CourseSidebar onCourseCreated={onCourseCreated} onSelectCourse={vi.fn()} openCreateToken={0} selectedCourseId={null} />);

  view.rerender(<CourseSidebar onCourseCreated={onCourseCreated} onSelectCourse={vi.fn()} openCreateToken={1} selectedCourseId={null} />);
  await userEvent.type(await screen.findByLabelText('课程名称'), '统计学');
  await userEvent.click(screen.getByRole('button', { name: '添加' }));

  expect(onCourseCreated).toHaveBeenCalledWith(created);
});

test('submits course creation only once while the first request is in flight', async () => {
  let resolveCourse!: (course: { id: string; name: string; term: string; color: string; kind: 'school' }) => void;
  createCourse.mockReturnValue(new Promise((resolve) => { resolveCourse = resolve; }));
  render(<CourseSidebar onSelectCourse={vi.fn()} selectedCourseId={null} />);
  await userEvent.click(screen.getByRole('button', { name: /新建课程/ }));
  await userEvent.type(screen.getByLabelText('课程名称'), '统计学');
  const form = screen.getByLabelText('课程名称').closest('form')!;

  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(createCourse).toHaveBeenCalledTimes(1);

  resolveCourse({ id: 'statistics', name: '统计学', term: '', color: '#7895A5', kind: 'school' });
  await waitFor(() => expect(screen.getByRole('button', { name: /新建课程/ })).toBeVisible());
});

test('keeps course fields after a failed creation and retries explicitly without callbacks', async () => {
  const onCourseCreated = vi.fn();
  const onSelectCourse = vi.fn();
  createCourse
    .mockRejectedValueOnce(new Error('database unavailable'))
    .mockResolvedValueOnce({ id: 'statistics', name: '统计学', term: '', color: '#7895A5', kind: 'school' });
  render(<CourseSidebar onCourseCreated={onCourseCreated} onSelectCourse={onSelectCourse} selectedCourseId={null} />);
  await userEvent.click(screen.getByRole('button', { name: /新建课程/ }));
  await userEvent.type(screen.getByLabelText('课程名称'), '统计学');
  await userEvent.click(screen.getByRole('button', { name: '添加' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('课程没有创建成功');
  expect(screen.getByLabelText('课程名称')).toHaveValue('统计学');
  expect(onCourseCreated).not.toHaveBeenCalled();
  expect(onSelectCourse).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '重新尝试' }));

  await waitFor(() => expect(onCourseCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'statistics' })));
  expect(createCourse).toHaveBeenCalledTimes(2);
});

test('allows course creation to be cancelled through an explicit action', async () => {
  const onCancelCourseCreate = vi.fn();
  render(<CourseSidebar onCancelCourseCreate={onCancelCourseCreate} onSelectCourse={vi.fn()} selectedCourseId={null} />);
  await userEvent.click(screen.getByRole('button', { name: /新建课程/ }));
  await userEvent.click(screen.getByRole('button', { name: '取消' }));

  expect(onCancelCourseCreate).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: /新建课程/ })).toBeVisible();
});
