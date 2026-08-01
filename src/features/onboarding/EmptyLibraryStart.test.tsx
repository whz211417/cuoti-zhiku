import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { EmptyLibraryStart } from './EmptyLibraryStart';

test('presents the three practical first steps without demo content', async () => {
  const user = userEvent.setup();
  const onImportProblem = vi.fn();
  const onImportMaterial = vi.fn();
  const onCreateCourse = vi.fn();

  render(
    <EmptyLibraryStart
      onCreateCourse={onCreateCourse}
      onImportMaterial={onImportMaterial}
      onImportProblem={onImportProblem}
    />,
  );

  expect(screen.getByRole('button', { name: '拖入题目或题图' })).toBeVisible();
  expect(screen.getByRole('button', { name: '导入学习资料' })).toBeVisible();
  expect(screen.getByRole('button', { name: '新建课程' })).toBeVisible();
  expect(screen.queryByText(/本周已学习 12/)).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '导入学习资料' }));
  expect(onImportMaterial).toHaveBeenCalledOnce();
});
