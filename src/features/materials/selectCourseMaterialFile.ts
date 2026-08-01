import { open } from '@tauri-apps/plugin-dialog';

const materialExtensions = ['pdf', 'md', 'markdown', 'txt'];

export async function selectCourseMaterialFile(): Promise<string | null> {
  const selection = await open({
    multiple: false,
    filters: [{ name: '学习资料', extensions: materialExtensions }],
  });
  return typeof selection === 'string' ? selection : null;
}
