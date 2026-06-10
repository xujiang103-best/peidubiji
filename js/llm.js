/**
 * LLM 模块 - 支持两种模式：
 * 1. 代理模式（通过本地 server.js 转发，适合浏览器访问）
 * 2. 直连模式（直接调用 DeepSeek API，适合 APK/WebView 环境）
 */

const LLM = {
  // 内置 API Key（APK 打包时直接封装，用户无需手动配置）
  BUILTIN_API_KEY: 'sk-bf541714fdab4744a9a86f5445ba9e5b',

  /**
   * 判断当前是否在 Capacitor / APK 环境中
   */
  isAPK() {
    return !!(window.Capacitor || window.CapacitorNative || window.Android);
  },

  /**
   * 判断当前运行环境
   * @returns {string} 'proxy' | 'direct'
   */
  getMode() {
    // Capacitor / APK 环境强制走直连模式
    if (this.isAPK()) return 'direct';

    const origin = window.location.origin;
    // file:// 协议 → 直连模式
    if (!origin || origin === 'null' || origin.startsWith('file:')) {
      return 'direct';
    }
    return 'proxy';
  },

  /**
   * 获取 API 基础地址（本地服务器）
   */
  getApiBase() {
    const origin = window.location.origin;
    if (!origin || origin === 'null' || origin.startsWith('file:')) {
      throw new Error('当前为直连模式，无需 API base。');
    }
    return origin;
  },

  /**
   * 设置并保存 API Key（直连模式用 localStorage，可覆盖内置 Key）
   */
  setApiKey(key) {
    localStorage.setItem('deepseek_api_key', key);
  },

  /**
   * 获取 API Key：localStorage 优先，否则使用内置 Key
   */
  getApiKey() {
    return localStorage.getItem('deepseek_api_key') || this.BUILTIN_API_KEY || '';
  },

  /**
   * 检查 API 是否可用
   */
  async checkHealth() {
    const mode = this.getMode();
    if (mode === 'direct') {
      // 直连模式：有内置 Key 或 localStorage Key 即可
      return !!this.getApiKey();
    }
    try {
      const res = await fetch(`${this.getApiBase()}/api/health`);
      const data = await res.json();
      return data.deepseek_configured;
    } catch {
      // 代理服务器不可达，自动切换直连模式
      return !!this.getApiKey();
    }
  },

  /**
   * 调用 DeepSeek API（自动选择模式）
   */
  async callAPI(messages, options = {}) {
    const { model = 'deepseek-chat', temperature = 0.7, max_tokens = 500 } = options;
    const mode = this.getMode();

    if (mode === 'direct') {
      return await this.callAPIDirect(messages, { model, temperature, max_tokens });
    }

    // 代理模式
    const apiKey = this.getApiKey();
    const res = await fetch(`${this.getApiBase()}/api/deepseek`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model, temperature, max_tokens, api_key: apiKey })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API 调用失败');
    return data.choices[0].message.content;
  },

  /**
   * 直连 DeepSeek API（APK / file:// 环境）
   */
  async callAPIDirect(messages, options = {}) {
    const { model = 'deepseek-chat', temperature = 0.7, max_tokens = 500 } = options;
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('请先在"记忆辅助"页面配置 DeepSeek API Key');

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'API 调用失败');
    return data.choices[0].message.content;
  },

  /**
   * 系统提示词 — 记忆故事法（打包自 peidu.md）
   * 原则：越夸张越好记，离谱但知识点不能错
   */
  MEMORY_STORY_SYSTEM_PROMPT: `你是一名擅长"记忆故事法"的初中历史、地理、生物和政治老师。

我会给你一道孩子做错的题，请你不要直接讲大道理，而是按下面流程帮孩子记住：

1. 先判断这道题的考点是什么。
2. 分析孩子可能为什么会错：是概念混淆、顺序记错、地点记错、因果关系没搞清，还是关键词没有画面。
3. 把正确答案拆成几个关键词。
4. 给每个关键词设计一个非常夸张、离谱、好笑、有画面感的角色、动作或场景。
5. 把这些关键词串成一个短故事，故事要让孩子一听就忘不掉。
6. 如果有容易混淆的错误答案，要在故事里专门安排一个"被赶走/被拦下/被打脸"的情节，帮助孩子排除错误选项。
7. 最后输出一句简短口诀，帮助孩子快速回忆。
8. 再给孩子一个"闭眼复述问题"，让孩子马上回忆这个画面。

要求：
- 面向初中生，语言要简单、有趣，不要太幼稚。
- 故事可以夸张，但不能胡编知识点。
- 每个夸张元素必须和正确答案有明确对应关系。
- 不要写太长，控制在300字以内。
- 最后必须回到标准答案。

必须严格按照以下格式输出，不要添加其他内容：

【考点】
……

【错因】
……

【💥 夸张故事】
……

【🔗 记忆锚点】
（列出故事中的每个夸张元素和正确答案的对应关系）

【📢 口诀】
……

【👁️ 闭眼回忆】
……`,

  /**
   * 使用「记忆故事法」为错题生成夸张记忆辅助
   * @param {string} question - 题目内容（含选项）
   * @param {string} answer - 正确答案
   * @param {string} explanation - 题目解析（可选）
   * @returns {Promise<string>} 结构化记忆辅助
   */
  async generateExaggeratedStory(question, answer, explanation = '') {
    const userPrompt = `题目：${question}
正确答案：${answer}${explanation ? `\n解析：${explanation}` : ''}

请用「记忆故事法」帮孩子记住这道题的正确答案。记住：越夸张越离谱越好，但知识点必须准确！`;

    return await this.callAPI([
      { role: 'system', content: this.MEMORY_STORY_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ], { temperature: 0.9, max_tokens: 1200 });
  },

  /**
   * 通用：生成记忆辅助（夸张故事 + 记忆锚点 + 口诀 + 闭眼回忆）
   */
  async generateMemoryAid(question, answer, explanation = '') {
    const result = await this.generateExaggeratedStory(question, answer, explanation);
    return result.trim();
  }
};

// 导出
window.LLM = LLM;
