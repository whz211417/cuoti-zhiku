import { open } from '@tauri-apps/plugin-dialog';
import { importFiles } from '../../lib/tauri';

export const SUPPORTED_PROBLEM_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'markdown', 'md', 'txt'] as const;

export async function selectProblemFiles(courseId: string | null) {
  const selection = await open({
    multiple: true,
    filters: [{ name: '题目与资料', extensions: [...SUPPORTED_PROBLEM_EXTENSIONS] }],
  });
  const paths = Array.isArray(selection) ? selection : selection ? [selection] : [];
  return paths.length > 0 ? importFiles(paths, courseId ?? undefined) : [];
}
