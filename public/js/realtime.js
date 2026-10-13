// Realtime client — one WebSocket to /ws for pool chat, DMs, and call signaling.
// Usage: RT.connect(token); RT.on('pool_msg', fn); RT.poolMsg(poolId, body); ...

class Realtime {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.authed = false;
    this.queue = [];
  }
  on(type, fn) {
    (this.handlers[type] = this.handlers[type] || []).push(fn);
  }
  emit(type, data) {
    (this.handlers[type] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
  }
  connect(token) {
    this.disconnect();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => {
      this.send({ type: 'auth', token });
      this.queue.forEach((m) => this.send(m));
      this.queue = [];
    };
    this.ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'authed') this.authed = true;
      this.emit(msg.type, msg);
    };
    this.ws.onclose = () => { this.authed = false; this.emit('close', {}); };
  }
  disconnect() {
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
    this.authed = false;
  }
  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
    else this.queue.push(obj);
  }
  joinPool(poolId) { this.send({ type: 'join', pool_id: poolId }); }
  leavePool(poolId) { this.send({ type: 'leave', pool_id: poolId }); }
  poolMsg(poolId, body) { this.send({ type: 'pool_msg', pool_id: poolId, body }); }
  dm(to, body) { this.send({ type: 'dm', to, body }); }
  call(to, action, payload) { this.send({ type: 'call', to, action, payload }); }
}

const RT = new Realtime();
