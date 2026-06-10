/**
 * 数据存储层 - 基于 Dexie.js (IndexedDB)
 * 四张表：subjects / questions / examRecords / wrongQuestions
 */

// 初始化数据库
const DB_NAME = 'ExamSystemDB';
const DB_VERSION = 1;

const db = new Dexie(DB_NAME);

// 定义表结构
db.version(DB_VERSION).stores({
  // 学科表
  subjects: '++id, name, createdAt',
  
  // 题目表
  questions: '++id, subjectId, type, content, answer, createdAt',
  // type: 'choice' | 'truefalse' | 'fillblank'
  // options: JSON 字符串（选择题的选项）
  // image: base64 图片（可选）
  
  // 考试记录表
  examRecords: '++id, subjectId, score, totalQuestions, date',
  // questions: JSON 字符串（题目ID数组）
  // answers: JSON 字符串（用户答案数组）
  
  // 错题本表
  wrongQuestions: '++id, questionId, wrongCount, lastWrongDate, memoryAid'
  // memoryAid: AI生成的记忆辅助（顺口溜等）
});

// ==================== 学科操作 ====================

/**
 * 添加学科
 */
async function addSubject(name) {
  const existing = await db.subjects.where({ name }).first();
  if (existing) throw new Error(`学科"${name}"已存在`);
  
  return await db.subjects.add({
    name,
    createdAt: new Date().toISOString()
  });
}

/**
 * 获取所有学科
 */
async function getAllSubjects() {
  return await db.subjects.orderBy('createdAt').toArray();
}

/**
 * 删除学科（同时删除该学科的所有题目）
 */
async function deleteSubject(id) {
  await db.transaction('rw', db.subjects, db.questions, async () => {
    await db.subjects.delete(id);
    await db.questions.where({ subjectId: id }).delete();
  });
}

/**
 * 获取学科题目数量
 */
async function getSubjectQuestionCount(subjectId) {
  return await db.questions.where({ subjectId }).count();
}

// ==================== 题目操作 ====================

/**
 * 添加题目
 */
async function addQuestion(question) {
  const { subjectId, type, content, options, answer, explanation, image } = question;
  
  return await db.questions.add({
    subjectId,
    type,       // 'choice' | 'truefalse' | 'fillblank'
    content,    // 题目内容
    options: options ? JSON.stringify(options) : null,  // 选择题选项 {A, B, C, D}
    answer,     // 正确答案
    explanation: explanation || '',  // 解析
    image: image || null,  // base64 图片
    createdAt: new Date().toISOString()
  });
}

/**
 * 批量添加题目
 */
async function addQuestions(questions) {
  const formatted = questions.map(q => ({
    subjectId: q.subjectId,
    type: q.type,
    content: q.content,
    options: q.options ? JSON.stringify(q.options) : null,
    answer: q.answer,
    explanation: q.explanation || '',
    image: q.image || null,
    createdAt: new Date().toISOString()
  }));
  
  return await db.questions.bulkAdd(formatted);
}

/**
 * 获取学科的所有题目
 */
async function getQuestionsBySubject(subjectId) {
  const questions = await db.questions
    .where({ subjectId })
    .toArray();
  
  // 解析 options JSON
  return questions.map(q => ({
    ...q,
    options: q.options ? JSON.parse(q.options) : null
  }));
}

/**
 * 随机获取题目（组卷用）
 */
async function getRandomQuestions(subjectId, count) {
  const allQuestions = await getQuestionsBySubject(subjectId);
  if (allQuestions.length === 0) return [];
  
  // Fisher-Yates 洗牌算法
  const shuffled = [...allQuestions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * 删除题目
 */
async function deleteQuestion(id) {
  await db.questions.delete(id);
  // 同时从错题本中删除
  await db.wrongQuestions.where({ questionId: id }).delete();
}

/**
 * 更新题目
 */
async function updateQuestion(id, updates) {
  const updateData = { ...updates };
  if (updateData.options) {
    updateData.options = JSON.stringify(updateData.options);
  }
  await db.questions.update(id, updateData);
}

// ==================== 考试记录操作 ====================

/**
 * 保存考试记录
 */
async function saveExamRecord(record) {
  const { subjectId, questions, answers, score, totalQuestions } = record;
  
  return await db.examRecords.add({
    subjectId,
    questions: JSON.stringify(questions),  // 题目ID数组
    answers: JSON.stringify(answers),        // 用户答案数组
    score,
    totalQuestions,
    date: new Date().toISOString()
  });
}

/**
 * 获取考试记录
 */
async function getExamRecords(subjectId = null) {
  let collection = db.examRecords.orderBy('date').reverse();
  if (subjectId) {
    collection = collection.filter(r => r.subjectId === subjectId);
  }
  return await collection.toArray();
}

// ==================== 错题本操作 ====================

/**
 * 记录错题
 */
async function addWrongQuestion(questionId) {
  const existing = await db.wrongQuestions
    .where({ questionId })
    .first();
  
  if (existing) {
    // 更新错误次数
    await db.wrongQuestions.update(existing.id, {
      wrongCount: existing.wrongCount + 1,
      lastWrongDate: new Date().toISOString()
    });
  } else {
    // 新增错题记录
    await db.wrongQuestions.add({
      questionId,
      wrongCount: 1,
      lastWrongDate: new Date().toISOString(),
      memoryAid: ''  // AI记忆辅助（顺口溜等）
    });
  }
}

/**
 * 获取错题列表（含题目详情）
 */
async function getWrongQuestions(subjectId = null) {
  let wrongList = await db.wrongQuestions.toArray();
  
  // 获取题目详情
  const result = [];
  for (const wrong of wrongList) {
    const question = await db.questions.get(wrong.questionId);
    if (!question) continue;
    if (subjectId && question.subjectId !== subjectId) continue;
    
    result.push({
      ...wrong,
      question: {
        ...question,
        options: question.options ? JSON.parse(question.options) : null
      }
    });
  }
  
  return result.sort((a, b) => 
    new Date(b.lastWrongDate) - new Date(a.lastWrongDate)
  );
}

/**
 * 更新错题的记忆辅助
 */
async function updateMemoryAid(wrongQuestionId, memoryAid) {
  await db.wrongQuestions.update(wrongQuestionId, { memoryAid });
}

/**
 * 从错题本中移除（已掌握）
 */
async function removeWrongQuestion(wrongQuestionId) {
  await db.wrongQuestions.delete(wrongQuestionId);
}

// ==================== 统计操作 ====================

/**
 * 获取总体统计
 */
async function getStatistics() {
  const subjects = await getAllSubjects();
  const examRecords = await getExamRecords();
  const wrongQuestions = await getWrongQuestions();
  
  const subjectStats = [];
  for (const subject of subjects) {
    const count = await getSubjectQuestionCount(subject.id);
    subjectStats.push({
      ...subject,
      questionCount: count
    });
  }
  
  return {
    totalSubjects: subjects.length,
    totalQuestions: await db.questions.count(),
    totalExams: examRecords.length,
    totalWrong: wrongQuestions.length,
    subjectStats
  };
}

// 导出所有函数（供其他 JS 文件使用）
window.ExamDB = {
  addSubject,
  getAllSubjects,
  deleteSubject,
  getSubjectQuestionCount,
  addQuestion,
  addQuestions,
  getQuestionsBySubject,
  getRandomQuestions,
  deleteQuestion,
  updateQuestion,
  saveExamRecord,
  getExamRecords,
  addWrongQuestion,
  getWrongQuestions,
  updateMemoryAid,
  removeWrongQuestion,
  getStatistics,
  db
};
