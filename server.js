const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
// 尝试从 .env 文件读取 key（优先级高于环境变量）
let DEEPSEEK_API_KEY = '';
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const match = envFile.match(/DEEPSEEK_API_KEY=(.+)/);
  if (match) DEEPSEEK_API_KEY = match[1].trim();
} catch (_) {}
if (!DEEPSEEK_API_KEY) {
  DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
}

if (DEEPSEEK_API_KEY) {
  console.log('🔑 API Key 已加载 (' + DEEPSEEK_API_KEY.substring(0, 8) + '***...)');
}
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 静态文件服务（优先使用项目根目录，如果没有则使用当前目录）
const staticDir = path.join(__dirname);
app.use(express.static(staticDir, {
  setHeaders: (res, filePath) => {
    // 设置正确的 MIME 类型
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
  }
}));

// DeepSeek API 代理端点
app.post('/api/deepseek', async (req, res) => {
  // 优先使用请求中携带的 key（前端设置页保存的），否则用服务器配置的 key
  const apiKey = req.body.api_key || DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: '未配置 API Key。请在页面设置中配置，或在 .env 文件中设置 DEEPSEEK_API_KEY。'
    });
  }

  try {
    const { messages, model = 'deepseek-chat', temperature = 0.7, max_tokens = 500 } = req.body;

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('DeepSeek API 代理错误:', error);
    res.status(500).json({
      error: '调用 DeepSeek API 失败',
      message: error.message
    });
  }
});

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    deepseek_configured: !!DEEPSEEK_API_KEY,
    static_dir: staticDir
  });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log(`🎓 徐爸陪读笔记辅助学习系统 启动成功！`);
  console.log('='.repeat(60));
  console.log(`📱 本机访问: http://localhost:${PORT}`);
  
  // 获取本机 IP 地址
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        addresses.push(addr.address);
      }
    }
  }
  
  if (addresses.length > 0) {
    console.log(`📱 iPad 访问: http://${addresses[0]}:${PORT}`);
    console.log(`   (确保 iPad 和电脑在同一 WiFi)`);
  }
  
  console.log('='.repeat(60));
  console.log(`🔑 DeepSeek API: ${DEEPSEEK_API_KEY ? '已配置 ✅' : '未配置 ⚠️'}`);
  if (!DEEPSEEK_API_KEY) {
    console.log('   设置环境变量: export DEEPSEEK_API_KEY=your_key_here');
  }
  console.log('='.repeat(60));
  console.log('按 Ctrl+C 停止服务器');
  console.log('='.repeat(60));
});
