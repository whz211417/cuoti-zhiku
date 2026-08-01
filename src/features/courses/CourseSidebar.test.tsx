import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { CourseSidebar } from './CourseSidebar';

const { createCourse, getCourses } = vi.hoisted(() => ({ createCourse: vi.fn(), getCourses: vi.fn() }));
vi.mock('../../lib/tauri', () => ({ createCourse, getCourses }));

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
