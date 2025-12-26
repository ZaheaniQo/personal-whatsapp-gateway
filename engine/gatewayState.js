const { EventEmitter } = require('events');

const startedAt = Date.now();
const emitter = new EventEmitter();
const state = {
  status: 'initializing',
  phoneNumber: null,
  lastQr: null,
  lastQrAt: null,
  lastDisconnectReason: null,
  lastError: null,
  lastStateChangeAt: new Date().toISOString(),
};

function snapshot() {
  return {
    status: state.status,
    phoneNumber: state.phoneNumber,
    lastQr: state.lastQr,
    lastQrAt: state.lastQrAt,
    lastDisconnectReason: state.lastDisconnectReason,
    lastError: state.lastError,
    lastStateChangeAt: state.lastStateChangeAt,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  };
}

function emitStatus() {
  emitter.emit('status', snapshot());
}

function updateState(update) {
  const statusChanged = typeof update.status === 'string' && update.status !== state.status;
  Object.assign(state, update);
  if (statusChanged) {
    state.lastStateChangeAt = new Date().toISOString();
  }
  emitStatus();
}

function setInitializing() {
  updateState({ status: 'initializing' });
}

function setQr(qr) {
  updateState({
    status: 'qr',
    lastQr: qr,
    lastQrAt: new Date().toISOString(),
    lastError: null,
  });
  emitter.emit('qr', { qr, generatedAt: state.lastQrAt });
}

function setAuthenticated() {
  updateState({ status: 'authenticated', lastError: null });
}

function setReady(phoneNumber) {
  updateState({
    status: 'ready',
    phoneNumber: phoneNumber || null,
    lastDisconnectReason: null,
    lastError: null,
  });
}

function setDisconnected(reason) {
  updateState({
    status: 'disconnected',
    lastDisconnectReason: reason || 'UNKNOWN',
  });
  emitter.emit('alert', {
    level: 'warning',
    message: state.lastDisconnectReason || 'DISCONNECTED',
  });
}

function setError(message) {
  updateState({
    status: 'error',
    lastError: message || 'UNKNOWN',
  });
  emitter.emit('alert', {
    level: 'error',
    message: state.lastError || 'ERROR',
  });
}

function onStatus(handler) {
  emitter.on('status', handler);
  return () => emitter.off('status', handler);
}

function onQr(handler) {
  emitter.on('qr', handler);
  return () => emitter.off('qr', handler);
}

function onAlert(handler) {
  emitter.on('alert', handler);
  return () => emitter.off('alert', handler);
}

module.exports = {
  getState: snapshot,
  setInitializing,
  setQr,
  setAuthenticated,
  setReady,
  setDisconnected,
  setError,
  onStatus,
  onQr,
  onAlert,
};
