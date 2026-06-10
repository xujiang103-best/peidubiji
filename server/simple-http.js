// server/simple-http.js - 简单 HTTP 服务器
// 支持静态文件服务、CORS、API 代理

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0'; // 允许局域网访问

// MIME 类型映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'font/eot',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

// 获取本机 IP 地址
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // 跳过内部接口和非 IPv4 地址
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  return 'localhost';
}

// 设置 CORS 头
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// 处理 OPTIONS 预检请求
function handleOptionsRequest(req, res) {
  if (req.method === 'OPTIONS') {
    setCORSHeaders(res);
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

// 静态文件服务
function serveStaticFile(req, res) {
  let filePath = '.' + url.parse(req.url).pathname;
  
  // 默认文件
  if (filePath === './') {
    filePath = './index.html';
  }
  
  // 解码 URL（处理中文文件名）
  filePath = decodeURIComponent(filePath);
  
  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';
  
  // 读取文件
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 - 文件未找到</h1>', 'utf-8');
      } else {
        // 服务器错误
        res.writeHead(500);
        res.end(`服务器错误: ${error.code}`, 'utf-8');
      }
    } else {
      // 成功返回文件
      setCORSHeaders(res);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}

// DeepSeek API 代理
function handleDeepSeekProxy(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // 读取请求体
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    try {
      // 解析请求体
      const requestBody = JSON.parse(body);
      
      // 获取 API Key
      const apiKey = process.env.DEEPSEEK_API_KEY;
      
      if (!apiKey) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'DEEPSEEK_API_KEY 未设置' }));
        return;
      }
      
      // 转发到 DeepSeek API
      const options = {
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      };
      
      const proxyReq = https.request(options, (proxyRes) => {
        // 读取 DeepSeek 响应
        let data = '';
        proxyRes.on('data', chunk => {
          data += chunk;
        });
        
        proxyRes.on('end', () => {
          // 设置 CORS 头
          setCORSHeaders(res);
          
          // 返回 DeepSeek 响应
          res.writeHead(proxyRes.statusCode, {
            'Content-Type': 'application/json',
          });
          res.end(data);
        });
      });
      
      proxyReq.on('error', (error) => {
        console.error('代理请求错误:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      });
      
      // 发送请求体
      proxyReq.write(JSON.stringify(requestBody));
      proxyReq.end();
    } catch (error) {
      console.error('处理请求错误:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  // 设置 CORS 头
  setCORSHeaders(res);
  
  // 处理 OPTIONS 预检请求
  if (handleOptionsRequest(req, res)) {
    return;
  }
  
  // API 代理
  if (req.url.startsWith('/api/proxy/deepseek')) {
    handleDeepSeekProxy(req, res);
    return;
  }
  
  // 静态文件服务
  serveStaticFile(req, res);
});

// 启动服务器
server.listen(PORT, HOST, () => {
  const localIP = getLocalIP();
  
  console.log('='.repeat(60));
  console.log('🚀 陪读笔记服务器已启动！');
  console.log('='.repeat(60));
  console.log('');
  console.log('📱 本机访问:');
  console.log(`   http://localhost:${PORT}`);
  console.log('');
  console.log('📱 iPad 访问 (确保 iPad 和本机在同一 Wi-Fi):');
  console.log(`   http://${localIP}:${PORT}`);
  console.log('');
  console.log('⚙️  环境变量:');
  console.log(`   PORT: ${PORT}`);
  console.log(`   DEEPSEEK_API_KEY: ${process.env.DEEPSEEK_API_KEY ? '已设置' : '未设置'}`);
  console.log('');
  console.log('='.repeat(60));
  console.log('');
  console.log('提示: 按 Ctrl+C 停止服务器');
  console.log('');
});

// 错误处理
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`错误: 端口 ${PORT} 已被占用`);
    console.error(`请尝试: PORT=8081 node server/simple-http.js`);
  } else {
    console.error('服务器错误:', error);
  }
  process.exit(1);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});
