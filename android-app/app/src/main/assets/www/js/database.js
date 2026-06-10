// database.js - IndexedDB 数据库封装
// 使用原生 IndexedDB API，不依赖外部库

class Database {
  constructor() {
    this.dbName = 'ExamSystemDB';
    this.version = 1;
    this.db = null;
  }

  // 初始化数据库
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      // 数据库升级（首次创建或版本更新）
      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 创建学科表
        if (!db.objectStoreNames.contains('subjects')) {
          const subjectStore = db.createObjectStore('subjects', {
            keyPath: 'id',
            autoIncrement: true
          });
          subjectStore.createIndex('name', 'name', { unique: true });
          subjectStore.createIndex('createdAt', 'createdAt');
        }

        // 创建题目表
        if (!db.objectStoreNames.contains('questions')) {
          const questionStore = db.createObjectStore('questions', {
            keyPath: 'id',
            autoIncrement: true
          });
          questionStore.createIndex('subjectId', 'subjectId');
          questionStore.createIndex('type', 'type');
          questionStore.createIndex('difficulty', 'difficulty');
          questionStore.createIndex('createdAt', 'createdAt');
        }

        // 创建考试记录表
        if (!db.objectStoreNames.contains('exam_records')) {
          const examStore = db.createObjectStore('exam_records', {
            keyPath: 'id',
            autoIncrement: true
          });
          examStore.createIndex('subjectId', 'subjectId');
          examStore.createIndex('startTime', 'startTime');
          examStore.createIndex('status', 'status');
        }

        // 创建错题本表
        if (!db.objectStoreNames.contains('wrong_questions')) {
          const wrongStore = db.createObjectStore('wrong_questions', {
            keyPath: 'id',
            autoIncrement: true
          });
          wrongStore.createIndex('questionId', 'questionId', { unique: true });
          wrongStore.createIndex('subjectId', 'subjectId');
          wrongStore.createIndex('reviewed', 'reviewed');
          wrongStore.createIndex('lastWrongAt', 'lastWrongAt');
        }

        // 创建设置表
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      // 打开成功
      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('数据库初始化成功');
        resolve(this.db);
      };

      // 打开失败
      request.onerror = (event) => {
        console.error('数据库初始化失败:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // 添加数据
  async add(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      const dataWithTimestamp = {
        ...data,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const request = store.add(dataWithTimestamp);

      request.onsuccess = (event) => {
        resolve(event.target.result); // 返回新记录的 ID
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 获取单条数据
  async get(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 获取所有数据
  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 更新数据
  async update(storeName, id, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      // 先获取原有数据
      const getRequest = store.get(id);

      getRequest.onsuccess = (event) => {
        const existingData = event.target.result;

        if (!existingData) {
          reject(new Error('记录不存在'));
          return;
        }

        const updatedData = {
          ...existingData,
          ...data,
          updatedAt: Date.now()
        };

        const putRequest = store.put(updatedData);

        putRequest.onsuccess = () => {
          resolve(updatedData);
        };

        putRequest.onerror = (event) => {
          reject(event.target.error);
        };
      };

      getRequest.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 删除数据
  async delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 按索引查询
  async queryByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 按索引查询单条
  async queryOneByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.get(value);

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 分页查询（基于索引）
  async queryWithPagination(storeName, indexName, value, page = 1, pageSize = 20) {
    const all = await this.queryByIndex(storeName, indexName, value);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      data: all.slice(start, end),
      total: all.length,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(all.length / pageSize)
    };
  }

  // 使用游标遍历（用于大数据量）
  async queryByCursor(storeName, indexName, value, callback) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.openCursor(value);

      const results = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;

        if (cursor) {
          results.push(cursor.value);

          if (callback) {
            callback(cursor.value);
          }

          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 范围查询
  async queryByRange(storeName, indexName, lowerBound, upperBound) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);

      const range = IDBKeyRange.bound(lowerBound, upperBound);
      const request = index.getAll(range);

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 清空表
  async clear(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 统计记录数
  async count(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  // 获取设置
  async getSetting(key) {
    try {
      const result = await this.get('settings', key);
      return result ? result.value : null;
    } catch (error) {
      return null;
    }
  }

  // 保存设置
  async saveSetting(key, value) {
    try {
      const existing = await this.getSetting(key);

      if (existing !== null) {
        await this.update('settings', key, { value: value });
      } else {
        await this.add('settings', { key: key, value: value });
      }

      return true;
    } catch (error) {
      console.error('保存设置失败:', error);
      return false;
    }
  }

  // 删除设置
  async deleteSetting(key) {
    return await this.delete('settings', key);
  }

  // 批量插入
  async batchAdd(storeName, dataArray) {
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    const promises = dataArray.map(data => {
      return new Promise((resolve, reject) => {
        const dataWithTimestamp = {
          ...data,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        const request = store.add(dataWithTimestamp);

        request.onsuccess = (event) => {
          resolve(event.target.result);
        };

        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    });

    return Promise.all(promises);
  }

  // 关闭数据库
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('数据库已关闭');
    }
  }

  // 删除数据库
  async deleteDatabase() {
    this.close();

    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);

      request.onsuccess = () => {
        console.log('数据库已删除');
        resolve(true);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }
}

// 创建单例实例
const database = new Database();

// 导出
window.database = database;
