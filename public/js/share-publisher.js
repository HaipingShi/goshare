/* Reuse successful shares and retry uncertain outcomes with the same request key. */
(() => {
  function createPublisher(fetcher = fetch) {
    let pending, lastAttempt, lastSuccess;
    function publish(payload) {
      const signature = JSON.stringify(payload);
      if (lastSuccess?.signature === signature) return Promise.resolve(lastSuccess.data);
      if (pending) return pending.signature === signature ? pending.promise : Promise.reject(new Error('正在生成分享链接，请等待完成。'));
      const key = lastAttempt?.signature === signature ? lastAttempt.key : crypto.randomUUID();
      lastAttempt = { signature, key };
      const promise = (async () => {
        const response = await fetcher('/api/v1/pages/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: signature,
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || '生成链接失败，请重试。');
        lastSuccess = { signature, data };
        return data;
      })().finally(() => { pending = undefined; });
      pending = { signature, promise };
      return promise;
    }
    return { publish };
  }
  window.GoshareShare = { createPublisher };
})();
