import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 10000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '';
const BUILD = 'slap-tower-proto-1';
const TICK_MS = 50;
const MAX_PLAYERS = 24;
const rooms = new Map();
const EVENTS = new Set(['classic', 'lava-rises', 'low-gravity', 'speed-round', 'last-standing']);
const TOWER = Array.from({ length: 22 }, (_, k) => ({ x: Math.cos(k * 0.62) * 8, z: Math.sin(k * 0.62) * 8 }));
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const now = () => Date.now();
const id = () => crypto.randomUUID();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const safeName = (value) => String(value || 'Player').replace(/[^\p{L}\p{N}_ -]/gu, '').trim().slice(0, 18) || 'Player';
const send = (ws, type, data = {}) => {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, ...data }));
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
    gear: [...p.gear], coins: p.coins, alive: p.alive, stage: p.stage
  }));
}

function getRoom(code, payload = {}) {
  let room = rooms.get(code);
  if (!room) {
    const requestedEvent = String(payload.event || 'classic');
    room = { code, players: new Map(), revision: 0, createdAt: now(), event: EVENTS.has(requestedEvent) ? requestedEvent : 'classic' };
    room.players.set(`bot-${code}`, { id: `bot-${code}`, ws: null, room, name: 'AI Tower', x: TOWER[0].x + 2, y: 1.5, z: TOWER[0].z, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0, frozen: false, alive: true, coins: 0, stage: 0, gear: new Set(['slap']), lastAction: new Map(), lastInput: now(), isBot: true, nextJump: now() + 1200 });
    rooms.set(code, room);
  }
  return room;
}

function leave(player) {
  const room = player.room;
  if (!room) return;
  room.players.delete(player.id);
  broadcast(room, 'player_left', { playerId: player.id, revision: ++room.revision });
  if (room.players.size === 1 && room.players.has(`bot-${room.code}`)) rooms.delete(room.code);
  player.room = null;
}

function join(ws, payload) {
  const code = String(payload.room || 'main').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20) || 'MAIN';
  const room = getRoom(code, payload);
  if (room.players.size >= MAX_PLAYERS) return send(ws, 'error', { code: 'room_full', message: 'Room is full' });
  const player = {
    id: id(), ws, room, name: safeName(payload.name),
    x: TOWER[0].x, y: 1.5, z: TOWER[0].z, vx: 0, vy: 0, vz: 0, kx: 0, kz: 0,
    frozen: false, alive: true, coins: 0, stage: 0,
    gear: new Set(['slap']), lastAction: new Map(), lastInput: now()
  };
  room.players.set(player.id, player);
  ws.player = player;
  send(ws, 'joined', { build: BUILD, playerId: player.id, room: room.code, event: room.event, players: roomState(room), revision: room.revision });
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
    target.kx += (dx / length) * 20;
    target.kz += (dz / length) * 20;
    target.vy = Math.max(target.vy, 7);
    player.coins += 5;
    broadcast(player.room, 'hit', { attackerId: player.id, targetId: target.id, reward: 5, revision: ++player.room.revision });
    send(player.ws, 'reward', { kind: 'slap', amount: 5, coins: player.coins });
    return;
  }
  if (action === 'checkpoint') {
    const next = clamp(Math.floor(Number(payload.stage) || 0), 1, TOWER.length);
    const platform = TOWER[next - 1];
    if (next !== player.stage + 1 || Math.hypot(player.x - platform.x, player.z - platform.z) > 4.4) return;
    player.stage = next;
    player.coins += next % 5 === 0 ? 25 : 10;
    broadcast(player.room, 'checkpoint', { playerId: player.id, stage: next, reward: next % 5 === 0 ? 25 : 10, revision: ++player.room.revision });
    send(player.ws, 'reward', { kind: 'checkpoint', amount: next % 5 === 0 ? 25 : 10, coins: player.coins });
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
  } else if (EVENTS.has(command)) {
    player.room.event = command;
    broadcast(player.room, 'round', { event: command, revision: ++player.room.revision });
  }
}

function updateBot(room) {
  const bot = room.players.get(`bot-${room.code}`);
  const human = [...room.players.values()].find((p) => !p.isBot && p.alive);
  if (!bot || !human) return;
  const dx = human.x - bot.x, dz = human.z - bot.z, distance = Math.hypot(dx, dz);
  if (distance > 4.2) {
    handleInput(bot, { x: dx / (distance || 1), z: dz / (distance || 1) });
  } else {
    handleAction(bot, { action: 'slap', target: human.id });
  }
  if (now() >= bot.nextJump && bot.y <= 1.51) {
    handleAction(bot, { action: 'jump' });
    bot.nextJump = now() + 1800;
  }
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, service: 'blox-dunya-multiplayer', build: BUILD, rooms: rooms.size }));
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(ROOT, `.${requested}`);
  if (file.startsWith(ROOT + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': pathname.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Not found');
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
    updateBot(room);
    for (const player of room.players.values()) {
      const gravity = room.event === 'low-gravity' ? 14 : 26;
      player.x = clamp(player.x + player.kx * TICK_MS / 1000, -28, 28);
      player.z = clamp(player.z + player.kz * TICK_MS / 1000, -28, 28);
      player.kx *= 0.84;
      player.kz *= 0.84;
      player.y += player.vy * TICK_MS / 1000;
      player.vy -= gravity * TICK_MS / 1000;
      if (player.y <= 1.5) { player.y = 1.5; player.vy = 0; }
    }
    broadcast(room, 'state', { players: roomState(room), revision: ++room.revision });
  }
}, TICK_MS);
server.listen(PORT, '0.0.0.0', () => console.log(`Blox Dunyo multiplayer server listening on ${PORT}`));
