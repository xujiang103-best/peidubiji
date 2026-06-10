// ai-helper.js - AI 记忆辅助生成

class AIHelper {
  constructor() {
    this.apiUrl = '';
    this.apiKey = '';
    this.initialized = false;
  }

  // 初始化
  async init() {
    // 从设置中读取配置
    this.apiKey = await database.getSetting('deepseek_api_key');
    this.apiUrl = await database.getSetting('api_proxy_url') || '/api/proxy/deepseek';
    
    this.initialized = true;
    console.log('AI 辅助模块初始化完成');
  }

  // 确保已初始化
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }

  // 生成记忆辅助（主函数）
  async generateMemoryAid(question, aidType = 'rhyme') {
    await this.ensureInitialized();

    if (!this.apiKey && !this.apiUrl.includes('proxy')) {
      throw new Error('请先配置 DeepSeek API Key');
    }

    switch (aidType) {
      case 'rhyme':
        return await this.generateRhyme(question);
      case 'image':
        return await this.generateImageMemory(question);
      case 'story':
        return await this.generateStory(question);
      default:
        return await this.generateRhyme(question);
    }
  }

  // 生成顺口溜
  async generateRhyme(question) {
    const prompt = `你是一位幽默的语文老师，擅长把知识点编成朗朗上口的顺口溜。
请把下面的题目和答案编成一个简短的顺口溜（4-8句），帮助学生记忆。

题目：${question.content}
答案：${question.answer}
${question.explanation ? `解析：${question.explanation}` : ''}

要求：
1. 顺口溜要押韵、好记
2. 包含关键知识点
3. 语言要通俗易懂，适合中学生
4. 可以加入一些幽默元素
5. 长度控制在4-8句

只输出顺口溜内容，不要其他解释。`;

    return await this.callDeepSeek(prompt, {
      temperature: 0.9, // 更高创造性
      max_tokens: 300,
    });
  }

  // 生成图像记忆
  async generateImageMemory(question) {
    const prompt = `你是一位善于联想记忆的专家。请把下面的知识点转化成一个生动的视觉画面描述，帮助学生通过图像记忆。

题目：${question.content}
答案：${question.answer}

要求：
1. 描述一个具体、生动的画面
2. 画面要与知识点强关联
3. 越夸张、越有趣越好记
4. 可以拟人化
5. 长度在100字以内
6. 适合中学生理解

只输出画面描述，不要其他解释。`;

    return await this.callDeepSeek(prompt, {
      temperature: 0.8,
      max_tokens: 200,
    });
  }

  // 生成故事
  async generateStory(question) {
    const prompt = `你是一位会编故事的老师的。请把下面的知识点编成一个简短的小故事，帮助学生记忆。

题目：${question.content}
答案：${question.answer}

要求：
1. 故事要有趣、好记
2. 故事中要包含关键知识点
3. 适合中学生理解
4. 长度在150字以内

只输出故事内容，不要其他解释。`;

    return await this.callDeepSeek(prompt, {
      temperature: 0.85,
      max_tokens: 250,
    });
  }

  // 调用 DeepSeek API
  async callDeepSeek(prompt, options = {}) {
    await this.ensureInitialized();

    const defaultOptions = {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 500,
      top_p: 0.95,
      frequency_penalty: 0,
      presence_penalty: 0,
    };

    const requestOptions = { ...defaultOptions, ...options };

    let lastError = null;
    
    // 重试3次
    for (let i = 0; i < 3; i++) {
      try {
        showLoading('AI 正在生成记忆辅助...');

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(requestOptions),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API调用失败 (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        
        hideLoading();
        
        return data.choices[0].message.content.trim();
      } catch (error) {
        lastError = error;
        console.warn(`第 ${i + 1} 次重试失败:`, error);
        
        // 等待2秒后重试
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    hideLoading();
    throw lastError || new Error('API调用失败（重试3次）');
  }

  // 保存 API 配置
  async saveConfig(apiKey, apiProxyUrl) {
    if (apiKey) {
      await database.saveSetting('deepseek_api_key', apiKey);
      this.apiKey = apiKey;
    }

    if (apiProxyUrl) {
      await database.saveSetting('api_proxy_url', apiProxyUrl);
      this.apiUrl = apiProxyUrl;
    }

    console.log('AI 配置已保存');
  }

  // 测试 API 连接
  async testConnection() {
    try {
      await this.ensureInitialized();

      if (!this.apiKey) {
        return { success: false, message: 'API Key 未配置' };
      }

      // 发送一个简单的测试请求
      const response = await this.callDeepSeek('你好，请回复"连接成功"', {
        max_tokens: 10,
      });

      return { success: true, message: '连接成功', response };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

// 创建单例实例
const aiHelper = new AIHelper();

// 导出
window.aiHelper = aiHelper;
