/**
 * import-export.js - 数据导入导出
 */
const ImportExport = {
  async exportAll() {
    const result = await Storage.exportAll();
    const json = JSON.stringify(result, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '陪读笔记数据_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  async importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          await Storage.importAll(data);
          resolve(data);
        } catch (err) {
          reject(new Error('文件格式错误：' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  },

  async exportQuestionsCSV(subjectId) {
    const questions = subjectId
      ? await Storage.getQuestionsBySubject(subjectId)
      : await Storage.getAllQuestions();
    if (questions.length === 0) throw new Error('没有可导出的题目');
    const subjects = await Storage.getAllSubjects();
    const subMap = {};
    subjects.forEach(s => subMap[s.id] = s.name);
    const rows = [['学科','类型','题目','选项A','选项B','选项C','选项D','正确答案','解析']];
    for (const q of questions) {
      const opts = q.options || {};
      const escapeCsv = (s) => '"' + String(s).replace(/"/g, '""') + '"';
      rows.push([
        subMap[q.subjectId] || '',
        q.type || 'choice',
        q.text || '',
        opts.A || '', opts.B || '', opts.C || '', opts.D || '',
        q.answer || '',
        q.explanation || ''
      ].map(escapeCsv).join(','));
    }
    const csv = '\uFEFF' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '题目导出_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
};