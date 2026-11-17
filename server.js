import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 10000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '';
const BUILD = 'slap-tower-proto-1';
const TICK_MS = 50;
const MAX_PLAYERS = 24;
const rooms = new Map();

const now = () => Date.now();
const id = () => crypto.randomUUID();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const safeName = (value) => String(value || 'Player').replace(/[^\p{L}\p{N}_ -]/gu, '').trim().slice(0, 18) || 'Player';
const send = (ws, type, data = {}) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, ...data }));
};
const broadcast = (room, type, data = {}, except) => {
  for (const player of room.players.values()) {
    if (player.ws !== except) send(player.ws, type, data);
  }
};

function roomState(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id, name: p.name, x: p.x, y: p.y, z: p.z,
    vx: p.vx, vy: p.vy, vz: p.vz, frozen: p.frozen,
    gear: [...p.gear], coins: p.coins, alive: p.alive
  }));
}

function getRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { code, players: new Map(), revision: 0, createdAt: now() };
    rooms.set(code, room);
  }
  return room;
}

function leave(player) {
  const room = player.room;
  if (!room) return;
  room.players.delete(player.id);
  broadcast(room, 'player_left', { playerId: player.id, revision: ++room.revision });
  if (!room.players.size) rooms.delete(room.code);
  player.room = null;
}

function join(ws, payload) {
  const code = String(payload.room || 'main').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20) || 'MAIN';
  const room = getRoom(code);
  if (room.players.size >= MAX_PLAYERS) return send(ws, 'error', { code: 'room_full', message: 'Room is full' });
  const player = {
    id: id(), ws, room, name: safeName(payload.name),
    x: 0, y: 1.5, z: 0, vx: 0, vy: 0, vz: 0,
    frozen: false, alive: true, coins: 0,
    gear: new Set(['slap']), lastAction: new Map(), lastInput: now()
  };
  room.players.set(player.id, player);
  ws.player = player;
  send(ws, 'joined', { build: BUILD, playerId: player.id, room: room.code, players: roomState(room), revision: room.revision });
  broadcast(room, 'player_joined', { player: roomState(room).find((p) => p.id === player.id), revision: ++room.revision }, ws);
}

function rate(player, action, ms) {
  const t = now(), previous = player.lastAction.get(action) || 0;
  if (t - previous < ms) return false;
  player.lastAction.set(action, t);
  return true;
}

function handleInput(player, payload) {
  if (player.frozen || !player.alive) return;
  if (!rate(player, 'input', 45)) return;
  const x = clamp(Number(payload.x) || 0, -1, 1);
  const z = clamp(Number(payload.z) || 0, -1, 1);
  const length = Math.hypot(x, z) || 1;
  const speed = player.gear.has('speed') ? 9 : 6;
  player.vx = (x / length) * speed;
  player.vz = (z / length) * speed;
  player.x = clamp(player.x + player.vx * TICK_MS / 1000, -28, 28);
  player.z = clamp(player.z + player.vz * TICK_MS / 1000, -28, 28);
  player.lastInput = now();
}

function handleAction(player, payload) {
  const action = String(payload.action || '');
  if (!rate(player, action, action === 'slap' ? 650 : 900)) return;
  if (action === 'jump') {
    if (player.frozen || !player.alive) return;
    player.vy = 11;
    return;
  }
  if (action === 'slap') {
    if (!player.gear.has('slap') || player.frozen || !player.alive) return;
    const target = player.room.players.get(String(payload.target || ''));
    if (!target || target === player || target.frozen || !target.alive) return;
    const dx = target.x - player.x, dz = target.z - player.z;
    if (Math.hypot(dx, dz) > 4.2) return;
    const length = Math.hypot(dx, dz) || 1;
    target.vx += (dx / length) * 20;
    target.vz += (dz / length) * 20;
    target.vy = Math.max(target.vy, 7);
    broadcast(player.room, 'hit', { attackerId: player.id, targetId: target.id, revision: ++player.room.revision });
    return;
  }
  const gear = new Set(['hook', 'cape', 'laser', 'fly', 'speed', 'jump']);
  if (gear.has(action) && player.gear.has(action)) {
    broadcast(player.room, 'gear_used', { playerId: player.id, gear: action, revision: ++player.room.revision });
  }
}

function handleAdmin(player, payload) {
  if (!ADMIN_TOKEN || payload.token !== ADMIN_TOKEN) return send(player.ws, 'error', { code: 'admin_denied', message: 'Admin access denied' });
  const command = String(payload.command || '');
  const target = player.room.players.get(String(payload.target || ''));
  if (command === 'announce') {
    broadcast(player.room, 'announcement', { message: String(payload.message || '').slice(0, 160), revision: ++player.room.revision });
  } else if (target && ['freeze', 'unfreeze', 'kick'].includes(command)) {
    if (command === 'freeze') target.frozen = true;
    if (command === 'unfreeze') target.frozen = false;
    if (command === 'kick') { send(target.ws, 'kicked', { reason: 'Removed by admin' }); target.ws.close(4003, 'kicked'); }
    broadcast(player.room, 'admin_update', { command, targetId: target.id, revision: ++player.room.revision });
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'blox-dunya-multiplayer', build: BUILD, rooms: rooms.size }));
  }
  res.writeHead(404); res.end('Not found');
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
server.on('upgrade', (req, socket, head) => {
  if (CLIENT_ORIGIN && req.headers.origin && req.headers.origin !== CLIENT_ORIGIN) return socket.destroy();
  if (req.url !== '/ws') return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let payload;
    try { payload = JSON.parse(raw.toString()); } catch { return send(ws, 'error', { code: 'bad_json' }); }
    if (!payload || typeof payload.type !== 'string') return send(ws, 'error', { code: 'bad_message' });
    if (payload.type === 'join' && !ws.player) return join(ws, payload);
    if (!ws.player) return send(ws, 'error', { code: 'not_joined' });
    if (payload.type === 'input') handleInput(ws.player, payload);
    else if (payload.type === 'action') handleAction(ws.player, payload);
    else if (payload.type === 'admin') handleAdmin(ws.player, payload);
  });
  ws.on('close', () => leave(ws.player || {}));
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
  for (const room of rooms.values()) {
    if (!room.players.size) continue;
    broadcast(room, 'state', { players: roomState(room), revision: ++room.revision });
  }
}, TICK_MS);
server.listen(PORT, '0.0.0.0', () => console.log(`Blox Dunyo multiplayer server listening on ${PORT}`));
