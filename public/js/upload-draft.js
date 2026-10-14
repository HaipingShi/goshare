/* Tab-scoped local recovery. Never stores passwords or publishes document content. */
(() => {
  const MAX_AGE = 24 * 60 * 60 * 1000;
  function indexedStorage() {
    const database = new Promise((resolve, reject) => {
      const request = indexedDB.open('goshare-upload-drafts', 1);
      const timeout = setTimeout(() => reject(new Error('草稿存储未能启动')), 5000);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onerror = () => { clearTimeout(timeout); reject(request.error); };
      request.onsuccess = () => {
        clearTimeout(timeout);
        const db = request.result;
        const cleanup = db.transaction('drafts', 'readwrite').objectStore('drafts').openCursor();
        cleanup.onsuccess = () => {
          const cursor = cleanup.result;
          if (!cursor) return;
          if (Date.now() - cursor.value.updatedAt > MAX_AGE) cursor.delete();
          cursor.continue();
        };
        resolve(db);
      };
    });
    async function access(key, value, action) {
      const db = await database;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', action === 'get' ? 'readonly' : 'readwrite');
        const objectStore = transaction.objectStore('drafts');
        const request = action === 'get' ? objectStore.get(key) : action === 'put' ? objectStore.put(value, key) : objectStore.delete(key);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('草稿保存失败'));
      });
    }
    return { get: key => access(key, null, 'get'), put: (key, value) => access(key, value, 'put'), remove: key => access(key, null, 'remove') };
  }
  function create(key, storage = indexedStorage(), now = Date.now) {
    let queue = Promise.resolve();
    const enqueue = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
    return {
      load: () => enqueue(async () => {
        const draft = await storage.get(key);
        if (!draft) return null;
        if (!Number.isFinite(draft.updatedAt) || now() - draft.updatedAt > MAX_AGE) { await storage.remove(key); return null; }
        return draft;
      }),
      save: draft => enqueue(() => storage.put(key, {
        content: draft.content, codeType: draft.codeType, zipContent: draft.zipContent,
        pendingFile: draft.pendingFile, name: draft.name || '', markdownTheme: draft.markdownTheme,
        warnings: draft.warnings || '', updatedAt: now(),
      })),
      clear: () => enqueue(() => storage.remove(key)),
    };
  }
  window.GoshareDraft = { create };
})();
