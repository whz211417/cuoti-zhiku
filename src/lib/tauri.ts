import { invoke } from '@tauri-apps/api/core';
import type { AiProviderConfig } from '../features/settings/aiProviderCatalog';

// Shared only as a non-sensitive DTO. Credential values never cross this boundary.
export type { AiProviderConfig, AiProviderId } from '../features/settings/aiProviderCatalog';

export type LibraryHealth = {
  schemaVersion: number;
  foreignKeysEnabled: boolean;
  journalMode: string;
};

export const getLibraryHealth = () => invoke<LibraryHealth>('get_library_health');
export type CompleteBackupReport = { originalCount: number; totalBytes: number };
export const createLibraryBackup = (destination: string) => invoke<CompleteBackupReport>('create_library_backup', { destination });
export const restoreLibraryBackup = (source: string) => invoke<string>('restore_library_backup', { source });
export const hasAiApiKey = () => invoke<boolean>('has_ai_api_key');
export const saveAiApiKey = (apiKey: string) => invoke<void>('save_ai_api_key', { apiKey });
export const clearAiApiKey = () => invoke<void>('clear_ai_api_key');
export const hasAiProviderKey = (config: AiProviderConfig) =>
  invoke<boolean>('has_ai_provider_key', { config: toNativeAiProviderConfig(config) });
export const saveAiProviderKey = (config: AiProviderConfig, apiKey: string) =>
  invoke<void>('save_ai_provider_key', { config: toNativeAiProviderConfig(config), apiKey });
export const clearAiProviderKey = (config: AiProviderConfig) =>
  invoke<void>('clear_ai_provider_key', { config: toNativeAiProviderConfig(config) });
export type AiCredentialMigrationStatus = 'ready' | 'not_needed' | 'migrated' | 'conflict' | 'failed';
export const getAiCredentialMigrationStatus = () =>
  invoke<AiCredentialMigrationStatus>('get_ai_credential_migration_status');
export const retryAiCredentialMigration = () =>
  invoke<AiCredentialMigrationStatus>('retry_ai_credential_migration');

export type InboxItem = {
  id: string;
  problemId: string;
  attachmentId: string;
  filename: string;
  createdAt: string;
};

export type CourseKind = 'school' | 'exam' | 'language' | 'certificate' | 'other';
export type Course = { id: string; name: string; term: string; color: string; kind: CourseKind };

export const getCourses = () => invoke<Course[]>('get_courses');
export const createCourse = (name: string, term: string, color: string, kind: CourseKind) =>
  invoke<Course>('create_course', { name, term, color, kind });

export type CourseMaterial = { id: string; courseId: string; filename: string };
export type MaterialSnippet = { chunkId: string; materialId: string; filename: string; excerpt: string };
export const importCourseMaterialFile = (courseId: string, path: string) =>
  invoke<CourseMaterial>('import_course_material_file', { courseId, path });
export const saveCourseMaterial = (courseId: string, filename: string, content: string) =>
  invoke<CourseMaterial>('save_course_material', { courseId, filename, content });
export const listCourseMaterials = (courseId: string) =>
  invoke<CourseMaterial[]>('list_course_materials', { courseId });
export const deleteCourseMaterial = (courseId: string, materialId: string) =>
  invoke<void>('delete_course_material', { courseId, materialId });
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

export type KnowledgeCourse = {
  id: string;
  name: string;
  color: string;
  topicCount: number;
  problemCount: number;
  dueCount: number;
};
export type KnowledgeProblem = {
  id: string;
  courseId: string;
  title: string;
  status: string;
  due: boolean;
  lastReviewedAt: string | null;
};
export type KnowledgeTopic = {
  id: string;
  courseId: string;
  name: string;
  problemCount: number;
  dueCount: number;
  masteryScore: number;
  lastReviewedAt: string | null;
  mistakeReasons: string[];
  problemIds: string[];
};
export type KnowledgeEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  kind: 'course_topic' | 'topic_problem';
};
export type KnowledgeGraph = {
  courses: KnowledgeCourse[];
  topics: KnowledgeTopic[];
  problems: KnowledgeProblem[];
  edges: KnowledgeEdge[];
};
export type ObsidianExportReport = {
  written: number;
  unchanged: number;
  conflicts: number;
  failed: number;
  courseCanvasPath: string | null;
};

export const getInboxItems = () => invoke<InboxItem[]>('get_inbox_items');
export const getDashboardOverview = (today: string) =>
  invoke<DashboardOverview>('get_dashboard_overview', { today });
export const searchLibrary = (query: string, limit = 12) =>
  invoke<LibrarySearchResult[]>('search_library', { query, limit });
export const getAllProblems = () => invoke<RecentProblem[]>('get_all_problems');
export const getKnowledgeGraph = (courseId: string | null, today: string) =>
  invoke<KnowledgeGraph>('get_knowledge_graph', { courseId, today });
export const exportObsidianVault = (destination: string, courseId: string | null, today: string) =>
  invoke<ObsidianExportReport>('export_obsidian_vault', { destination, courseId, today });
export const openObsidianCanvas = (canvasPath: string) =>
  invoke<void>('open_obsidian_canvas', { canvasPath });

export type ProblemField = {
  kind: string;
  value: string;
  updatedAt: string;
};

export type ProblemDocument = {
  id: string;
  courseId: string;
  hasImageAttachment: boolean;
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
export type AiConnectionResult = {
  authenticated: boolean;
  modelAvailable: boolean;
  visionDeclared: boolean;
};

type NativeAiProviderConfig = Omit<AiProviderConfig, 'isEnabled' | 'preset'>;

const toNativeAiProviderConfig = (config: AiProviderConfig): NativeAiProviderConfig => ({
  id: config.id,
  displayName: config.displayName,
  baseUrl: config.baseUrl,
  selectedModel: config.selectedModel,
  visionModel: config.visionModel,
  supportsVision: config.supportsVision,
  requestTimeoutSeconds: config.requestTimeoutSeconds,
  allowInsecureLocalhost: config.allowInsecureLocalhost,
});

export const testAiProvider = (config: AiProviderConfig) =>
  invoke<AiConnectionResult>('test_ai_provider', { config: toNativeAiProviderConfig(config) });

export const activateAiProvider = (config: AiProviderConfig) =>
  invoke<void>('activate_ai_provider', { config: toNativeAiProviderConfig(config) });

export const isAiProviderActive = (config: AiProviderConfig) =>
  invoke<boolean>('is_ai_provider_active', { config: toNativeAiProviderConfig(config) });

export const runProblemAnalysis = (
  problemId: string,
  mode: 'flash' | 'deep',
  config: AiProviderConfig,
  materialChunkIds: string[],
  expectedVersion: string,
  includeOriginalImage: boolean,
) => invoke<AiFieldSuggestion[]>('run_problem_analysis', {
  problemId,
  mode,
  config: toNativeAiProviderConfig(config),
  materialChunkIds,
  expectedVersion,
  includeOriginalImage,
});

export const importFiles = (paths: string[], courseId?: string) =>
  invoke<ImportFileResult[]>('import_files', { paths, courseId });
export const importClipboardImage = (dataBase64: string, mimeType: string, courseId?: string) =>
  invoke<InboxItem>('import_clipboard_image', { dataBase64, mimeType, courseId });

export type ReviewProblem = { id: string; stem: string; ownAnswer: string; standardAnswer: string; explanation: string };
export const getDueReviewProblems = (today: string) => invoke<ReviewProblem[]>('get_due_review_problems', { today });
export const completeReview = (problemId: string, grade: string, reviewedOn: string) =>
  invoke<{ intervalDays: number; nextReviewOn: string }>('complete_review', { problemId, grade, reviewedOn });

export type ProblemBook = { markdown: string; problemCount: number };
export const exportProblemBook = (destination: string, includeAnswers: boolean) =>
  invoke<ProblemBook>('export_problem_book', { destination, includeAnswers });
export const exportProblemBookHtml = (destination: string, includeAnswers: boolean) =>
  invoke<ProblemBook>('export_problem_book_html', { destination, includeAnswers });
