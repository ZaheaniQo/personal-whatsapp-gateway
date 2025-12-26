const stateStore = require('../ops/stateStore');

stateStore.setStatus({
  status: 'ready',
  phone: '999999999',
  lastReadyAt: new Date().toISOString(),
});
stateStore.setQr(null);
stateStore.appendLog({
  ts: Date.now(),
  type: 'system',
  to: null,
  textPreview: 'ops sanity check',
  hasMedia: false,
  result: 'success',
});

setTimeout(async () => {
  const snapshot = stateStore.getSnapshot();
  const logs = await stateStore.tailLogs({ limit: 5 });
  console.log('Snapshot:', snapshot);
  console.log('Logs:', logs);
  process.exit(0);
}, 500);
