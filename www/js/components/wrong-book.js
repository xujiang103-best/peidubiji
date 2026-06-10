// wrong-book.js - 错题本组件

class WrongBook {
  constructor() {
    this.wrongQuestions = [];
    this.currentFilter = '';
    this.init();
  }

  // 初始化
  init() {
    this.bindEvents();
  }

  // 绑定事件
  bindEvents() {
    // 学科筛选
    const filterSelect = document.getElementById('filter-subject');
    if (filterSelect) {
      filterSelect.onchange = (e) => {
        this.currentFilter = e.target.value;
        this.loadWrongQuestions(this.currentFilter);
      };
    }
  }

  // 加载错题列表
  async loadWrongQuestions(subjectId = null) {
    try {
      showLoading('正在加载错题...');

      let wrongQuestions;

      if (subjectId) {
        wrongQuestions = await database.queryByIndex(
          'wrong_questions',
          'subjectId',
          parseInt(subjectId)
        );
      } else {
        wrongQuestions = await database.getAll('wrong_questions');
      }

      // 获取题目详情
      for (const wrong of wrongQuestions) {
        wrong.questionDetail = await database.get('questions', wrong.questionId);
        wrong.subjectName = await this.getSubjectName(wrong.subjectId);
      }

      // 按最近错误时间排序
      wrongQuestions.sort((a, b) => b.lastWrongAt - a.lastWrongAt);

      this.wrongQuestions = wrongQuestions;

      hideLoading();

      // 渲染列表
      this.renderWrongQuestions();
    } catch (error) {
      hideLoading();
      console.error('加载错题失败:', error);
      showToast('加载错题失败');
    }
  }

  // 获取学科名称
  async getSubjectName(subjectId) {
    try {
      const subject = await database.get('subjects', subjectId);
      return subject ? subject.name : '未知学科';
    } catch (error) {
      return '未知学科';
    }
  }

  // 渲染错题列表
  renderWrongQuestions() {
    const container = document.getElementById('wrong-questions-list');
    if (!container) return;

    container.innerHTML = '';

    if (this.wrongQuestions.length === 0) {
      container.innerHTML = '<div class="empty-tip"><p>暂无错题</p><p>加油！继续保持！</p></div>';
      return;
    }

    this.wrongQuestions.forEach(wrong => {
      const card = this.createWrongQuestionCard(wrong);
      container.appendChild(card);
    });
  }

  // 创建错题卡片
  createWrongQuestionCard(wrong) {
    const card = document.createElement('div');
    card.className = 'wrong-question-card';

    const question = wrong.questionDetail;

    if (!question) {
      card.innerHTML = '<p>题目已删除</p>';
      return card;
    }

    card.innerHTML = `
      <div class="question-header">
        <span class="question-subject">${wrong.subjectName}</span>
        <span class="wrong-count">错误 ${wrong.wrongCount} 次</span>
        <span class="last-wrong-time">最近: ${utils.formatDate(wrong.lastWrongAt)}</span>
      </div>
      
      <div class="question-content">
        ${this.escapeHtml(question.content)}
      </div>

      ${question.options && question.options.length > 0 ? `
        <div class="question-options">
          ${question.options.map((opt, i) => `
            <div class="option ${String.fromCharCode(65 + i) === question.answer ? 'correct' : ''} ${String.fromCharCode(65 + i) === wrong.userAnswer ? 'wrong' : ''}">
              ${opt}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="user-answer">
        <strong>你的答案:</strong> <span class="wrong-answer">${wrong.userAnswer || '未作答'}</span>
        <strong>正确答案:</strong> <span class="correct-answer">${question.answer}</span>
      </div>

      ${question.explanation ? `
        <div class="question-explanation">
          <strong>解析:</strong> ${this.escapeHtml(question.explanation)}
        </div>
      ` : ''}

      <div class="memory-aid-section">
        <h4>记忆辅助</h4>
        ${wrong.memoryAid ? `
          <div class="aid-content">${this.formatAidContent(wrong.memoryAid, wrong.aidType)}</div>
          <button class="btn-regenerate-aid" data-id="${wrong.id}">重新生成</button>
        ` : `
          <div class="aid-placeholder">暂无记忆辅助</div>
          <button class="btn-generate-aid" data-id="${wrong.id}">生成记忆辅助</button>
        `}
      </div>

      <div class="card-actions">
        <button class="btn-mark-reviewed ${wrong.reviewed ? 'reviewed' : ''}" data-id="${wrong.id}">
          ${wrong.reviewed ? '已复习' : '标记为已复习'}
        </button>
        <button class="btn-delete-wrong" data-id="${wrong.id}">删除</button>
      </div>
    `;

    // 绑定事件
    this.bindCardEvents(card, wrong);

    return card;
  }

  // 绑定卡片事件
  bindCardEvents(card, wrong) {
    // 生成记忆辅助
    const generateBtn = card.querySelector('.btn-generate-aid');
    if (generateBtn) {
      generateBtn.onclick = () => {
        this.generateMemoryAid(wrong);
      };
    }

    // 重新生成
    const regenerateBtn = card.querySelector('.btn-regenerate-aid');
    if (regenerateBtn) {
      regenerateBtn.onclick = () => {
        this.generateMemoryAid(wrong);
      };
    }

    // 标记为已复习
    const reviewBtn = card.querySelector('.btn-mark-reviewed');
    if (reviewBtn) {
      reviewBtn.onclick = () => {
        this.markAsReviewed(wrong.id);
      };
    }

    // 删除
    const deleteBtn = card.querySelector('.btn-delete-wrong');
    if (deleteBtn) {
      deleteBtn.onclick = () => {
        this.deleteWrongQuestion(wrong.id);
      };
    }
  }

  // 生成记忆辅助
  async generateMemoryAid(wrong) {
    const question = wrong.questionDetail;

    if (!question) {
      showToast('题目不存在');
      return;
    }

    try {
      showLoading('AI 正在生成记忆辅助...');

      // 调用 AI 生成顺口溜
      const rhyme = await aiHelper.generateRhyme(question);

      // 保存到 IndexedDB
      await database.update('wrong_questions', wrong.id, {
        memoryAid: rhyme,
        aidType: 'rhyme'
      });

      hideLoading();

      showToast('记忆辅助生成成功！');

      // 刷新列表
      await this.loadWrongQuestions(this.currentFilter);
    } catch (error) {
      hideLoading();
      console.error('生成记忆辅助失败:', error);
      showToast('生成失败: ' + error.message);
    }
  }

  // 标记为已复习
  async markAsReviewed(wrongQuestionId) {
    try {
      await database.update('wrong_questions', wrongQuestionId, {
        reviewed: true,
        reviewedAt: Date.now()
      });

      showToast('已标记为已复习');

      // 刷新列表
      await this.loadWrongQuestions(this.currentFilter);
    } catch (error) {
      console.error('标记失败:', error);
      showToast('标记失败');
    }
  }

  // 删除错题记录
  async deleteWrongQuestion(wrongQuestionId) {
    if (!confirm('确定要删除这条错题记录吗？')) {
      return;
    }

    try {
      await database.delete('wrong_questions', wrongQuestionId);

      showToast('删除成功');

      // 刷新列表
      await this.loadWrongQuestions(this.currentFilter);
    } catch (error) {
      console.error('删除失败:', error);
      showToast('删除失败');
    }
  }

  // 格式化辅助内容
  formatAidContent(content, aidType) {
    if (!content) return '';

    let icon = '';
    switch (aidType) {
      case 'rhyme':
        icon = '🎵';
        break;
      case 'image':
        icon = '🖼️';
        break;
      case 'story':
        icon = '📖';
        break;
      default:
        icon = '💡';
    }

    return `<span class="aid-icon">${icon}</span> ${content.replace(/\n/g, '<br>')}`;
  }

  // HTML 转义
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 创建单例实例
const wrongBook = new WrongBook();

// 导出
window.wrongBook = wrongBook;
