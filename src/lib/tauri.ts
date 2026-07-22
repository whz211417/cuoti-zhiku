import { invoke } from '@tauri-apps/api/core';

export type LibraryHealth = {
  schemaVersion: number;
  foreignKeysEnabled: boolean;
  journalMode: string;
};

export const getLibraryHealth = () => invoke<LibraryHealth>('get_library_health');

export type InboxItem = {
  id: string;
  problemId: string;
  attachmentId: string;
  filename: string;
  createdAt: string;
};

export type Course = { id: string; name: string; term: string; color: string };

export const getCourses = () => invoke<Course[]>('get_courses');
export const createCourse = (name: string, term: string, color: string) =>
  invoke<Course>('create_course', { name, term, color });

export type ImportFileResult = {
  sourcePath: string;
  item: InboxItem | null;
  error: string | null;
};

export const getInboxItems = () => invoke<InboxItem[]>('get_inbox_items');

export type ProblemField = {
  kind: string;
  value: string;
  updatedAt: string;
};

export type ProblemDocument = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  fields: ProblemField[];
};

export const getProblemDocument = (problemId: string) =>
  invoke<ProblemDocument>('get_problem_document', { problemId });

export const saveProblemField = (problemId: string, kind: string, value: string, expectedUpdatedAt: string) =>
  invoke<{ problemId: string; kind: string; value: string; updatedAt: string }>('save_problem_field', {
    problemId, kind, value, expectedUpdatedAt,
  });

export const importFiles = (paths: string[], courseId?: string) =>
  invoke<ImportFileResult[]>('import_files', { paths, courseId });
