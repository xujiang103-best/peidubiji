/**
 * 主应用逻辑 & SPA 路由
 * 负责视图切换、学科/题目列表渲染、事件绑定
 */

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  initTabNavigation();
  await loadSubjects();
  await loadSettings();
  showView('subjects');
});

// ==================== 视图切换 ====================
function showView(viewName) {
  // 更新 tab 按钮状态
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === viewName);
  });
  // 切换视图
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  // 进入视图时刷新数据
  if (viewName === 'subjects') loadSubjects();
  if (viewName === 'questions') loadQuestions();
  if (viewName === 'wrong') loadWrongQuestions();
  if (viewName === 'settings') loadSettings();
  if (viewName === 'exam') loadExamSetup();
}

function initTabNavigation() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.tab));
  });
}

// ==================== 学科管理 ====================
async function loadSubjects() {
  const subjects = await window.ExamDB.getAllSubjects();
  const grid = document.getElementById('subject-list');
  const empty = document.getElementById('subject-empty');

  // 只移除动态卡片，保留 empty 元素在 DOM 中
  grid.querySelectorAll('.card').forEach(c => c.remove());

  if (subjects.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  for (const sub of subjects) {
    const count = await window.ExamDB.getSubjectQuestionCount(sub.id);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${escapeHtml(sub.name)}</h3>
      <p>${count} 道题目</p>
      <div class="card-actions">
        <button class="btn btn-secondary btn-small" onclick="deleteSubjectHandler(${sub.id},'${escapeAttr(sub.name)}')">删除</button>
      </div>
    `;
    grid.appendChild(card);
  }
}

async function showAddSubjectDialog() {
  document.getElementById('dialog-add-subject').style.display = 'flex';
  document.getElementById('input-subject-name').value = '';
  document.getElementById('input-subject-name').focus();
}

async function doAddSubject() {
  const name = document.getElementById('input-subject-name').value.trim();
  if (!name) return showToast('请输入学科名称');

  try {
    await window.ExamDB.addSubject(name);
    showToast(`学科"${name}"添加成功！`);
    hideDialog('dialog-add-subject');
    await loadSubjects();
  } catch (err) {
    showToast('添加失败：' + err.message);
  }
}

async function deleteSubjectHandler(id, name) {
  if (!confirm(`确定要删除学科"${name}"吗？该学科下的所有题目也会一并删除！`)) return;
  await window.ExamDB.deleteSubject(id);
  showToast('删除成功');
  await loadSubjects();
}

// ==================== 题目管理 ====================
async function loadQuestions() {
  await fillSubjectFilter('question-subject-filter');
  const filterVal = document.getElementById('question-subject-filter').value;
  const subjectId = filterVal ? parseInt(filterVal) : null;

  let questions;
  if (subjectId) {
    questions = await window.ExamDB.getQuestionsBySubject(subjectId);
  } else {
    questions = [];
    const subjects = await window.ExamDB.getAllSubjects();
    for (const s of subjects) {
      const qs = await window.ExamDB.getQuestionsBySubject(s.id);
      questions.push(...qs.map(q => ({ ...q, subjectName: s.name })));
    }
  }

  const list = document.getElementById('question-list');
  const empty = document.getElementById('question-empty');

  // 只移除动态题目条目，保留 empty 元素在 DOM 中
  list.querySelectorAll('.question-item').forEach(el => el.remove());

  if (questions.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  const typeLabels = { choice: '选择题', truefalse: '判断题', fillblank: '填空题' };

  for (const q of questions) {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.innerHTML = `
      <div class="question-content">
        <span class="q-type">${typeLabels[q.type] || q.type}</span>
        <div class="q-text">${escapeHtml(q.content.substring(0, 100))}${q.content.length > 100 ? '...' : ''}</div>
        <div class="q-answer">答案：${escapeHtml(q.answer)}${q.image ? ' 📷' : ''}</div>
      </div>
      <div class="question-actions">
        <button class="btn btn-secondary btn-small" onclick="viewQuestionDetail(${q.id})">查看</button>
        <button class="btn btn-danger btn-small" onclick="deleteQuestionHandler(${q.id})">删除</button>
      </div>
    `;
    list.appendChild(item);
  }
}

async function showAddQuestionDialog() {
  await fillSubjectSelect('input-question-subject');
  document.getElementById('dialog-add-question').style.display = 'flex';
  document.getElementById('input-question-content').value = '';
  document.getElementById('input-answer').value = '';
  document.getElementById('input-question-explanation').value = '';
  document.getElementById('input-option-a').value = '';
  document.getElementById('input-option-b').value = '';
  document.getElementById('input-option-c').value = '';
  document.getElementById('input-option-d').value = '';
  onQuestionTypeChange();
}

function onQuestionTypeChange() {
  const type = document.getElementById('input-question-type').value;
  const choiceOptions = document.getElementById('choice-options');
  const answerArea = document.getElementById('answer-input-area');

  choiceOptions.style.display = type === 'choice' ? 'block' : 'none';

  if (type === 'choice') {
    answerArea.innerHTML = `
      <label>正确答案（A/B/C/D）：</label>
      <select id="input-answer">
        <option value="A">A</option>
        <option value="B">B</option>
        <option value="C">C</option>
        <option value="D">D</option>
      </select>`;
  } else if (type === 'truefalse') {
    answerArea.innerHTML = `
      <label>正确答案：</label>
      <select id="input-answer">
        <option value="正确">正确</option>
        <option value="错误">错误</option>
      </select>`;
  } else {
    answerArea.innerHTML = `<input type="text" id="input-answer" placeholder="请输入正确答案">`;
  }
}

async function doAddQuestion() {
  const subjectId = parseInt(document.getElementById('input-question-subject').value);
  const type = document.getElementById('input-question-type').value;
  const content = document.getElementById('input-question-content').value.trim();
  const answer = document.getElementById('input-answer').value.trim();
  const explanation = document.getElementById('input-question-explanation').value.trim();

  if (!subjectId) return showToast('请选择学科');
  if (!content) return showToast('请输入题目内容');
  if (!answer) return showToast('请输入正确答案');

  let options = null;
  if (type === 'choice') {
    options = {};
    ['A', 'B', 'C', 'D'].forEach(letter => {
      const val = document.getElementById(`input-option-${letter.toLowerCase()}`).value.trim();
      if (val) options[letter] = val;
    });
    if (Object.keys(options).length < 2) return showToast('选择题至少需要2个选项');
  }

  try {
    await window.ExamDB.addQuestion({ subjectId, type, content, options, answer, explanation });
    showToast('题目添加成功！');
    hideDialog('dialog-add-question');
    await loadQuestions();
  } catch (err) {
    showToast('添加失败：' + err.message);
  }
}

async function viewQuestionDetail(id) {
  const q = await window.ExamDB.db.questions.get(id);
  if (!q) return;

  const subject = await window.ExamDB.db.subjects.get(q.subjectId);
  const typeLabels = { choice: '选择题', truefalse: '判断题', fillblank: '填空题' };

  let html = `<p><strong>学科：</strong>${escapeHtml(subject?.name || '')}</p>`;
  html += `<p><strong>题型：</strong>${typeLabels[q.type] || q.type}</p>`;
  html += `<p><strong>题目：</strong><br>${escapeHtml(q.content).replace(/\n/g, '<br>')}</p>`;
  if (q.image) {
    html += `<img class="q-image" src="${q.image}" alt="题目配图" style="max-width:100%;border-radius:8px;margin-bottom:10px;border:1px solid var(--border);">`;
  }

  if (q.type === 'choice' && q.options) {
    html += '<p><strong>选项：</strong><br>';
    Object.entries(JSON.parse(q.options)).forEach(([k, v]) => {
      html += `${k}. ${escapeHtml(v)}<br>`;
    });
    html += '</p>';
  }

  html += `<p><strong>正确答案：</strong>${escapeHtml(q.answer)}</p>`;
  if (q.explanation) {
    html += `<p><strong>解析：</strong><br>${escapeHtml(q.explanation).replace(/\n/g, '<br>')}</p>`;
  }

  document.getElementById('question-detail-content').innerHTML = html;
  document.getElementById('btn-delete-question').onclick = () => {
    hideDialog('dialog-question-detail');
    deleteQuestionHandler(id);
  };
  document.getElementById('dialog-question-detail').style.display = 'flex';
}

async function deleteQuestionHandler(id) {
  if (!confirm('确定要删除这道题目吗？')) return;
  await window.ExamDB.deleteQuestion(id);
  showToast('删除成功');
  await loadQuestions();
}

// ==================== 考试设置 ====================
async function loadExamSetup() {
  await fillSubjectSelect('exam-subject');
  // 更新题目数量上限
  const subjectId = parseInt(document.getElementById('exam-subject').value);
  if (subjectId) {
    const count = await window.ExamDB.getSubjectQuestionCount(subjectId);
    document.getElementById('exam-count').max = count;
    if (document.getElementById('exam-count').value > count) {
      document.getElementById('exam-count').value = count;
    }
  }
}

// ==================== 错题本 ====================
async function loadWrongQuestions() {
  await fillSubjectFilter('wrong-subject-filter');
  const filterVal = document.getElementById('wrong-subject-filter').value;
  const subjectId = filterVal ? parseInt(filterVal) : null;

  const wrongList = await window.ExamDB.getWrongQuestions(subjectId);

  const list = document.getElementById('wrong-list');
  const empty = document.getElementById('wrong-empty');

  // 只移除动态错题条目，保留 empty 元素在 DOM 中
  list.querySelectorAll('.wrong-item').forEach(el => el.remove());

  if (wrongList.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  for (const w of wrongList) {
    const q = w.question;
    if (!q) continue;

    const item = document.createElement('div');
    item.className = 'wrong-item';
    item.innerHTML = `
      <div class="wrong-count">❌ 错 ${w.wrongCount} 次 · ${formatDate(w.lastWrongDate)}</div>
      <div class="q-text" style="margin:6px 0;"><strong>题目：</strong>${escapeHtml(q.content.substring(0, 80))}${q.content.length > 80 ? '...' : ''}</div>
      <div class="q-answer">正确答案：${escapeHtml(q.answer)}</div>
      ${w.memoryAid ? `<div class="memory-aid">${escapeHtml(w.memoryAid).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="question-actions" style="margin-top:8px;">
        ${w.memoryAid ? '' : `<button class="btn btn-primary btn-small" onclick="generateMemoryForWrong(${w.id}, ${q.id})">🧠 生成记忆辅助</button>`}
        <button class="btn btn-danger btn-small" onclick="removeWrongHandler(${w.id})">已掌握</button>
      </div>
    `;
    list.appendChild(item);
  }
}

async function generateMemoryForWrong(wrongId, questionId) {
  // API Key 可以来自前端 localStorage，也可以来自服务器端 .env，不强制要求前端配置

  showToast('正在生成记忆辅助，请稍候...');
  const q = await window.ExamDB.db.questions.get(questionId);
  if (!q) return;

  try {
    const memoryAid = await LLM.generateMnemonics(q.content, q.answer, q.explanation);
    await window.ExamDB.updateMemoryAid(wrongId, memoryAid.trim());
    showToast('记忆辅助生成成功！');
    await loadWrongQuestions();
  } catch (err) {
    console.error('生成记忆辅助失败:', err);
    showToast('生成失败：' + err.message);
  }
}

async function removeWrongHandler(wrongId) {
  if (!confirm('确定要将此题从错题本中移除吗？（已掌握）')) return;
  await window.ExamDB.removeWrongQuestion(wrongId);
  showToast('已从错题本移除');
  await loadWrongQuestions();
}

async function clearAllWrong() {
  if (!confirm('确定要清空所有错题记录吗？此操作不可恢复！')) return;
  await window.ExamDB.db.wrongQuestions.clear();
  showToast('错题本已清空');
  await loadWrongQuestions();
}

// ==================== 设置 ====================
async function loadSettings() {
  // API Key：APK 内置 Key 作为默认值展示，localStorage 可覆盖
  const savedKey = localStorage.getItem('deepseek_api_key') || '';
  const displayKey = savedKey || (window.LLM && window.LLM.BUILTIN_API_KEY) || '';
  document.getElementById('setting-api-key').value = displayKey;
  updateApiStatus(displayKey);

  // 统计
  await loadStatistics();
}

async function saveApiKey() {
  const key = document.getElementById('setting-api-key').value.trim();
  if (key) {
    localStorage.setItem('deepseek_api_key', key);
    showToast('API Key 已保存（仅本机可见）');
  } else {
    clearApiKey();
    return;
  }
  updateApiStatus(key);

  // APK 环境下无需重启服务器；浏览器代理模式才需要
  if (!window.LLM || !window.LLM.isAPK || !window.LLM.isAPK()) {
    showToast('⚠️ 请重启 server.js 使 API Key 生效（Ctrl+C 后重新运行 node server.js）');
  }
}

function clearApiKey() {
  localStorage.removeItem('deepseek_api_key');
  document.getElementById('setting-api-key').value = '';
  updateApiStatus('');
  showToast('API Key 已清除');
}

function updateApiStatus(key) {
  const el = document.getElementById('api-status');
  const isAPK = window.LLM && window.LLM.isAPK && window.LLM.isAPK();
  if (key) {
    el.className = 'api-status ok';
    el.textContent = isAPK ? '✅ API Key 已配置（APK 内置）' : '✅ API Key 已配置';
  } else {
    el.className = 'api-status error';
    el.textContent = '⚠️ 未配置 API Key，记忆辅助功能不可用';
  }
}

async function loadStatistics() {
  const stats = await window.ExamDB.getStatistics();
  const subjectStatsHtml = stats.subjectStats.map(s =>
    `<div class="stat-item"><div class="stat-value">${s.questionCount}</div><div class="stat-label">${escapeHtml(s.name)}</div></div>`
  ).join('');

  document.getElementById('statistics-content').innerHTML = `
    <div class="stat-grid">
      <div class="stat-item"><div class="stat-value">${stats.totalSubjects}</div><div class="stat-label">学科数</div></div>
      <div class="stat-item"><div class="stat-value">${stats.totalQuestions}</div><div class="stat-label">题目数</div></div>
      <div class="stat-item"><div class="stat-value">${stats.totalExams}</div><div class="stat-label">考试次数</div></div>
      <div class="stat-item"><div class="stat-value">${stats.totalWrong}</div><div class="stat-label">错题数</div></div>
    </div>
    ${stats.subjectStats.length > 0 ? '<h4 style="margin-top:16px;">各学科题目数</h4><div class="stat-grid" style="margin-top:8px;">' + subjectStatsHtml + '</div>' : ''}
  `;
}

// ==================== 工具函数 ====================

// 填充学科下拉（无空选项，用于题目添加）
async function fillSubjectSelect(selectId) {
  const subjects = await window.ExamDB.getAllSubjects();
  const sel = document.getElementById(selectId);
  sel.innerHTML = '';
  subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
}

// 填充学科过滤下拉（含"全部"选项）
async function fillSubjectFilter(selectId) {
  const subjects = await window.ExamDB.getAllSubjects();
  const sel = document.getElementById(selectId);
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">全部学科</option>';
  subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  if (currentVal) sel.value = currentVal;
}

function hideDialog(dialogId) {
  document.getElementById(dialogId).style.display = 'none';
}

function showToast(msg, duration = 2000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 考试学科下拉变化时更新题目数量上限
document.addEventListener('change', (e) => {
  if (e.target.id === 'exam-subject') {
    loadExamSetup();
  }
});
