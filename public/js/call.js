// Masked WebRTC calls — real peer-to-peer voice/video.
// --------------------------------------------------
// * Signaling (offer/answer/ICE) travels over our WebSocket; the server only
//   relays it and never sees audio/video.
// * Identity stays masked: the UI shows first-name + verified badge. No phone
//   numbers exist anywhere in the system.
// * ICE uses Google's free public STUN server.
// * DEMO SEAM: production needs your own TURN server (coturn / Twilio / Cloudflare)
//   for calls behind symmetric NATs, plus push notifications for incoming calls
//   when the callee's tab is closed.

class CallManager {
  constructor() {
    this.pc = null;
    this.localStream = null;
    this.peerId = null;
    this.peerName = 'traveler';
    this.isVideo = false;
    this.onState = () => {};
  }

  get maskedName() { return String(this.peerName).split(/[\s_]+/)[0]; }

  async _peer() {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], // DEMO SEAM: add TURN here
    });
    pc.onicecandidate = (e) => {
      if (e.candidate) RT.call(this.peerId, 'ice', e.candidate.toJSON());
    };
    pc.ontrack = (e) => {
      const v = document.getElementById('remote-video');
      if (v) { v.srcObject = e.streams[0]; v.play().catch(() => {}); }
    };
    pc.onconnectionstatechange = () => this.onState(pc.connectionState);
    return pc;
  }

  async _media(video) {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    const v = document.getElementById('local-video');
    if (v) { v.srcObject = this.localStream; v.play().catch(() => {}); }
    return this.localStream;
  }

  // Caller side
  async start(peerId, peerName, video) {
    this.peerId = peerId; this.peerName = peerName; this.isVideo = video;
    await this._media(video);
    this.pc = await this._peer();
    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    RT.call(peerId, 'ring', { video, from_name: maskedFirst(App.user.name) });
    RT.call(peerId, 'offer', this.pc.localDescription.toJSON());
    this.onState('calling');
  }

  // Callee side — called when an 'offer' arrives and the user accepts
  async answer(offerPayload, video) {
    await this._media(video);
    this.pc = await this._peer();
    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));
    await this.pc.setRemoteDescription(new RTCSessionDescription(offerPayload));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    RT.call(this.peerId, 'answer', this.pc.localDescription.toJSON());
    this.onState('connected');
  }

  async onSignal(action, from, payload, fromName) {
    if (action === 'ring') {
      this.peerId = from; this.peerName = fromName || 'traveler';
      this.isVideo = !!(payload && payload.video);
      this.onState('incoming');
      return;
    }
    if (from !== this.peerId || !this.pc) return;
    if (action === 'answer') {
      await this.pc.setRemoteDescription(new RTCSessionDescription(payload));
      this.onState('connected');
    } else if (action === 'ice') {
      try { await this.pc.addIceCandidate(new RTCIceCandidate(payload)); } catch {}
    } else if (action === 'end') {
      this.hangup(false);
    }
  }

  hangup(notify = true) {
    if (notify && this.peerId) RT.call(this.peerId, 'end');
    if (this.pc) { try { this.pc.close(); } catch {} this.pc = null; }
    if (this.localStream) { this.localStream.getTracks().forEach((t) => t.stop()); this.localStream = null; }
    this.peerId = null;
    this.onState('ended');
  }
}

function maskedFirst(name) { return String(name || 'traveler').split(/[\s_]+/)[0]; }

const CALL = new CallManager();
