// exam-player.js - 考试核心功能

class ExamPlayer {
  constructor() {
    this.currentExam = null;
    this.currentQuestionIndex = 0;
    this.timer = null;
    this.remainingTime = 0;
    this.isPaused = false;
    this.init();
  }

  // 初始化
  init() {
    this.bindEvents();
  }

  // 绑定事件
  bindEvents() {
    // 开始考试按钮
    const startBtn = document.getElementById('btn-start-exam');
    if (startBtn) {
      startBtn.onclick = () => this.startExam();
    }

    // 上一题按钮
    const prevBtn = document.getElementById('btn-prev');
    if (prevBtn) {
      prevBtn.onclick = () => this.prevQuestion();
    }

    // 下一题按钮
    const nextBtn = document.getElementById('btn-next');
    if (nextBtn) {
      nextBtn.onclick = () => this.nextQuestion();
    }

    // 交卷按钮
    const submitBtn = document.getElementById('btn-submit-exam');
    if (submitBtn) {
      submitBtn.onclick = () => this.confirmSubmit();
    }

    // 查看错题按钮
    const reviewBtn = document.getElementById('btn-review-wrong');
    if (reviewBtn) {
      reviewBtn.onclick = () => this.reviewWrongQuestions();
    }

    // 返回首页按钮
    const backHomeBtn = document.getElementById('btn-back-home');
    if (backHomeBtn) {
      backHomeBtn.onclick = () => {
        window.app.navigateTo('page-home');
      };
    }
  }

  // 开始考试
  async startExam() {
    const subjectId = document.getElementById('exam-subject')?.value;
    const questionCount = parseInt(document.getElementById('exam-question-count')?.value) || 50;
    const duration = parseInt(document.getElementById('exam-duration')?.value) || 60;

    // 获取选中的题目类型
    const typeCheckboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked');
    const types = Array.from(typeCheckboxes).map(cb => cb.value);

    if (!subjectId) {
      showToast('请选择学科');
      return;
    }

    if (types.length === 0) {
      showToast('请至少选择一种题目类型');
      return;
    }

    try {
      showLoading('正在准备考试...');

      // 随机选题
      const questions = await this.generateRandomQuestions(subjectId, questionCount, types);

      if (questions.length === 0) {
        hideLoading();
        showToast('该学科没有足够的题目，请先导入题目');
        return;
      }

      // 创建考试记录
      this.currentExam = {
        subjectId: parseInt(subjectId),
        startTime: Date.now(),
        endTime: null,
        duration: duration * 60, // 转换为秒
        totalQuestions: questions.length,
        questions: questions,
        answers: {},
        status: 'ongoing'
      };

      // 保存到 IndexedDB
      const examId = await database.add('exam_records', this.currentExam);

      hideLoading();

      // 开始倒计时
      this.startTimer(duration * 60);

      // 显示第一题
      this.currentQuestionIndex = 0;
      this.showQuestion(this.currentQuestionIndex);

      // 切换到考试界面
      window.app.navigateTo('page-exam-playing');

      showToast(`考试开始！共 ${questions.length} 道题`);
    } catch (error) {
      hideLoading();
      console.error('开始考试失败:', error);
      showToast('开始考试失败: ' + error.message);
    }
  }

  // 随机生成题目
  async generateRandomQuestions(subjectId, count, types) {
    try {
      // 获取该学科的所有题目
      const allQuestions = await database.queryByIndex('questions', 'subjectId', parseInt(subjectId));

      // 按类型筛选
      const filtered = allQuestions.filter(q => types.includes(q.type));

      if (filtered.length === 0) {
        return [];
      }

      // 打乱顺序并选择指定数量
      const shuffled = utils.shuffleArray(filtered);
      return shuffled.slice(0, Math.min(count, shuffled.length));
    } catch (error) {
      console.error('生成随机题目失败:', error);
      throw error;
    }
  }

  // 显示题目
  showQuestion(index) {
    if (!this.currentExam || index < 0 || index >= this.currentExam.questions.length) {
      return;
    }

    this.currentQuestionIndex = index;
    const question = this.currentExam.questions[index];

    // 更新进度显示
    document.getElementById('current-question').textContent = index + 1;
    document.getElementById('total-questions').textContent = this.currentExam.questions.length;

    // 显示题目内容
    const questionContent = document.getElementById('question-content');
    if (questionContent) {
      questionContent.innerHTML = `
        <div class="question-number">第 ${index + 1} 题</div>
        <div class="question-text">${this.escapeHtml(question.content)}</div>
      `;
    }

    // 显示选项
    const questionOptions = document.getElementById('question-options');
    if (questionOptions) {
      questionOptions.innerHTML = '';

      if (question.type === 'choice' || question.type === 'true-false') {
        // 选择题和判断题
        question.options?.forEach((option, i) => {
          const button = document.createElement('button');
          button.className = 'option-button';
          button.textContent = option;
          button.dataset.value = String.fromCharCode(65 + i); // A, B, C, D

          // 检查是否已作答
          const savedAnswer = this.currentExam.answers[question.id];
          if (savedAnswer === button.dataset.value) {
            button.classList.add('selected');
          }

          button.onclick = () => this.selectAnswer(question.id, button.dataset.value);

          questionOptions.appendChild(button);
        });
      } else if (question.type === 'fill-blank') {
        // 填空题
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fill-blank-input';
        input.placeholder = '请输入答案';
        input.value = this.currentExam.answers[question.id] || '';
        input.oninput = (e) => this.selectAnswer(question.id, e.target.value);

        questionOptions.appendChild(input);
      }
    }

    // 更新题目导航器
    this.updateQuestionNavigator();

    // 更新按钮状态
    this.updateNavigationButtons();
  }

  // 选择答案
  async selectAnswer(questionId, answer) {
    if (!this.currentExam) return;

    // 保存答案
    this.currentExam.answers[questionId] = answer;

    // 更新 UI
    if (event?.target?.classList) {
      // 移除所有选项的选中状态
      document.querySelectorAll('.option-button').forEach(btn => {
        btn.classList.remove('selected');
      });

      // 添加当前选项的选中状态
      event.target.classList.add('selected');
    }

    // 自动保存到 IndexedDB
    try {
      await database.update('exam_records', this.currentExam.id, {
        answers: this.currentExam.answers
      });
    } catch (error) {
      console.error('保存答案失败:', error);
    }

    // 延迟跳转到下一题（选择题）
    if (event?.target?.classList?.contains('option-button')) {
      setTimeout(() => {
        if (this.currentQuestionIndex < this.currentExam.questions.length - 1) {
          this.nextQuestion();
        }
      }, 500);
    }
  }

  // 上一题
  prevQuestion() {
    if (this.currentQuestionIndex > 0) {
      this.showQuestion(this.currentQuestionIndex - 1);
    }
  }

  // 下一题
  nextQuestion() {
    if (this.currentQuestionIndex < this.currentExam.questions.length - 1) {
      this.showQuestion(this.currentQuestionIndex + 1);
    }
  }

  // 更新导航按钮状态
  updateNavigationButtons() {
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');

    if (prevBtn) {
      prevBtn.disabled = this.currentQuestionIndex === 0;
    }

    if (nextBtn) {
      nextBtn.disabled = this.currentQuestionIndex === this.currentExam.questions.length - 1;
    }
  }

  // 更新题目导航器
  updateQuestionNavigator() {
    const navigator = document.getElementById('question-navigator');
    if (!navigator || !this.currentExam) return;

    navigator.innerHTML = '';

    this.currentExam.questions.forEach((question, index) => {
      const btn = document.createElement('button');
      btn.className = 'nav-button';
      btn.textContent = index + 1;

      // 标记已作答的题目
      if (this.currentExam.answers[question.id]) {
        btn.classList.add('answered');
      }

      // 标记当前题目
      if (index === this.currentQuestionIndex) {
        btn.classList.add('current');
      }

      btn.onclick = () => this.showQuestion(index);

      navigator.appendChild(btn);
    });
  }

  // 开始倒计时
  startTimer(durationInSeconds) {
    this.remainingTime = durationInSeconds;
    this.isPaused = false;

    // 更新倒计时显示
    this.updateTimerDisplay();

    this.timer = setInterval(() => {
      if (!this.isPaused) {
        this.remainingTime--;

        this.updateTimerDisplay();

        // 时间到
        if (this.remainingTime <= 0) {
          this.submitExam();
        }
      }
    }, 1000);
  }

  // 更新倒计时显示
  updateTimerDisplay() {
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) {
      timerDisplay.textContent = utils.formatTime(this.remainingTime);
    }
  }

  // 暂停/继续倒计时
  togglePause() {
    this.isPaused = !this.isPaused;
  }

  // 确认交卷
  confirmSubmit() {
    if (!confirm('确定要交卷吗？')) {
      return;
    }

    this.submitExam();
  }

  // 提交考试
  async submitExam() {
    if (!this.currentExam) return;

    // 停止倒计时
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    try {
      showLoading('正在批改...');

      // 批改试卷
      const result = await this.gradeExam();

      // 更新考试记录
      this.currentExam.endTime = Date.now();
      this.currentExam.status = 'completed';
      this.currentExam.score = result.score;
      this.currentExam.correctCount = result.correctCount;
      this.currentExam.wrongCount = result.wrongCount;

      await database.update('exam_records', this.currentExam.id, this.currentExam);

      // 记录错题
      await this.recordWrongQuestions(result.wrongQuestions);

      hideLoading();

      // 显示结果
      this.showResult(result);

      // 切换到结果页面
      window.app.navigateTo('page-exam-result');
    } catch (error) {
      hideLoading();
      console.error('提交考试失败:', error);
      showToast('提交考试失败: ' + error.message);
    }
  }

  // 批改试卷
  async gradeExam() {
    if (!this.currentExam) return null;

    let correctCount = 0;
    let wrongCount = 0;
    const wrongQuestions = [];

    for (const question of this.currentExam.questions) {
      const userAnswer = this.currentExam.answers[question.id];
      const correctAnswer = question.answer;

      if (userAnswer === correctAnswer) {
        correctCount++;
      } else {
        wrongCount++;
        wrongQuestions.push({
          question: question,
          userAnswer: userAnswer,
          correctAnswer: correctAnswer
        });
      }
    }

    const score = Math.round((correctCount / this.currentExam.questions.length) * 100);

    return {
      score: score,
      correctCount: correctCount,
      wrongCount: wrongCount,
      wrongQuestions: wrongQuestions
    };
  }

  // 记录错题
  async recordWrongQuestions(wrongQuestions) {
    for (const item of wrongQuestions) {
      try {
        // 检查是否已有记录
        const existing = await database.queryOneByIndex('wrong_questions', 'questionId', item.question.id);

        if (existing) {
          // 更新错误次数
          await database.update('wrong_questions', existing.id, {
            wrongCount: existing.wrongCount + 1,
            lastWrongAt: Date.now(),
            userAnswer: item.userAnswer
          });
        } else {
          // 创建新记录
          await database.add('wrong_questions', {
            questionId: item.question.id,
            subjectId: this.currentExam.subjectId,
            examRecordId: this.currentExam.id,
            wrongCount: 1,
            lastWrongAt: Date.now(),
            userAnswer: item.userAnswer,
            memoryAid: '',
            aidType: '',
            reviewed: false,
            reviewedAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        }
      } catch (error) {
        console.error('记录错题失败:', error);
      }
    }
  }

  // 显示考试结果
  showResult(result) {
    const scoreEl = document.getElementById('result-score');
    const correctEl = document.getElementById('result-correct');
    const wrongEl = document.getElementById('result-wrong');
    const timeEl = document.getElementById('result-time');

    if (scoreEl) scoreEl.textContent = result.score;
    if (correctEl) correctEl.textContent = result.correctCount;
    if (wrongEl) wrongEl.textContent = result.wrongCount;
    if (timeEl) {
      const timeUsed = this.currentExam.duration - this.remainingTime;
      timeEl.textContent = utils.formatTime(timeUsed);
    }
  }

  // 查看错题
  reviewWrongQuestions() {
    // 切换到错题本页面
    window.app.navigateTo('page-wrong-book');

    // 筛选当前学科的错题
    const filterSelect = document.getElementById('filter-subject');
    if (filterSelect) {
      filterSelect.value = this.currentExam.subjectId;
      filterSelect.dispatchEvent(new Event('change'));
    }
  }

  // HTML 转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 创建单例实例
const examPlayer = new ExamPlayer();

// 导出
window.examPlayer = examPlayer;
