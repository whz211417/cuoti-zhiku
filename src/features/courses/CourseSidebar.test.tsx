import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { CourseSidebar } from './CourseSidebar';

const { getCourses } = vi.hoisted(() => ({ getCourses: vi.fn() }));
vi.mock('../../lib/tauri', () => ({ getCourses }));

test('shows local courses in the sidebar', async () => {
  getCourses.mockResolvedValue([{ id: 'macro', name: '宏观经济学', term: '2026 春季', color: '#CE8876' }]);

  render(<CourseSidebar onSelectCourse={() => undefined} selectedCourseId={null} />);

  expect(await screen.findByRole('button', { name: '宏观经济学' })).toBeVisible();
});
