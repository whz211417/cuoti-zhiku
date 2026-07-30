import { save } from '@tauri-apps/plugin-dialog';
import { createLibraryBackup } from '../../lib/tauri';

export async function createBackup(): Promise<boolean> {
  const destination = await save({ defaultPath: '错题智库-本地备份.sqlite3', filters: [{ name: 'SQLite 备份', extensions: ['sqlite3'] }] });
  if (!destination) return false;
  await createLibraryBackup(destination);
  return true;
}
