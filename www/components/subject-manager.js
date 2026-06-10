// subject-manager.js - 学科管理组件

class SubjectManager {
  constructor() {
    this.subjects = [];
    this.init();
  }

  // 初始化
  async init() {
    await this.loadSubjects();
    this.bindEvents();
  }

  // 加载学科列表
  async loadSubjects() {
    try {
      this.subjects = await database.getAll('subjects');
      this.renderSubjects();
      this.updateSubjectSelectors();
    } catch (error) {
      console.error('加载学科失败:', error);
      this.showToast('加载学科失败');
    }
  }

  // 渲染学科列表
  renderSubjects() {
    const grid = document.getElementById('subject-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // 渲染每个学科卡片
    this.subjects.forEach(subject => {
      const card = this.createSubjectCard(subject);
      grid.appendChild(card);
    });

    // 添加"添加学科"按钮
    const addCard = this.createAddSubjectCard();
    grid.appendChild(addCard);
  }

  // 创建学科卡片
  createSubjectCard(subject) {
    const card = document.createElement('div');
    card.className = 'subject-card';
    card.dataset.subjectId = subject.id;

    // 获取统计信息
    this.getSubjectStats(subject.id).then(stats => {
      card.innerHTML = `
        <div class="subject-icon">${this.getSubjectIcon(subject.name)}</div>
        <div class="subject-name">${subject.name}</div>
        <div class="subject-stats">
          <span>题目: ${stats.questionCount}</span>
          <span>最近: ${stats.lastScore || '--'}分</span>
        </div>
        <div class="subject-actions">
          <button class="btn-start-exam" data-id="${subject.id}">开始考试</button>
          <button class="btn-import" data-id="${subject.id}">导入题目</button>
          <button class="btn-wrong-book" data-id="${subject.id}">错题本</button>
        </div>
      `;

      // 绑定事件
      card.querySelector('.btn-start-exam').onclick = () => {
        this.startExam(subject.id);
      };

      card.querySelector('.btn-import').onclick = () => {
        this.importQuestions(subject.id);
      };

      card.querySelector('.btn-wrong-book').onclick = () => {
        this.openWrongBook(subject.id);
      };

      // 长按删除
      let pressTimer;
      card.addEventListener('touchstart', () => {
        pressTimer = setTimeout(() => {
          this.deleteSubject(subject.id, subject.name);
        }, 1000);
      });

      card.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
      });

      card.addEventListener('mousedown', () => {
        pressTimer = setTimeout(() => {
          this.deleteSubject(subject.id, subject.name);
        }, 1000);
      });

      card.addEventListener('mouseup', () => {
        clearTimeout(pressTimer);
      });
    });

    return card;
  }

  // 创建添加学科卡片
  createAddSubjectCard() {
    const card = document.createElement('div');
    card.className = 'subject-card add-subject';
    card.innerHTML = `
      <div class="add-icon">+</div>
      <div>添加学科</div>
    `;

    card.onclick = () => {
      this.showAddSubjectDialog();
    };

    return card;
  }

  // 获取学科图标
  getSubjectIcon(name) {
    const icons = {
      '数学': '📐',
      '语文': '📖',
      '英语': '🔤',
      '物理': '⚛️',
      '化学': '🧪',
      '生物': '🧬',
      '历史': '📜',
      '地理': '🌍',
      '政治': '📕',
      '音乐': '🎵',
      '美术': '🎨',
      '体育': '⚽'
    };

    // 模糊匹配
    for (const key of Object.keys(icons)) {
      if (name.includes(key)) {
        return icons[key];
      }
    }

    return '📚'; // 默认图标
  }

  // 获取学科统计信息
  async getSubjectStats(subjectId) {
    try {
      const questions = await database.queryByIndex('questions', 'subjectId', subjectId);
      const examRecords = await database.queryByIndex('exam_records', 'subjectId', subjectId);

      // 获取最近一次考试成绩
      let lastScore = null;
      if (examRecords.length > 0) {
        examRecords.sort((a, b) => b.startTime - a.startTime);
        lastScore = examRecords[0].score;
      }

      return {
        questionCount: questions.length,
        lastScore: lastScore
      };
    } catch (error) {
      console.error('获取统计信息失败:', error);
      return { questionCount: 0, lastScore: null };
    }
  }

  // 显示添加学科对话框
  showAddSubjectDialog() {
    const name = prompt('请输入学科名称:');
    if (name && name.trim()) {
      this.addSubject(name.trim());
    }
  }

  // 添加学科
  async addSubject(name) {
    try {
      const id = await database.add('subjects', {
        name: name,
        icon: this.getSubjectIcon(name),
        questionCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      this.showToast(`学科"${name}"添加成功`);
      await this.loadSubjects();
    } catch (error) {
      console.error('添加学科失败:', error);
      if (error.name === 'ConstraintError') {
        this.showToast('该学科已存在');
      } else {
        this.showToast('添加学科失败');
      }
    }
  }

  // 删除学科
  async deleteSubject(id, name) {
    if (!confirm(`确定要删除学科"${name}"吗？\n\n注意：该学科下的所有题目和考试记录也将被删除！`)) {
      return;
    }

    try {
      // 删除学科
      await database.delete('subjects', id);

      // 删除相关题目
      const questions = await database.queryByIndex('questions', 'subjectId', id);
      for (const question of questions) {
        await database.delete('questions', question.id);
      }

      // 删除相关考试记录
      const examRecords = await database.queryByIndex('exam_records', 'subjectId', id);
      for (const record of examRecords) {
        await database.delete('exam_records', record.id);
      }

      // 删除相关错题
      const wrongQuestions = await database.queryByIndex('wrong_questions', 'subjectId', id);
      for (const wrong of wrongQuestions) {
        await database.delete('wrong_questions', wrong.id);
      }

      this.showToast(`学科"${name}"已删除`);
      await this.loadSubjects();
    } catch (error) {
      console.error('删除学科失败:', error);
      this.showToast('删除学科失败');
    }
  }

  // 开始考试
  startExam(subjectId) {
    // 切换到考试设置页面
    window.app.navigateTo('page-exam-setup');
    
    // 设置选中的学科
    const select = document.getElementById('exam-subject');
    if (select) {
      select.value = subjectId;
    }
  }

  // 导入题目
  importQuestions(subjectId) {
    // 切换到题目导入页面
    window.app.navigateTo('page-import');
    
    // 设置选中的学科
    const select = document.getElementById('select-subject');
    if (select) {
      select.value = subjectId;
    }
  }

  // 打开错题本
  openWrongBook(subjectId) {
    // 切换到错题本页面
    window.app.navigateTo('page-wrong-book');
    
    // 设置筛选
    const select = document.getElementById('filter-subject');
    if (select) {
      select.value = subjectId;
      // 触发筛选
      select.dispatchEvent(new Event('change'));
    }
  }

  // 更新所有学科选择器
  updateSubjectSelectors() {
    const selectors = [
      document.getElementById('select-subject'),
      document.getElementById('exam-subject'),
      document.getElementById('filter-subject')
    ];

    selectors.forEach(select => {
      if (!select) return;

      const currentValue = select.value;
      select.innerHTML = '<option value="">请选择学科</option>';

      this.subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject.id;
        option.textContent = subject.name;
        select.appendChild(option);
      });

      // 恢复之前的选择
      if (currentValue) {
        select.value = currentValue;
      }
    });
  }

  // 绑定事件
  bindEvents() {
    // 添加学科按钮（浮动按钮）
    const addButton = document.getElementById('btn-add-subject');
    if (addButton) {
      addButton.onclick = () => {
        this.showAddSubjectDialog();
      };
    }
  }

  // 显示提示消息
  showToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.remove('hidden');
      
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 3000);
    }
  }
}

// 创建单例实例
const subjectManager = new SubjectManager();

// 导出
window.subjectManager = subjectManager;
