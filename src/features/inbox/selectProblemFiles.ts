import { open } from '@tauri-apps/plugin-dialog';
import { importFiles } from '../../lib/tauri';

export async function selectProblemFiles(courseId: string | null) {
  const selection = await open({
    multiple: true,
    filters: [{ name: '题目与资料', extensions: ['png', 'jpg', 'jpeg', 'webp', 'pdf'] }],
  });
  const paths = Array.isArray(selection) ? selection : selection ? [selection] : [];
  return paths.length > 0 ? importFiles(paths, courseId ?? undefined) : [];
}
