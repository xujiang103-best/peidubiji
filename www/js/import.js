/**
 * 数据导入导出模块
 */

const ImportExport = {
  /**
   * 导出所有数据为 JSON 文件
   */
  async exportData() {
    try {
      const subjects = await window.ExamDB.db.subjects.toArray();
      const questions = await window.ExamDB.db.questions.toArray();
      const examRecords = await window.ExamDB.db.examRecords.toArray();
      const wrongQuestions = await window.ExamDB.db.wrongQuestions.toArray();

      const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        subjects,
        questions,
        examRecords,
        wrongQuestions
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `陪读笔记备份_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showToast('数据导出成功！');
    } catch (err) {
      showToast('导出失败：' + err.message);
    }
  },

  /**
   * 从 JSON 文件导入数据（合并模式）
   */
  async importData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);

          // 验证格式
          if (!data.version || !Array.isArray(data.subjects)) {
            throw new Error('无效的备份文件格式');
          }

          // 导入学科（去重）
          const subjectNameMap = {}; // 旧ID → 新ID
          const existingSubjects = await window.ExamDB.getAllSubjects();

          for (const s of data.subjects) {
            const existing = existingSubjects.find(es => es.name === s.name);
            if (existing) {
              subjectNameMap[s.id] = existing.id;
            } else {
              const newId = await window.ExamDB.addSubject(s.name);
              subjectNameMap[s.id] = newId;
            }
          }

          // 导入题目
          let questionCount = 0;
          for (const q of data.questions || []) {
            const newSubjectId = subjectNameMap[q.subjectId] || q.subjectId;
            try {
              await window.ExamDB.addQuestion({
                subjectId: newSubjectId,
                type: q.type,
                content: q.content,
                options: q.options,
                answer: q.answer,
                explanation: q.explanation || '',
                image: q.image || null
              });
              questionCount++;
            } catch (err) {
              // 跳过重复题目
            }
          }

          showToast(`导入成功！新增 ${questionCount} 道题目`);
          loadQuestions();
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }
};

// 全局函数
function exportData() {
  ImportExport.exportData();
}

function importData() {
  document.getElementById('dialog-import').style.display = 'flex';
}

async function doImportData() {
  const fileInput = document.getElementById('import-file-input');
  const file = fileInput.files[0];
  if (!file) return showToast('请选择文件');

  try {
    await ImportExport.importData(file);
    hideDialog('dialog-import');
  } catch (err) {
    showToast('导入失败：' + err.message);
  }
}
