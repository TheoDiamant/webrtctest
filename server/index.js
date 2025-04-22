require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();

const allowedOrigins = [
    'http://localhost:3000',
    'https://webrtctest-ux3c.onrender.com',   // si tu testes depuis là
    'https://webrtctest-12.onrender.com'      // ton front réellement en prod
  ];
  
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} non autorisée`));
      }
    }
  }));
  app.options('*', cors());

app.use(express.json());

// Auth middleware
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send('Unauthorized');
  const [scheme, encoded] = authHeader.split(' ');
  if (scheme !== 'Basic' || !encoded) return res.status(401).send('Unauthorized');
  const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
  if (user === process.env.USERNAME && pass === process.env.PASSWORD) return next();
  return res.status(403).send('Forbidden');
}

app.post('/create-call', auth, (req, res) => {
  const callId = uuidv4();
  res.json({ callId });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const rooms = {};

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.replace(/^.*\?/, ''));
  const callId = params.get('roomId');
  if (!callId) { ws.close(); return; }

  rooms[callId] = rooms[callId] || [];
  rooms[callId].push(ws);

  const peers = rooms[callId].length;
  rooms[callId].forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ type: 'room-status', peers }));
    }
  });

  ws.on('message', msg => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
    if (['offer','answer','candidate'].includes(data.type)) {
      rooms[callId].forEach(client => {
        if (client !== ws && client.readyState === client.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    }
  });

  ws.on('close', () => {
    rooms[callId] = rooms[callId].filter(c => c !== ws);
    rooms[callId].forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'peer-left' }));
      }
    });
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));