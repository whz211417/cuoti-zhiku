import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { readmeScreenshotScenes } from './readme-screenshot-scenes.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const outputDirectory = resolve(repositoryRoot, 'docs/assets/readme');

const courses = [
  { id: 'course-macro', name: '宏观经济学', term: '2026 秋', color: '#87a8c0', kind: 'school' },
  { id: 'course-finance', name: '公司金融', term: '2026 秋', color: '#b29a6b', kind: 'school' },
  { id: 'course-econometrics', name: '计量经济学', term: '2026 秋', color: '#8ea28d', kind: 'school' },
];

const recentProblems = [
  { id: 'problem-is-lm', courseId: 'course-macro', courseName: '宏观经济学', title: 'IS 曲线与扩张性财政政策', fallbackFilename: '课堂练习：财政政策.png', status: 'active', updatedAt: '2026-09-21T08:42:00Z' },
  { id: 'problem-multiplier', courseId: 'course-macro', courseName: '宏观经济学', title: '政府购买乘数的推导', fallbackFilename: '第六章课后题.pdf', status: 'active', updatedAt: '2026-09-20T12:20:00Z' },
  { id: 'problem-wacc', courseId: 'course-finance', courseName: '公司金融', title: 'WACC 与资本结构判断', fallbackFilename: '公司金融习题.png', status: 'inbox', updatedAt: '2026-09-19T16:08:00Z' },
];

const problemDocument = {
  id: 'problem-is-lm',
  courseId: 'course-macro',
  hasImageAttachment: true,
  title: 'IS 曲线与扩张性财政政策',
  status: 'active',
  updatedAt: '2026-09-21T08:42:00Z',
  version: 'v7',
  fields: [
    { kind: 'stem', value: '在价格水平不变的短期模型中，政府增加购买支出。请结合 IS-LM 模型说明均衡利率与均衡产出的变化。', updatedAt: '2026-09-21T08:42:00Z' },
    { kind: 'own_answer', value: '政府购买增加使总需求上升，产出提高；利率也可能上升。', updatedAt: '2026-09-21T08:42:00Z' },
    { kind: 'standard_answer', value: '政府购买增加使 IS 曲线右移。在货币供给不变时，新均衡表现为利率上升、产出增加；利率上升会挤出一部分私人投资。', updatedAt: '2026-09-21T08:42:00Z' },
    { kind: 'explanation', value: '先从商品市场判断 IS 右移，再沿固定的 LM 曲线寻找新均衡。关键是区分“财政扩张的直接拉动”和“利率上升带来的投资挤出”。', updatedAt: '2026-09-21T08:42:00Z' },
    { kind: 'mistake_reason', value: '只写出了总需求增加，没有解释货币市场约束与挤出效应。', updatedAt: '2026-09-21T08:42:00Z' },
    { kind: 'notes', value: '知识点：IS-LM 模型、财政政策、挤出效应', updatedAt: '2026-09-21T08:42:00Z' },
  ],
};

const provider = {
  id: 'bailian',
  displayName: '阿里云百炼',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  selectedModel: 'qwen3.6-flash',
  visionModel: 'qwen3.6-flash',
  supportsVision: true,
  requestTimeoutSeconds: 60,
  isEnabled: true,
  preset: 'bailian',
  allowInsecureLocalhost: false,
};

const fixtures = {
  courses,
  dashboard: {
    dueReviewCount: 6,
    pendingInboxCount: 3,
    courseCount: courses.length,
    materialCount: 9,
    courseSummaries: [
      { id: 'course-macro', name: '宏观经济学', color: '#87a8c0', problemCount: 18, pendingCount: 2, dueCount: 4, materialCount: 4, updatedAt: '2026-09-21T08:42:00Z' },
      { id: 'course-finance', name: '公司金融', color: '#b29a6b', problemCount: 12, pendingCount: 1, dueCount: 2, materialCount: 3, updatedAt: '2026-09-19T16:08:00Z' },
      { id: 'course-econometrics', name: '计量经济学', color: '#8ea28d', problemCount: 9, pendingCount: 0, dueCount: 0, materialCount: 2, updatedAt: '2026-09-18T09:10:00Z' },
    ],
    recentProblems,
    topMistakeReasons: [
      { label: '遗漏约束条件', count: 5 },
      { label: '图形移动方向判断错误', count: 3 },
      { label: '概念边界混淆', count: 2 },
    ],
    topKnowledgeTopics: [
      { label: 'IS-LM 模型', count: 7 },
      { label: '财政政策', count: 5 },
      { label: '资本成本', count: 3 },
    ],
    activityLastSevenDays: [
      { date: '2026-09-15', count: 2 },
      { date: '2026-09-16', count: 4 },
      { date: '2026-09-17', count: 1 },
      { date: '2026-09-18', count: 5 },
      { date: '2026-09-19', count: 3 },
      { date: '2026-09-20', count: 6 },
      { date: '2026-09-21', count: 4 },
    ],
  },
  inbox: [
    { id: 'inbox-1', problemId: 'problem-is-lm', attachmentId: 'attachment-1', filename: '课堂练习：财政政策.png', createdAt: '2026-09-21T08:30:00Z' },
    { id: 'inbox-2', problemId: 'problem-multiplier', attachmentId: 'attachment-2', filename: '第六章课后题.pdf', createdAt: '2026-09-20T12:10:00Z' },
    { id: 'inbox-3', problemId: 'problem-wacc', attachmentId: 'attachment-3', filename: '公司金融习题.png', createdAt: '2026-09-19T15:52:00Z' },
  ],
  materials: [
    { id: 'material-1', courseId: 'course-macro', filename: '宏观经济学第六章讲义.pdf', originalRelativePath: 'originals/material-1.pdf', sha256: 'demo', byteSize: 4821000, deletedAt: null },
    { id: 'material-2', courseId: 'course-macro', filename: 'IS-LM 模型课堂笔记.md', originalRelativePath: null, sha256: null, byteSize: 8650, deletedAt: null },
    { id: 'material-3', courseId: 'course-macro', filename: '期中复习提纲.txt', originalRelativePath: null, sha256: null, byteSize: 4200, deletedAt: null },
  ],
  materialSnippets: [
    { chunkId: 'chunk-1', materialId: 'material-1', filename: '宏观经济学第六章讲义.pdf', excerpt: '扩张性财政政策使 IS 曲线向右移动；货币供给既定时，均衡利率和均衡产出同时上升。' },
    { chunkId: 'chunk-2', materialId: 'material-2', filename: 'IS-LM 模型课堂笔记.md', excerpt: '利率上升压低私人投资，因此最终产出增量小于简单凯恩斯交叉模型中的增量。' },
  ],
  review: [
    { id: 'problem-is-lm', stem: '政府购买增加时，IS-LM 模型中的均衡利率和产出如何变化？请说明传导机制。', ownAnswer: 'IS 曲线右移，产出增加，利率上升。', standardAnswer: '政府购买增加使 IS 曲线右移；在 LM 不变时，均衡利率与产出均上升，同时出现部分投资挤出。', explanation: '先判断商品市场冲击，再用货币市场约束确定新均衡。作答时要写清楚直接拉动与挤出效应。' },
    { id: 'problem-multiplier', stem: '说明比例税制下政府购买乘数为何小于定额税情形。', ownAnswer: '', standardAnswer: '比例税降低可支配收入对产出的边际反应，因此削弱乘数。', explanation: '比较两种税制下消费函数斜率即可。' },
  ],
  knowledge: {
    courses: [
      { id: 'course-macro', name: '宏观经济学', color: '#87a8c0', topicCount: 4, problemCount: 8, dueCount: 4 },
      { id: 'course-finance', name: '公司金融', color: '#b29a6b', topicCount: 3, problemCount: 5, dueCount: 2 },
    ],
    topics: [
      { id: 'topic-is-lm', courseId: 'course-macro', name: 'IS-LM 模型', problemCount: 3, dueCount: 2, masteryScore: 46, lastReviewedAt: '2026-09-19', mistakeReasons: ['遗漏货币市场约束', '挤出效应解释不完整'], problemIds: ['problem-is-lm', 'problem-multiplier'] },
      { id: 'topic-fiscal', courseId: 'course-macro', name: '财政政策', problemCount: 2, dueCount: 1, masteryScore: 58, lastReviewedAt: '2026-09-18', mistakeReasons: ['曲线移动方向判断错误'], problemIds: ['problem-is-lm'] },
      { id: 'topic-ad-as', courseId: 'course-macro', name: 'AD-AS 模型', problemCount: 2, dueCount: 1, masteryScore: 72, lastReviewedAt: '2026-09-20', mistakeReasons: ['短期与长期混淆'], problemIds: ['problem-multiplier'] },
      { id: 'topic-wacc', courseId: 'course-finance', name: '资本成本', problemCount: 2, dueCount: 1, masteryScore: 52, lastReviewedAt: '2026-09-17', mistakeReasons: ['税盾处理遗漏'], problemIds: ['problem-wacc'] },
      { id: 'topic-capital', courseId: 'course-finance', name: '资本结构', problemCount: 2, dueCount: 1, masteryScore: 64, lastReviewedAt: '2026-09-16', mistakeReasons: ['账面价值与市场价值混淆'], problemIds: ['problem-wacc'] },
    ],
    problems: recentProblems.map((problem) => ({ id: problem.id, courseId: problem.courseId, title: problem.title, status: problem.status, due: problem.id !== 'problem-multiplier', lastReviewedAt: '2026-09-19' })),
    edges: [
      { id: 'edge-1', sourceId: 'course-macro', targetId: 'topic-is-lm', kind: 'course_topic' },
      { id: 'edge-2', sourceId: 'course-macro', targetId: 'topic-fiscal', kind: 'course_topic' },
      { id: 'edge-3', sourceId: 'course-macro', targetId: 'topic-ad-as', kind: 'course_topic' },
      { id: 'edge-4', sourceId: 'course-finance', targetId: 'topic-wacc', kind: 'course_topic' },
      { id: 'edge-5', sourceId: 'course-finance', targetId: 'topic-capital', kind: 'course_topic' },
      { id: 'edge-6', sourceId: 'topic-is-lm', targetId: 'problem-is-lm', kind: 'topic_problem' },
      { id: 'edge-7', sourceId: 'topic-is-lm', targetId: 'problem-multiplier', kind: 'topic_problem' },
      { id: 'edge-8', sourceId: 'topic-fiscal', targetId: 'problem-is-lm', kind: 'topic_problem' },
      { id: 'edge-9', sourceId: 'topic-wacc', targetId: 'problem-wacc', kind: 'topic_problem' },
    ],
  },
  problemDocument,
  aiProviderState: { providers: [provider], activeProviderId: provider.id },
  aiSuggestions: [
    { kind: 'standard_answer', value: '政府购买增加使 IS 曲线向右移动。在货币供给不变时，均衡利率与均衡产出同时上升。' },
    { kind: 'explanation', value: '商品市场需求上升先推动产出；更高的收入增加货币需求，从而推高利率。利率上升会挤出一部分私人投资。' },
    { kind: 'mistake_reason', value: '遗漏了货币市场约束，没有说明利率上升与投资挤出。' },
    { kind: 'notes', value: 'IS-LM 模型 · 扩张性财政政策 · 挤出效应' },
  ],
  recentProblems,
};

function installTauriMock(payload) {
  let nextCallbackId = 1;
  let nextResourceId = 100;
  const callbacks = new Map();
  const resources = new Map();

  const storeValue = (resourceId, key) => {
    const storePath = resources.get(resourceId);
    if (storePath === 'ai-providers.json' && key === 'state') return [payload.aiProviderState, true];
    return [undefined, false];
  };

  window.__TAURI_INTERNALS__ = {
    callbacks,
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    transformCallback(callback, once = false) {
      const id = nextCallbackId;
      nextCallbackId += 1;
      callbacks.set(id, once ? (...args) => { callbacks.delete(id); callback?.(...args); } : callback);
      return id;
    },
    unregisterCallback(id) { callbacks.delete(id); },
    runCallback(id, data) { callbacks.get(id)?.(data); },
    convertFileSrc(filePath) { return `asset://localhost/${encodeURIComponent(filePath)}`; },
    async invoke(command, args = {}) {
      switch (command) {
        case 'get_library_health': return { schemaVersion: 6, foreignKeysEnabled: true, journalMode: 'wal' };
        case 'get_courses': return payload.courses;
        case 'get_dashboard_overview': return payload.dashboard;
        case 'get_inbox_items': return payload.inbox;
        case 'get_problem_document': return payload.problemDocument;
        case 'get_due_review_problems': return payload.review;
        case 'get_knowledge_graph': return payload.knowledge;
        case 'get_all_problems': return payload.recentProblems;
        case 'list_course_materials': return args.deletedOnly ? [] : payload.materials;
        case 'search_course_material': return payload.materialSnippets;
        case 'has_ai_provider_key': return true;
        case 'is_ai_provider_active': return true;
        case 'get_ai_credential_migration_status': return 'ready';
        case 'run_problem_analysis': return payload.aiSuggestions;
        case 'plugin:store|load': {
          const resourceId = nextResourceId;
          nextResourceId += 1;
          resources.set(resourceId, args.path);
          return resourceId;
        }
        case 'plugin:store|get': return storeValue(args.rid, args.key);
        case 'plugin:event|listen': return 1;
        case 'plugin:event|unlisten':
        case 'plugin:store|set':
        case 'plugin:store|delete':
        case 'plugin:store|save':
        case 'plugin:resources|close':
        case 'plugin:updater|check':
          return null;
        default:
          return null;
      }
    },
  };
}

async function preparePage(browser, url) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  await page.addInitScript(installTauriMock, fixtures);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('application', { name: '错题智库' }).waitFor();
  return page;
}

const sceneActions = {
  overview: async (page) => {
    await page.getByLabel('学习总览').waitFor();
  },
  inbox: async (page) => {
    await page.getByRole('button', { name: '待整理' }).click();
    await page.getByLabel('待整理投题').waitFor();
    await page.evaluate(() => window.scrollTo({ top: 0 }));
  },
  'problem-detail': async (page) => {
    await page.getByRole('button', { name: '打开 IS 曲线与扩张性财政政策' }).click();
    await page.getByLabel('题目档案').waitFor();
    await page.evaluate(() => window.scrollTo({ top: 0 }));
  },
  'ai-review': async (page) => {
    await page.getByRole('button', { name: '打开 IS 曲线与扩张性财政政策' }).click();
    await page.getByRole('button', { name: 'AI 辅助整理' }).click();
    await page.getByRole('button', { name: '开始整理' }).click();
    await page.getByText('已生成 4 项建议').waitFor();
    await page.evaluate(() => window.scrollTo({ top: 0 }));
  },
  review: async (page) => {
    await page.getByRole('button', { name: '今日复习' }).click();
    await page.getByLabel('专注复习').waitFor();
    await page.getByRole('button', { name: '显示答案' }).waitFor();
  },
  knowledge: async (page) => {
    await page.getByRole('button', { name: '知识网络' }).click();
    await page.getByLabel('知识网络筛选').waitFor();
  },
  materials: async (page) => {
    await page.getByRole('button', { name: '宏观经济学', exact: true }).click();
    await page.getByRole('button', { name: '全部档案' }).click();
    const library = page.getByLabel('课程资料库');
    await library.waitFor();
    await library.evaluate((element) => {
      window.scrollTo({ top: Math.max(0, element.getBoundingClientRect().top + window.scrollY - 165) });
    });
  },
  'ai-settings': async (page) => {
    await page.getByRole('button', { name: '设置' }).click();
    await page.getByRole('dialog', { name: '偏好设置' }).waitFor();
    const settings = page.getByLabel('AI 多平台设置');
    await settings.waitFor();
    await settings.scrollIntoViewIfNeeded();
  },
};

await mkdir(outputDirectory, { recursive: true });
const server = await createServer({
  root: repositoryRoot,
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  logLevel: 'error',
});

let browser;
try {
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error('Vite did not expose a local preview URL.');
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const scene of readmeScreenshotScenes) {
    const page = await preparePage(browser, url);
    try {
      await sceneActions[scene.id](page);
      await page.waitForTimeout(500);
      if (scene.id === 'problem-detail') await page.evaluate(() => window.scrollTo({ top: 0 }));
      await page.mouse.move(1180, 118);
      await page.screenshot({
        path: resolve(outputDirectory, scene.filename),
        animations: 'disabled',
        fullPage: false,
      });
      console.log(`captured ${scene.filename} — ${scene.label}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
