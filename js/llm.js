/**
 * LLM 模块 - 支持两种模式：
 * 1. 代理模式（通过本地 server.js 转发，适合浏览器访问）
 * 2. 直连模式（直接调用 DeepSeek API，适合 APK/WebView 环境）
 */

const LLM = {
  /**
   * 判断当前运行环境
   * @returns {string} 'proxy' | 'direct'
   */
  getMode() {
    const origin = window.location.origin;
    // file:// 协议 或 http://localhost 且服务器不可达 → 直连模式
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
      throw new Error('当前为直连模式，无需 API base。请通过 setApiKey() 设置 Key。');
    }
    return origin;
  },

  /**
   * 设置并保存 API Key（直连模式用 localStorage）
   */
  setApiKey(key) {
    localStorage.setItem('deepseek_api_key', key);
  },

  getApiKey() {
    return localStorage.getItem('deepseek_api_key') || '';
  },

  /**
   * 检查 API 是否可用
   */
  async checkHealth() {
    const mode = this.getMode();
    if (mode === 'direct') {
      // 直连模式：检查是否有 API Key
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
   * 为错题生成顺口溜记忆辅助
   * @param {string} question - 题目内容
   * @param {string} answer - 正确答案
   * @param {string} explanation - 题目解析（可选）
   * @returns {Promise<string>} 顺口溜
   */
  async generateMnemonics(question, answer, explanation = '') {
    const prompt = `你是一位富有经验的中学老师，擅长把知识点编成朗朗上口的顺口溜，帮助学生快速记忆。

题目：${question}
正确答案：${answer}
${explanation ? `解析：${explanation}` : ''}

请生成一个易记的顺口溜（押韵口诀），要求：
1. 不超过4句，每句7-14字
2. 朗朗上口，押韵自然
3. 内容准确，紧扣知识点
4. 适合中学生理解和记忆
5. 只输出顺口溜内容，不要多余的解释

格式示例：
"氢氧化钙石灰水，检验二氧化碳味。
澄清变浑是特征，白色沉淀底部睡。"`;

    return await this.callAPI([
      { role: 'user', content: prompt }
    ], { temperature: 0.8, max_tokens: 300 });
  },

  /**
   * 为错题生成图像记忆描述
   * @param {string} question - 题目内容
   * @param {string} answer - 正确答案
   * @returns {Promise<string>} 图像记忆描述
   */
  async generateImageMemory(question, answer) {
    const prompt = `请把以下知识点转化为一个生动的形象化记忆方法（图像记忆法），帮助学生通过"脑海画面"来记住答案。

题目：${question}
正确答案：${answer}

要求：
1. 描述一个具体的、夸张的、容易想象的图像或场景
2. 图像要和答案有强关联，看到图像就能想起答案
3. 50-100字，语言生动有趣
4. 只输出图像记忆描述，不要多余解释

格式示例：
"想象一个红色的苹果（代表答案A），苹果上长着三只眼睛（代表三个条件），你一看到三只眼的红苹果，就想起选A！"`;

    return await this.callAPI([
      { role: 'user', content: prompt }
    ], { temperature: 0.8, max_tokens: 300 });
  },

  /**
   * 通用：生成记忆辅助（顺口溜 + 图像记忆）
   */
  async generateMemoryAid(question, answer, explanation = '') {
    const [mnemonics, imageMemory] = await Promise.all([
      this.generateMnemonics(question, answer, explanation),
      this.generateImageMemory(question, answer).catch(() => '')
    ]);

    let result = `📍 顺口溜：\n${mnemonics.trim()}`;
    if (imageMemory) {
      result += `\n\n🖼️ 图像记忆：\n${imageMemory.trim()}`;
    }
    return result;
  }
};

// 导出
window.LLM = LLM;
