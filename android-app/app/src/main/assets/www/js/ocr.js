/**
 * OCR 模块 - 使用 Tesseract.js 识别题目图片
 * 支持中文识别（chi_sim）
 */

const OCR = {
  worker: null,
  initializing: false,

  /**
   * 初始化 Tesseract worker（懒加载，只初始化一次）
   */
  async initWorker() {
    if (this.worker) return this.worker;
    if (this.initializing) {
      // 等待已存在的初始化完成
      while (this.initializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return this.worker;
    }

    this.initializing = true;
    showToast('正在加载 OCR 模型，首次使用请稍候...');

    try {
      this.worker = await Tesseract.createWorker('chi_sim', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            const pct = Math.round(m.progress * 100);
            const el = document.getElementById('ocr-progress');
            if (el) el.querySelector('p').textContent = `正在识别中 ${pct}%...`;
          }
        }
      });
      showToast('OCR 模型加载完成！');
      this.initializing = false;
      return this.worker;
    } catch (err) {
      this.initializing = false;
      showToast('OCR 模型加载失败：' + err.message);
      throw err;
    }
  },

  /**
   * 识别图片中的文字
   * @param {File} imageFile - 图片文件
   * @returns {Promise<string>} 识别结果
   */
  async recognize(imageFile) {
    const worker = await this.initWorker();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const { data: { text } } = await worker.recognize(e.target.result);
          resolve(text.trim());
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.readAsDataURL(imageFile);
    });
  },

  /**
   * 解析 OCR 结果，尝试提取题目和答案
   * 简单启发式解析，准确率有限，需要人工校对
   * @param {string} text - OCR识别文本
   * @returns {Object} { content, options, answer }
   */
  parseOCRResult(text) {
    const lines = text.split('\n').filter(l => l.trim());
    const result = { content: '', options: null, answer: '' };

    // 尝试提取选项（A. B. C. D.）
    const optionRegex = /^([A-D])[.、．]?\s*(.+)$/;
    const options = {};
    const contentLines = [];

    for (const line of lines) {
      const match = line.match(optionRegex);
      if (match) {
        options[match[1]] = match[2].trim();
      } else {
        // 尝试提取答案（答案/答：/正确答案）
        const answerMatch = line.match(/(答案|答[：:])[：:】]?\s*([A-D]|正确|错误|.+)/);
        if (answerMatch) {
          result.answer = answerMatch[2].trim();
        } else {
          contentLines.push(line.trim());
        }
      }
    }

    result.content = contentLines.join('\n').substring(0, 500);
    if (Object.keys(options).length > 0) {
      result.options = options;
    }

    return result;
  },

  /**
   * 终止 worker（释放内存）
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
};

// 全局函数：启动 OCR 识别
async function startOCR() {
  const fileInput = document.getElementById('ocr-file-input');
  const file = fileInput.files[0];
  if (!file) return;

  // 显示预览
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('ocr-preview-img');
    preview.src = e.target.result;
    document.getElementById('ocr-preview-area').style.display = 'block';
    document.getElementById('ocr-progress').style.display = 'block';
  };
  reader.readAsDataURL(file);

  // 开始识别
  try {
    const text = await OCR.recognize(file);
    document.getElementById('ocr-result-text').value = text;
    document.getElementById('ocr-progress').style.display = 'none';

    // 尝试解析
    const parsed = OCR.parseOCRResult(text);
    if (parsed.content) {
      // 可以帮助填充表单（这里先不自动填充，让用户自己校对）
    }

    showToast('识别完成，请校对后保存！');
  } catch (err) {
    document.getElementById('ocr-progress').innerHTML =
      `<p style="color:var(--danger);">识别失败：${err.message}</p>`;
  }
}

// 全局函数：保存 OCR 识别的题目
async function doSaveOCRQuestion() {
  const subjectId = parseInt(document.getElementById('ocr-subject').value);
  const type = document.getElementById('ocr-question-type').value;
  const content = document.getElementById('ocr-result-text').value.trim();
  const answer = document.getElementById('ocr-answer').value.trim();

  if (!subjectId) return showToast('请选择学科');
  if (!content) return showToast('请确认题目内容');
  if (!answer) return showToast('请填写正确答案');

  try {
    await window.ExamDB.addQuestion({
      subjectId,
      type,
      content,
      answer,
      explanation: '',
      image: document.getElementById('ocr-preview-img').src || null
    });

    showToast('题目保存成功！');
    hideDialog('dialog-ocr');
    loadQuestions();
  } catch (err) {
    showToast('保存失败：' + err.message);
  }
}

// ============================================================
// 整页批量识别模式
// ============================================================

/**
 * 调用 DeepSeek API 将 OCR 原始文本拆分为多道结构化题目
 * @param {string} rawText - OCR 识别的原始文本
 * @returns {Promise<Array>} 题目列表 [{ type, content, options, answer }]
 */
async function parseQuestionsWithAI(rawText) {
  const prompt = `你是一个专业的试卷解析器。请将以下 OCR 识别出的试卷文字拆分为独立的题目，输出 JSON 数组。

原始文字：
"""
${rawText}
"""

规则：
1. 根据题号（1. 2. 一、二、等）拆分题目
2. 每道题判断类型：choice(选择题)、truefalse(判断题)、fillblank(填空题)
3. 选择题需提取 A/B/C/D 四个选项
4. 判断题正确答案是"正确"或"错误"（如果在原文中能找到答案就提取，否则填"未知"）
5. 填空题正确答案如果在原文中能找到就提取，否则填"未知"
6. 图片中可能不包含答案，这不影响拆题

输出格式（只输出 JSON 数组，不要其他内容）：
[
  {
    "type": "choice",
    "content": "题目内容（不含选项）",
    "options": {"A": "选项A", "B": "选项B", "C": "选项C", "D": "选项D"},
    "answer": "B"
  },
  {
    "type": "truefalse",
    "content": "题目内容",
    "options": null,
    "answer": "正确"
  },
  {
    "type": "fillblank",
    "content": "题目内容（用___表示填空处）",
    "options": null,
    "answer": "答案内容"
  }
]

请严格按照 JSON 数组格式输出。`;

  const result = await LLM.callAPI(
    [{ role: 'user', content: prompt }],
    { temperature: 0.3, max_tokens: 3000 }
  );

  // 提取 JSON（DeepSeek 可能包裹在 ```json 中）
  let jsonStr = result.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  try {
    const questions = JSON.parse(jsonStr);
    if (!Array.isArray(questions)) throw new Error('AI返回格式异常');
    return questions;
  } catch (e) {
    console.error('AI拆题解析失败:', e, '\n原始输出:', result);
    throw new Error('AI 拆题失败，可能是OCR识别文字太模糊，建议重新拍照或手动输入');
  }
}

/**
 * 渲染批量题目预览列表
 * @param {Array} questions - 题目列表
 */
let _batchQuestions = []; // 暂存当前批次的题目

function renderBatchPreview(questions) {
  _batchQuestions = questions;
  const area = document.getElementById('batch-preview-area');
  const list = document.getElementById('batch-question-list');
  const summary = document.getElementById('batch-summary');
  const imgSrc = document.getElementById('ocr-preview-img').src;

  area.style.display = 'block';
  summary.innerHTML = `共识别 <b>${questions.length}</b> 道题，原图已关联到每道题（含配图的题目在考试中会显示图片）。
    <br>确认无误后点击「批量保存」` +
    (questions.some(q => q.answer === '未知') ? '<br>⚠️ 部分答案需手动补充' : '');

  list.innerHTML = '';
  questions.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'batch-q-card';

    const typeLabels = { choice: '选择题', truefalse: '判断题', fillblank: '填空题' };
    const typeOptions = ['choice', 'truefalse', 'fillblank']
      .map(t => `<option value="${t}" ${q.type === t ? 'selected' : ''}>${typeLabels[t]}</option>`)
      .join('');

    const optionsHTML = q.type === 'choice' && q.options
      ? ['A', 'B', 'C', 'D'].map(k =>
          `<div class="batch-opt-row">
            <label>${k}. </label>
            <input type="text" class="batch-opt-input" data-idx="${i}" data-key="${k}" value="${escapeAttr(q.options[k] || '')}">
          </div>`
        ).join('')
      : '';

    card.innerHTML = `
      <div class="batch-q-header">
        <span class="batch-q-num">第 ${i + 1} 题</span>
        <select class="batch-q-type" data-idx="${i}" onchange="onBatchTypeChange(${i}, this.value)">
          ${typeOptions}
        </select>
        <span class="batch-q-answer-label">答案：</span>
        <input type="text" class="batch-q-answer" data-idx="${i}" value="${escapeAttr(q.answer || '')}" placeholder="补充答案">
        <label class="batch-has-image" title="在考试中显示原图">
          <input type="checkbox" checked onchange="toggleQuestionImage(${i}, this.checked)"> 📷 含原图
        </label>
      </div>
      <textarea class="batch-q-content" data-idx="${i}" rows="2">${escapeHtml(q.content || '')}</textarea>
      ${optionsHTML ? `<div class="batch-options-area">${optionsHTML}</div>` : '<div class="batch-options-area" style="display:none;"></div>'}
    `;
    list.appendChild(card);
  });
}

// 每个题目是否保留原图
let _batchImageFlags = {};

function toggleQuestionImage(idx, checked) {
  _batchImageFlags[idx] = checked;
}

function onBatchTypeChange(idx, newType) {
  _batchQuestions[idx].type = newType;
  const card = document.querySelectorAll('.batch-q-card')[idx];
  const optArea = card.querySelector('.batch-options-area');

  if (newType === 'choice') {
    optArea.style.display = 'block';
    if (!optArea.innerHTML.trim()) {
      optArea.innerHTML = ['A', 'B', 'C', 'D'].map(k =>
        `<div class="batch-opt-row">
          <label>${k}. </label>
          <input type="text" class="batch-opt-input" data-idx="${idx}" data-key="${k}" value="">
        </div>`
      ).join('');
    }
    if (!_batchQuestions[idx].options) _batchQuestions[idx].options = { A: '', B: '', C: '', D: '' };
  } else {
    optArea.style.display = 'none';
    _batchQuestions[idx].options = null;
  }
}

/**
 * 从预览界面收集用户修改后的题目数据
 */
function collectBatchQuestions() {
  return _batchQuestions.map((q, i) => {
    const contentEl = document.querySelector(`.batch-q-content[data-idx="${i}"]`);
    const answerEl = document.querySelector(`.batch-q-answer[data-idx="${i}"]`);
    const options = {};

    if (q.type === 'choice') {
      document.querySelectorAll(`.batch-opt-input[data-idx="${i}"]`).forEach(inp => {
        options[inp.dataset.key] = inp.value.trim();
      });
    }

    return {
      type: q.type,
      content: contentEl ? contentEl.value.trim() : q.content,
      options: q.type === 'choice' ? options : null,
      answer: answerEl ? answerEl.value.trim() : q.answer,
      keepImage: _batchImageFlags[i] !== false  // 默认保留原图
    };
  });
}

/**
 * 批量保存所有题目
 */
async function doBatchSaveQuestions() {
  const subjectId = parseInt(document.getElementById('ocr-subject').value);
  if (!subjectId) return showToast('请选择学科');

  const questions = collectBatchQuestions();
  const valid = questions.filter(q => q.content && q.answer && q.answer !== '未知');
  const bad = questions.filter(q => !q.content || !q.answer || q.answer === '未知');

  if (bad.length > 0) {
    const skip = confirm(
      `${bad.length} 道题目缺少内容或答案，是否跳过这些题目，只保存 ${valid.length} 道？`
    );
    if (!skip) return;
  }

  if (valid.length === 0) return showToast('没有可保存的有效题目');

  showToast(`正在保存 ${valid.length} 道题目...`);
  let saved = 0;
  const imgSrc = document.getElementById('ocr-preview-img').src;

  for (const q of valid) {
    try {
      await window.ExamDB.addQuestion({
        subjectId,
        type: q.type,
        content: q.content,
        answer: q.answer,
        explanation: '',
        image: q.keepImage ? (imgSrc || null) : null
      });
      saved++;
    } catch (err) {
      console.error('保存失败:', q.content?.substring(0, 30), err);
    }
  }

  showToast(`成功保存 ${saved} 道题目！`);
  hideDialog('dialog-ocr');
  loadQuestions();
}

/**
 * 启动整页批量 OCR + AI 拆题流程
 */
async function startBatchOCR() {
  const fileInput = document.getElementById('ocr-file-input');
  const file = fileInput.files[0];
  if (!file) return;

  // 显示预览
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('ocr-preview-img');
    preview.src = e.target.result;
    document.getElementById('ocr-single-area').style.display = 'none';
    document.getElementById('ocr-batch-area').style.display = 'block';
    document.getElementById('ocr-preview-area').style.display = 'block';
    document.getElementById('ocr-progress').style.display = 'block';
  };
  reader.readAsDataURL(file);

  // 1. OCR 识别
  try {
    document.getElementById('ocr-progress').querySelector('p').textContent = '正在 OCR 识别中，请稍候...';
    const text = await OCR.recognize(file);
    document.getElementById('ocr-progress').style.display = 'none';
    showToast('OCR 识别完成，正在用 AI 拆分题目...');

    // 2. AI 拆题
    document.getElementById('ai-parse-status').style.display = 'block';
    const questions = await parseQuestionsWithAI(text);
    document.getElementById('ai-parse-status').style.display = 'none';

    // 3. 渲染预览
    renderBatchPreview(questions);
    showToast(`AI 已拆分为 ${questions.length} 道题，请校对后批量保存！`);
  } catch (err) {
    document.getElementById('ocr-progress').style.display = 'none';
    document.getElementById('ai-parse-status').style.display = 'none';
    showToast('识别失败：' + err.message);
  }
}

// 全局函数：显示 OCR 弹窗
function showOCRDialog() {
  // 填充学科下拉
  fillSubjectSelect('ocr-subject');
  // 默认切换到整页批量模式
  document.getElementById('ocr-single-area').style.display = 'none';
  document.getElementById('ocr-batch-area').style.display = 'block';
  document.getElementById('batch-preview-area').style.display = 'none';
  document.getElementById('ocr-preview-area').style.display = 'none';
  document.getElementById('dialog-ocr').style.display = 'flex';
}

function switchOCRMode(mode) {
  const fileInput = document.getElementById('ocr-file-input');
  if (mode === 'single') {
    document.getElementById('ocr-single-area').style.display = 'block';
    document.getElementById('ocr-batch-area').style.display = 'none';
    document.getElementById('batch-preview-area').style.display = 'none';
    document.getElementById('ocr-preview-area').style.display = 'none';
    document.getElementById('ocr-mode-single').classList.add('active');
    document.getElementById('ocr-mode-batch').classList.remove('active');
    fileInput.setAttribute('onchange', 'startOCR()');
  } else {
    document.getElementById('ocr-single-area').style.display = 'none';
    document.getElementById('ocr-batch-area').style.display = 'block';
    document.getElementById('batch-preview-area').style.display = 'none';
    document.getElementById('ocr-preview-area').style.display = 'none';
    document.getElementById('ocr-mode-batch').classList.add('active');
    document.getElementById('ocr-mode-single').classList.remove('active');
    fileInput.setAttribute('onchange', 'startBatchOCR()');
  }
  // 清除文件选择
  fileInput.value = '';
}
