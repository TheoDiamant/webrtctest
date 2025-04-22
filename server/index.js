// server/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");
const { v4: uuidv4 } = require("uuid");

const app = express();

// CORS (autorise ton front Render et localhost)
const allowedOrigins = [
  "http://localhost:3000",
  "https://webrtctest-ux3c.onrender.com", // **le bon domaine** ici
];
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
      callback(new Error(`Origin ${origin} non autorisée`));
    },
  })
);
app.options("*", cors());
app.use(express.json());

// --- ROUTE API protégée ---
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).send("Unauthorized");
  const [scheme, encoded] = h.split(" ");
  if (scheme !== "Basic" || !encoded)
    return res.status(401).send("Unauthorized");
  const [u, p] = Buffer.from(encoded, "base64").toString().split(":");
  if (u === process.env.USERNAME && p === process.env.PASSWORD) return next();
  return res.status(403).send("Forbidden");
}

app.post("/create-call", auth, (req, res) => {
  res.json({ callId: uuidv4() });
});

// --- WEBSOCKET SIGNALING ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const rooms = {};

wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.replace(/^.*\?/, ""));
  const callId = params.get("roomId");
  if (!callId) return ws.close();

  rooms[callId] = rooms[callId] || [];
  rooms[callId].push(ws);

  // informe du nb de pairs
  rooms[callId].forEach((c) =>
    c.send(JSON.stringify({ type: "room-status", peers: rooms[callId].length }))
  );

// server/index.js (dans wss.on('connection'))
ws.on('message', msg => {
    // msg peut être string ou Buffer
    const text = typeof msg === 'string' ? msg : msg.toString();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return; // ignore tout ce qui n'est pas du JSON valide
    }
    if (['offer','answer','candidate'].includes(data.type)) {
      rooms[callId].forEach(client => {
        if (client !== ws && client.readyState === client.OPEN) {
          client.send(text);  // envoie toujours du texte
        }
      });
    }
  });
  ws.on("close", () => {
    rooms[callId] = rooms[callId].filter((c) => c !== ws);
    rooms[callId].forEach((c) => {
      if (c.readyState === c.OPEN)
        c.send(JSON.stringify({ type: "peer-left" }));
    });
  });
});

// --- SERVIR LE BUILD REACT ---
const buildPath = path.join(__dirname, "../client/build");
app.use(express.static(buildPath));

// Fallback pour toutes les routes non-API : renvoie index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

// --- LANCEMENT DU SERVEUR ---
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
