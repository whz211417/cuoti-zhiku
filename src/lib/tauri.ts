import { invoke } from '@tauri-apps/api/core';

export type LibraryHealth = {
  schemaVersion: number;
  foreignKeysEnabled: boolean;
  journalMode: string;
};

export const getLibraryHealth = () => invoke<LibraryHealth>('get_library_health');
export const createLibraryBackup = (destination: string) => invoke<void>('create_library_backup', { destination });
export const restoreLibraryBackup = (source: string) => invoke<string>('restore_library_backup', { source });
export const hasAiApiKey = () => invoke<boolean>('has_ai_api_key');
export const saveAiApiKey = (apiKey: string) => invoke<void>('save_ai_api_key', { apiKey });
export const clearAiApiKey = () => invoke<void>('clear_ai_api_key');

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

export type CourseMaterial = { id: string; courseId: string; filename: string };
export type MaterialSnippet = { materialId: string; filename: string; excerpt: string };
export const importCourseMaterialFile = (courseId: string, path: string) =>
  invoke<CourseMaterial>('import_course_material_file', { courseId, path });
export const saveCourseMaterial = (courseId: string, filename: string, content: string) =>
  invoke<CourseMaterial>('save_course_material', { courseId, filename, content });
export const searchCourseMaterial = (courseId: string, query: string) =>
  invoke<MaterialSnippet[]>('search_course_material', { courseId, query });

export type ImportFileResult = {
  sourcePath: string;
  item: InboxItem | null;
  error: string | null;
};

export type CountedSignal = { label: string; count: number };
export type ActivityDay = { date: string; count: number };
export type CourseSummary = {
  id: string;
  name: string;
  color: string;
  problemCount: number;
  pendingCount: number;
  dueCount: number;
  materialCount: number;
  updatedAt: string;
};
export type RecentProblem = {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  fallbackFilename: string;
  status: string;
  updatedAt: string;
};
export type DashboardOverview = {
  dueReviewCount: number;
  pendingInboxCount: number;
  courseCount: number;
  materialCount: number;
  courseSummaries: CourseSummary[];
  recentProblems: RecentProblem[];
  topMistakeReasons: CountedSignal[];
  topKnowledgeTopics: CountedSignal[];
  activityLastSevenDays: ActivityDay[];
};
export type LibrarySearchResult = {
  kind: 'problem' | 'course' | 'material';
  id: string;
  courseId: string;
  title: string;
  snippet: string;
  updatedAt: string;
};

export const getInboxItems = () => invoke<InboxItem[]>('get_inbox_items');
export const getDashboardOverview = (today: string) =>
  invoke<DashboardOverview>('get_dashboard_overview', { today });
export const searchLibrary = (query: string, limit = 12) =>
  invoke<LibrarySearchResult[]>('search_library', { query, limit });
export const getAllProblems = () => invoke<RecentProblem[]>('get_all_problems');

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
  version: string;
  fields: ProblemField[];
};

export const getProblemDocument = (problemId: string) =>
  invoke<ProblemDocument>('get_problem_document', { problemId });

export const saveProblemField = (problemId: string, kind: string, value: string, expectedVersion: string) =>
  invoke<{ problemId: string; kind: string; value: string; updatedAt: string; version: string }>('save_problem_field', {
    problemId, kind, value, expectedVersion,
  });

export type AiFieldSuggestion = { kind: string; value: string };
export const runProblemAnalysis = (problemId: string, mode: 'flash' | 'deep') =>
  invoke<AiFieldSuggestion[]>('run_problem_analysis', { problemId, mode });

export const importFiles = (paths: string[], courseId?: string) =>
  invoke<ImportFileResult[]>('import_files', { paths, courseId });

export type ReviewProblem = { id: string; stem: string; ownAnswer: string; standardAnswer: string; explanation: string };
export const getDueReviewProblems = (today: string) => invoke<ReviewProblem[]>('get_due_review_problems', { today });
export const completeReview = (problemId: string, grade: string, reviewedOn: string) =>
  invoke<{ intervalDays: number; nextReviewOn: string }>('complete_review', { problemId, grade, reviewedOn });

export type ProblemBook = { markdown: string; problemCount: number };
export const exportProblemBook = (destination: string, includeAnswers: boolean) =>
  invoke<ProblemBook>('export_problem_book', { destination, includeAnswers });
