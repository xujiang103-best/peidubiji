/**
 * 考试模块 - 随机组卷、答题、批改、计时
 */

const Exam = {
  currentQuestions: [],  // 当前考试题目
  currentIndex: 0,       // 当前题号
  userAnswers: [],        // 用户答案数组
  timerInterval: null,    // 计时器
  secondsElapsed: 0,      // 已用秒数
  examConfig: null,       // 考试配置

  /**
   * 开始考试
   */
  async start(subjectId, count, timeLimitMinutes) {
    const questions = await window.ExamDB.getRandomQuestions(subjectId, count);
    if (questions.length === 0) {
      showToast('该学科还没有题目，请先添加题目！');
      return;
    }

    this.currentQuestions = questions;
    this.currentIndex = 0;
    this.userAnswers = new Array(questions.length).fill(null);
    this.examConfig = { subjectId, count: questions.length, timeLimitMinutes };
    this.secondsElapsed = 0;

    // 切换界面
    document.getElementById('exam-setup').style.display = 'none';
    document.getElementById('exam-result').style.display = 'none';
    document.getElementById('exam-playing').style.display = 'block';

    // 启动计时器
    if (timeLimitMinutes > 0) {
      this.startTimer(timeLimitMinutes);
    } else {
      document.getElementById('exam-timer').textContent = '⏱️ 不限时';
      this.timerInterval = setInterval(() => {
        this.secondsElapsed++;
        const m = Math.floor(this.secondsElapsed / 60);
        const s = this.secondsElapsed % 60;
        document.getElementById('exam-timer').textContent =
          `⏱️ 已用 ${m}分${s}秒`;
      }, 1000);
    }

    this.showQuestion(0);
  },

  /**
   * 启动倒计时
   */
  startTimer(timeLimitMinutes) {
    const totalSeconds = timeLimitMinutes * 60;
    this.secondsElapsed = 0;

    const updateDisplay = () => {
      const remaining = totalSeconds - this.secondsElapsed;
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      const el = document.getElementById('exam-timer');
      el.textContent = `⏱️ ${m}分${s}秒`;
      if (remaining <= 60) el.style.color = 'var(--danger)';
    };

    updateDisplay();
    this.timerInterval = setInterval(() => {
      this.secondsElapsed++;
      updateDisplay();
      if (this.secondsElapsed >= totalSeconds) {
        clearInterval(this.timerInterval);
        showToast('时间到！自动提交');
        this.submit();
      }
    }, 1000);
  },

  /**
   * 显示第 N 题
   */
  showQuestion(index) {
    if (index < 0 || index >= this.currentQuestions.length) return;

    this.currentIndex = index;
    const q = this.currentQuestions[index];
    const area = document.getElementById('exam-question-area');

    // 更新进度
    document.getElementById('exam-progress').textContent =
      `第 ${index + 1} 题 / 共 ${this.currentQuestions.length} 题`;

    // 渲染题目
    let html = `<div class="q-number">第 ${index + 1} 题（${this.getTypeLabel(q.type)}）</div>`;
    html += `<div class="q-content">${this.escapeHtml(q.content)}</div>`;

    // 题目图片
    if (q.image) {
      html += `<img class="q-image" src="${q.image}" alt="题目图片">`;
    }

    // 根据题型渲染答题区域
    if (q.type === 'choice') {
      html += this.renderChoice(q);
    } else if (q.type === 'truefalse') {
      html += this.renderTrueFalse(q);
    } else if (q.type === 'fillblank') {
      html += this.renderFillBlank(q);
    }

    // 已答显示正确答案（提交后）
    if (this.userAnswers[index] !== null && this.examConfig.submitted) {
      const isCorrect = this.checkAnswer(q, this.userAnswers[index]);
      html += `<div style="margin-top:16px;padding:12px;background:${isCorrect ? '#F6FFED' : '#FFF2F0'};border-radius:8px;">`;
      html += `<strong>${isCorrect ? '✅ 回答正确！' : '❌ 回答错误'}</strong><br>`;
      html += `正确答案：${this.escapeHtml(q.answer)}<br>`;
      if (q.explanation) {
        html += `解析：${this.escapeHtml(q.explanation)}`;
      }
      html += `</div>`;
    }

    area.innerHTML = html;

    // 恢复已选答案
    if (this.userAnswers[index] !== null && !this.examConfig.submitted) {
      this.restoreAnswer(q, index);
    }

    // 更新按钮状态
    document.getElementById('btn-prev').disabled = index === 0;
    document.getElementById('btn-next').style.display =
      index === this.currentQuestions.length - 1 ? 'none' : 'inline-flex';
    document.getElementById('btn-submit-exam').style.display =
      index === this.currentQuestions.length - 1 ? 'inline-flex' : 'none';
  },

  /**
   * 渲染选择题
   */
  renderChoice(q) {
    const options = q.options || {};
    const letters = ['A', 'B', 'C', 'D'];
    let html = '<div class="choice-options">';
    letters.forEach(letter => {
      if (options[letter]) {
        html += `<div class="choice-option" data-letter="${letter}" onclick="Exam.selectChoice('${letter}')">`;
        html += `<span class="option-label">${letter}</span>`;
        html += `<span>${this.escapeHtml(options[letter])}</span>`;
        html += `</div>`;
      }
    });
    html += '</div>';
    return html;
  },

  /**
   * 渲染判断题
   */
  renderTrueFalse(q) {
    let html = '<div class="truefalse-options">';
    ['正确', '错误'].forEach(val => {
      html += `<button class="truefalse-btn" data-value="${val}" onclick="Exam.selectTrueFalse('${val}')">${val}</button>`;
    });
    html += '</div>';
    return html;
  },

  /**
   * 渲染填空题
   */
  renderFillBlank(q) {
    return `<input class="fillblank-input" id="fillblank-input"
                 placeholder="请输入答案..."
                 oninput="Exam.onFillBlankInput(this.value)">`;
  },

  /**
   * 选择选择题答案
   */
  selectChoice(letter) {
    if (this.examConfig.submitted) return;
    const q = this.currentQuestions[this.currentIndex];
    this.userAnswers[this.currentIndex] = letter;

    // 更新 UI
    document.querySelectorAll('.choice-option').forEach(el => {
      el.classList.toggle('selected', el.dataset.letter === letter);
    });
  },

  /**
   * 选择判断题答案
   */
  selectTrueFalse(val) {
    if (this.examConfig.submitted) return;
    this.userAnswers[this.currentIndex] = val;
    document.querySelectorAll('.truefalse-btn').forEach(el => {
      el.classList.toggle('selected', el.dataset.value === val);
    });
  },

  /**
   * 填空题输入
   */
  onFillBlankInput(val) {
    if (this.examConfig.submitted) return;
    this.userAnswers[this.currentIndex] = val.trim();
  },

  /**
   * 恢复已选答案
   */
  restoreAnswer(q, index) {
    const answer = this.userAnswers[index];
    if (q.type === 'choice') {
      document.querySelectorAll('.choice-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.letter === answer);
      });
    } else if (q.type === 'truefalse') {
      document.querySelectorAll('.truefalse-btn').forEach(el => {
        el.classList.toggle('selected', el.dataset.value === answer);
      });
    } else if (q.type === 'fillblank') {
      document.getElementById('fillblank-input').value = answer || '';
    }
  },

  /**
   * 上一题
   */
  prev() {
    if (this.currentIndex > 0) this.showQuestion(this.currentIndex - 1);
  },

  /**
   * 下一题
   */
  next() {
    if (this.currentIndex < this.currentQuestions.length - 1) {
      this.showQuestion(this.currentIndex + 1);
    }
  },

  /**
   * 提交考试
   */
  async submit() {
    clearInterval(this.timerInterval);

    // 检查未答题
    const unanswered = this.userAnswers.filter(a => a === null || a === '').length;
    if (unanswered > 0 && !this.examConfig.submitted) {
      if (!confirm(`还有 ${unanswered} 题未答，确定要提交吗？`)) return;
    }

    this.examConfig.submitted = true;
    const subjectId = this.examConfig.subjectId;

    // 批改
    let score = 0;
    const wrongIds = [];

    for (let i = 0; i < this.currentQuestions.length; i++) {
      const q = this.currentQuestions[i];
      const userAnswer = this.userAnswers[i];
      const isCorrect = this.checkAnswer(q, userAnswer);
      if (isCorrect) {
        score++;
      } else {
        wrongIds.push(q.id);
        // 记录错题
        await window.ExamDB.addWrongQuestion(q.id);
      }
    }

    // 保存考试记录
    await window.ExamDB.saveExamRecord({
      subjectId,
      questions: this.currentQuestions.map(q => q.id),
      answers: this.userAnswers,
      score,
      totalQuestions: this.currentQuestions.length
    });

    // 显示结果
    this.showResult(score, wrongIds);

    // 为错题生成记忆辅助
    if (wrongIds.length > 0) {
      this.generateMemoryAids(wrongIds);
    }
  },

  /**
   * 检查答案是否正确
   */
  checkAnswer(question, userAnswer) {
    if (!userAnswer) return false;
    const correct = question.answer.trim().toLowerCase();
    const user = userAnswer.trim().toLowerCase();
    return correct === user;
  },

  /**
   * 显示考试结果
   */
  showResult(score, wrongIds) {
    document.getElementById('exam-playing').style.display = 'none';
    document.getElementById('exam-result').style.display = 'block';

    const total = this.currentQuestions.length;
    const pct = Math.round(score / total * 100);
    const color = pct >= 90 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';

    document.getElementById('result-card').innerHTML = `
      <div class="result-score" style="color:${color}">${pct}分</div>
      <div class="result-detail">答对 <strong>${score}</strong> 题 / 共 <strong>${total}</strong> 题</div>
      <div class="result-detail">用时：${Math.floor(this.secondsElapsed / 60)}分${this.secondsElapsed % 60}秒</div>
      ${wrongIds.length > 0 ? `<div class="result-detail" style="color:var(--danger);">❌ 错题 ${wrongIds.length} 道，已加入错题本</div>` : '<div class="result-detail" style="color:var(--success);">🎉 全部正确！</div>'}
    `;
  },

  /**
   * 为错题生成记忆辅助
   */
  async generateMemoryAids(wrongIds) {
    const apiKey = localStorage.getItem('deepseek_api_key');
    if (!apiKey) return; // 未配置 API，跳过

    showToast('正在为错题生成记忆辅助，请稍候...');

    for (const qId of wrongIds) {
      try {
        const q = await window.ExamDB.db.questions.get(qId);
        if (!q) continue;

        const memoryAid = await LLM.generateMnemonics(
          q.content,
          q.answer,
          q.explanation
        );

        // 找到错题记录并更新
        const wrong = await window.ExamDB.db.wrongQuestions
          .where({ questionId: qId })
          .first();
        if (wrong) {
          await window.ExamDB.updateMemoryAid(wrong.id, memoryAid.trim());
        }
      } catch (err) {
        console.warn('生成记忆辅助失败：', err.message);
      }
    }

    showToast('记忆辅助生成完成！可前往错题本查看。');
  },

  /**
   * 退出考试
   */
  exit() {
    clearInterval(this.timerInterval);
    document.getElementById('exam-playing').style.display = 'none';
    document.getElementById('exam-result').style.display = 'none';
    document.getElementById('exam-setup').style.display = 'block';
    this.examConfig = null;
  },

  /**
   * 获取题型标签
   */
  getTypeLabel(type) {
    return { choice: '选择题', truefalse: '判断题', fillblank: '填空题' }[type] || type;
  },

  /**
   * HTML 转义
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// 全局函数供 HTML onclick 调用
function startExam() {
  const subjectId = parseInt(document.getElementById('exam-subject').value);
  const count = parseInt(document.getElementById('exam-count').value) || 10;
  const time = parseInt(document.getElementById('exam-time').value) || 0;
  if (!subjectId) return showToast('请选择学科');
  Exam.start(subjectId, count, time);
}

function prevQuestion() { Exam.prev(); }
function nextQuestion() { Exam.next(); }
function submitExam() { Exam.submit(); }
function confirmExitExam() {
  if (confirm('确定要退出考试吗？当前进度将丢失。')) Exam.exit();
}
function showExamReview() {
  // 显示错题解析（切换到错题本视图）
  showView('wrong');
}
