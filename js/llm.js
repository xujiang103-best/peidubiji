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
    const { model = this.MODEL, temperature = 0.7, max_tokens = 500 } = options;
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
    const { model = this.MODEL, temperature = 0.7, max_tokens = 500 } = options;
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
   * 系统提示词 — 趣味记忆法（顺口溜 / 谐音梗 / 荒诞故事）
   * 只输出一段有记忆点的内容，100 字以内，绝不重复相同套路
   */
  MEMORY_SYSTEM_PROMPT: `你是一个专门帮初中生记住知识点的趣味老师，擅长用奇葩方式让知识忘不掉。

给你一道错题的正确答案，你需要把它变成一段有强烈记忆点的描述，100 字以内。

风格随机选择（每次换一种，不要千篇一律）：
- 顺口溜 / 押韵口诀：朗朗上口，像儿歌一样容易哼
- 谐音梗 / 同音字联想：用发音相近的词制造笑点
- 荒诞故事 / 离谱场景：把知识点变成一个夸张到荒谬的画面
- 冷笑话 / 脑筋急转弯：让知识变成一句让人翻白眼又忘不掉的话
- 生活类比：用日常生活中的搞笑场景来对应

规则：
- 只输出一段纯文字，不超过 100 字
- 同一道题每次都变花样，不要老用同一种风格
- 不准出现"龙""巨龙""金龙""神龙"相关元素
- 不要标题、标签、序号、emoji、markdown
- 不要"画面""想象"等引导词，直接给答案

好例子：
"氯化银是白色沉淀，记住：滤（氯）纸（质）白，银（银）白。硝酸银遇到氯离子就像遇到'老婆'，立刻'白头偕老'！"
"秦岭淮河分南北，口诀：秦（琴）岭（领）淮（坏）河（盒），琴坏了装盒子里，南北分界线一把抓。"
"勾股定理 a²+b²=c²：勾三股四弦五，就像三条边手拉手围成一个直角框，3²+4²=9+16=25=5²！"`,

  MODEL: 'deepseek-v4-pro',

  /**
   * 为错题生成夸张画面记忆（纯文本，100字内）
   */
  async generateMemoryAid(question, answer, explanation = '') {
    const userPrompt = `题目：${question}
正确答案：${answer}${explanation ? `\n解析：${explanation}` : ''}

请把正确答案变成一个有趣的记忆方法（顺口溜/谐音梗/荒诞故事/冷笑话任选一种）：`;

    return await this.callAPI([
      { role: 'system', content: this.MEMORY_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ], { temperature: 0.95, max_tokens: 300 });
  },

  /**
   * 生成配图提示词（用于后续漫画生成）
   */
  async generateImagePrompt(question, answer) {
    const prompt = `请为以下知识点的夸张记忆画面，写一个适合 AI 绘画的英文 prompt（manga/comic style, vivid, exaggerated, educational）：

题目：${question}
答案：${answer}

只输出英文 prompt，不超过 50 个单词，不要任何解释。`;

    return await this.callAPI([
      { role: 'user', content: prompt }
    ], { temperature: 0.7, max_tokens: 150 });
  }
};

// 导出
window.LLM = LLM;
