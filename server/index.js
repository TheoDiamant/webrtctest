// server/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const { WebSocketServer } = WebSocket;
const { v4: uuidv4 } = require("uuid");

const app = express();

// CORS (autorise localhost et Render)
const allowedOrigins = [
  "http://localhost:3000",
  "https://webrtctest-ux3c.onrender.com",
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

// Auth (Basic)
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

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const rooms = {};

// server/index.js
wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.replace(/^.*\?/, ""));
  const callId = params.get("roomId");
  if (!callId) return ws.close();

  rooms[callId] = rooms[callId] || [];
  rooms[callId].push(ws);

  // informer du nb de pairs
  rooms[callId].forEach((c) =>
    c.send(JSON.stringify({ type: "room-status", peers: rooms[callId].length }))
  );

  ws.on("message", (msg) => {
    // msg est un Buffer ou une string, on parse d’abord
    let d;
    try {
      // si Buffer, toString() renvoie bien le JSON textuel
      const text = typeof msg === "string" ? msg : msg.toString();
      d = JSON.parse(text);
    } catch {
      return;
    }

    // types qu’on relaie
    if (["offer", "answer", "candidate", "end-call"].includes(d.type)) {
      rooms[callId].forEach((c) => {
        if (c === ws || c.readyState !== WebSocket.OPEN) return;

        if (d.type === "end-call") {
          // on notifie fin d’appel
          c.send(JSON.stringify({ type: "call-ended" }));
        } else {
          // on renvoie TOUJOURS une string JSON
          c.send(JSON.stringify(d));
        }
      });
    }
  });

  ws.on("close", () => {
    rooms[callId] = rooms[callId].filter((c) => c !== ws);
    rooms[callId].forEach((c) => {
      if (c.readyState === WebSocket.OPEN) {
        c.send(JSON.stringify({ type: "peer-left" }));
      }
    });
  });
});

// servir le build React
const buildPath = path.join(__dirname, "../client/build");
app.use(express.static(buildPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
