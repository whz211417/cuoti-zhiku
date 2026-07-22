import { invoke } from '@tauri-apps/api/core';

export type LibraryHealth = {
  schemaVersion: number;
  foreignKeysEnabled: boolean;
  journalMode: string;
};

export const getLibraryHealth = () => invoke<LibraryHealth>('get_library_health');

export type InboxItem = {
  id: string;
  attachmentId: string;
  filename: string;
  createdAt: string;
};

export type ImportFileResult = {
  sourcePath: string;
  item: InboxItem | null;
  error: string | null;
};

export const getInboxItems = () => invoke<InboxItem[]>('get_inbox_items');

export const importFiles = (paths: string[], courseId?: string) =>
  invoke<ImportFileResult[]>('import_files', { paths, courseId });
