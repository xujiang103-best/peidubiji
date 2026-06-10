// question-importer.js - 题目导入组件

class QuestionImporter {
  constructor() {
    this.images = [];
    this.recognizedQuestions = [];
    this.currentSubjectId = null;
    this.init();
  }

  // 初始化
  init() {
    this.bindEvents();
  }

  // 绑定事件
  bindEvents() {
    // 文件上传
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.onchange = (e) => {
        this.handleFileSelect(e.target.files);
      };
    }

    // 上传区域点击事件
    const uploadArea = document.getElementById('upload-area');
    if (uploadArea) {
      uploadArea.onclick = () => {
        fileInput?.click();
      };

      // 拖拽上传
      uploadArea.ondragover = (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
      };

      uploadArea.ondragleave = () => {
        uploadArea.classList.remove('drag-over');
      };

      uploadArea.ondrop = (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        this.handleFileSelect(e.dataTransfer.files);
      };
    }

    // 开始识别按钮
    const recognizeBtn = document.getElementById('btn-recognize');
    if (recognizeBtn) {
      recognizeBtn.onclick = () => {
        this.startRecognition();
      };
    }

    // 保存全部按钮
    const saveBtn = document.getElementById('btn-save-all');
    if (saveBtn) {
      saveBtn.onclick = () => {
        this.saveAll();
      };
    }

    // 学科选择
    const subjectSelect = document.getElementById('select-subject');
    if (subjectSelect) {
      subjectSelect.onchange = (e) => {
        this.currentSubjectId = e.target.value;
      };
    }
  }

  // 处理文件选择
  handleFileSelect(files) {
    if (!files || files.length === 0) return;

    // 检查文件类型
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp'];
    const invalidFiles = [];

    for (const file of files) {
      if (!validTypes.includes(file.type)) {
        invalidFiles.push(file.name);
      }
    }

    if (invalidFiles.length > 0) {
      showToast(`以下文件格式不支持: ${invalidFiles.join(', ')}`);
      return;
    }

    // 添加到图片列表
    this.images = Array.from(files);
    
    // 显示预览
    this.showImagePreview();

    showToast(`已添加 ${this.images.length} 张图片`);
  }

  // 显示图片预览
  showImagePreview() {
    const container = document.getElementById('image-preview');
    if (!container) return;

    container.innerHTML = '';

    this.images.forEach((file, index) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.innerHTML = `
          <img src="${e.target.result}" alt="题目图片 ${index + 1}" class="preview-thumbnail">
          <button class="btn-remove-image" data-index="${index}">×</button>
        `;

        // 删除按钮
        div.querySelector('.btn-remove-image').onclick = (e) => {
          e.stopPropagation();
          this.removeImage(index);
        };

        container.appendChild(div);
      };

      reader.readAsDataURL(file);
    });
  }

  // 删除图片
  removeImage(index) {
    this.images.splice(index, 1);
    this.showImagePreview();
    showToast(`已删除第 ${index + 1} 张图片`);
  }

  // 开始识别
  async startRecognition() {
    // 检查是否选择了学科
    if (!this.currentSubjectId) {
      showToast('请先选择学科');
      return;
    }

    // 检查是否有图片
    if (this.images.length === 0) {
      showToast('请先上传题目图片');
      return;
    }

    try {
      showLoading('正在识别图片...');

      // 批量识别
      const results = await ocrProcessor.batchRecognize(
        this.images,
        (progress, current, total) => {
          const progressEl = document.getElementById('ocr-progress');
          if (progressEl) {
            progressEl.innerHTML = `
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
              </div>
              <div class="progress-text">识别中... (${current}/${total})</div>
            `;
          }
        }
      );

      // 解析识别结果
      this.recognizedQuestions = results.map(r => {
        if (r.error) {
          return {
            content: '',
            options: [],
            answer: '',
            type: 'choice',
            error: r.error,
            fileName: r.file
          };
        }

        const parsed = ocrProcessor.parseQuestionText(r.text);
        parsed.fileName = r.file;
        return parsed;
      });

      hideLoading();

      // 显示预览
      this.showQuestionPreview();

      showToast(`识别完成！成功 ${this.recognizedQuestions.filter(q => !q.error).length} 道，失败 ${this.recognizedQuestions.filter(q => q.error).length} 道`);
    } catch (error) {
      hideLoading();
      console.error('识别失败:', error);
      showToast('识别失败: ' + error.message);
    }
  }

  // 显示题目预览（可编辑）
  showQuestionPreview() {
    const container = document.getElementById('question-preview');
    if (!container) return;

    container.innerHTML = '';

    if (this.recognizedQuestions.length === 0) {
      container.innerHTML = '<p class="empty-tip">暂无识别结果，请先上传图片并识别</p>';
      return;
    }

    this.recognizedQuestions.forEach((question, index) => {
      const editor = document.createElement('div');
      editor.className = 'question-editor';
      
      if (question.error) {
        editor.classList.add('error');
        editor.innerHTML = `
          <div class="editor-error">
            <strong>识别失败:</strong> ${question.fileName}
            <p>${question.error}</p>
          </div>
        `;
      } else {
        editor.innerHTML = `
          <div class="editor-field">
            <label>题目内容:</label>
            <textarea class="question-content" data-index="${index}">${question.content}</textarea>
          </div>
          <div class="editor-field">
            <label>选项:</label>
            <div class="options-container" data-index="${index}">
              ${question.options.map((opt, i) => 
                `<input type="text" class="option-input" data-index="${index}" data-option-index="${i}" value="${opt}" placeholder="选项 ${String.fromCharCode(65 + i)}">`
              ).join('')}
            </div>
            <button class="btn-add-option" data-index="${index}">添加选项</button>
          </div>
          <div class="editor-field">
            <label>正确答案:</label>
            <input type="text" class="question-answer" data-index="${index}" value="${question.answer}" maxlength="1">
          </div>
          <div class="editor-field">
            <label>题目类型:</label>
            <select class="question-type" data-index="${index}">
              <option value="choice" ${question.type === 'choice' ? 'selected' : ''}>选择题</option>
              <option value="true-false" ${question.type === 'true-false' ? 'selected' : ''}>判断题</option>
              <option value="fill-blank" ${question.type === 'fill-blank' ? 'selected' : ''}>填空题</option>
            </select>
          </div>
          <div class="editor-actions">
            <button class="btn-delete-question" data-index="${index}">删除</button>
          </div>
        `;

        // 绑定编辑事件
        this.bindEditorEvents(editor, index);
      }

      container.appendChild(editor);
    });
  }

  // 绑定编辑器事件
  bindEditorEvents(editor, index) {
    // 题目内容
    const contentInput = editor.querySelector('.question-content');
    if (contentInput) {
      contentInput.oninput = (e) => {
        this.recognizedQuestions[index].content = e.target.value;
      };
    }

    // 选项
    editor.querySelectorAll('.option-input').forEach(input => {
      input.oninput = (e) => {
        const optIndex = parseInt(e.target.dataset.optionIndex);
        this.recognizedQuestions[index].options[optIndex] = e.target.value;
      };
    });

    // 添加选项
    const addOptionBtn = editor.querySelector('.btn-add-option');
    if (addOptionBtn) {
      addOptionBtn.onclick = () => {
        this.recognizedQuestions[index].options.push('');
        this.showQuestionPreview();
      };
    }

    // 正确答案
    const answerInput = editor.querySelector('.question-answer');
    if (answerInput) {
      answerInput.oninput = (e) => {
        this.recognizedQuestions[index].answer = e.target.value.toUpperCase();
      };
    }

    // 题目类型
    const typeSelect = editor.querySelector('.question-type');
    if (typeSelect) {
      typeSelect.onchange = (e) => {
        this.recognizedQuestions[index].type = e.target.value;
        
        // 根据类型调整选项
        if (e.target.value === 'true-false' && this.recognizedQuestions[index].options.length === 0) {
          this.recognizedQuestions[index].options = ['正确', '错误'];
        } else if (e.target.value === 'fill-blank') {
          this.recognizedQuestions[index].options = [];
        }
        
        this.showQuestionPreview();
      };
    }

    // 删除按钮
    const deleteBtn = editor.querySelector('.btn-delete-question');
    if (deleteBtn) {
      deleteBtn.onclick = () => {
        this.recognizedQuestions.splice(index, 1);
        this.showQuestionPreview();
        showToast('已删除题目');
      };
    }
  }

  // 保存全部
  async saveAll() {
    // 检查是否选择了学科
    if (!this.currentSubjectId) {
      showToast('请先选择学科');
      return;
    }

    // 检查是否有题目
    if (this.recognizedQuestions.length === 0) {
      showToast('没有可保存的题目');
      return;
    }

    // 验证题目
    const validQuestions = [];
    const invalidQuestions = [];

    for (const question of this.recognizedQuestions) {
      if (question.error) {
        invalidQuestions.push(question);
        continue;
      }

      if (!question.content.trim()) {
        invalidQuestions.push(question);
        continue;
      }

      if (question.type === 'choice' && question.options.length === 0) {
        invalidQuestions.push(question);
        continue;
      }

      validQuestions.push(question);
    }

    if (validQuestions.length === 0) {
      showToast('没有有效的题目可保存');
      return;
    }

    if (invalidQuestions.length > 0) {
      if (!confirm(`有 ${invalidQuestions.length} 道题目无效，是否继续保存有效的 ${validQuestions.length} 道题目？`)) {
        return;
      }
    }

    try {
      showLoading('正在保存题目...');

      // 批量保存到 IndexedDB
      for (const question of validQuestions) {
        await database.add('questions', {
          subjectId: parseInt(this.currentSubjectId),
          type: question.type,
          content: question.content.trim(),
          options: question.options.filter(opt => opt.trim()),
          answer: question.answer.toUpperCase(),
          explanation: question.explanation || '',
          difficulty: 3,
          tags: [],
          source: 'OCR导入',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      hideLoading();

      showToast(`成功保存 ${validQuestions.length} 道题目！`);

      // 清空当前状态
      this.images = [];
      this.recognizedQuestions = [];
      this.showImagePreview();
      this.showQuestionPreview();

      // 更新学科题目数量
      await this.updateSubjectCount();
    } catch (error) {
      hideLoading();
      console.error('保存失败:', error);
      showToast('保存失败: ' + error.message);
    }
  }

  // 更新学科题目数量
  async updateSubjectCount() {
    if (!this.currentSubjectId) return;

    try {
      const questions = await database.queryByIndex('questions', 'subjectId', parseInt(this.currentSubjectId));
      const subject = await database.get('subjects', parseInt(this.currentSubjectId));

      if (subject) {
        await database.update('subjects', subject.id, {
          questionCount: questions.length
        });
      }
    } catch (error) {
      console.error('更新学科题目数量失败:', error);
    }
  }
}

// 创建单例实例
const questionImporter = new QuestionImporter();

// 导出
window.questionImporter = questionImporter;
