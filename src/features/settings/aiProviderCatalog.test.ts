import { expect, test } from 'vitest';
import { AI_PROVIDER_PRESETS, createCustomProvider, createPresetProvider } from './aiProviderCatalog';

test('ships the five editable provider recommendations with verified endpoints and models', () => {
  expect(AI_PROVIDER_PRESETS.map((item) => item.id)).toEqual([
    'bailian', 'deepseek', 'zhipu', 'moonshot', 'openai',
  ]);
  expect(AI_PROVIDER_PRESETS.map((item) => [item.baseUrl, item.models.map((model) => model.id)])).toEqual([
    ['https://dashscope.aliyuncs.com/compatible-mode/v1', ['qwen3.6-flash', 'qwen3.7-plus']],
    ['https://api.deepseek.com', ['deepseek-v4-flash', 'deepseek-v4-pro']],
    ['https://open.bigmodel.cn/api/paas/v4', ['glm-5.2', 'glm-4.5v']],
    ['https://api.moonshot.cn/v1', ['kimi-k3', 'kimi-k2.6']],
    ['https://api.openai.com/v1', ['gpt-5.6-luna', 'gpt-5.6-terra']],
  ]);
  expect(createPresetProvider('deepseek')).toMatchObject({
    id: 'deepseek', supportsVision: false, visionModel: null, preset: 'deepseek',
  });
});

test('ships safe custom defaults', () => {
  const custom = createCustomProvider();

  expect(custom.baseUrl).toBe('https://');
  expect(custom.id).toMatch(/^custom-/);
  expect(custom.allowInsecureLocalhost).toBe(false);
  expect(custom).not.toHaveProperty('apiKey');
});
