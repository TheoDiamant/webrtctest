// src/hooks/useWebRTC.js
import { useEffect, useRef, useState } from "react";

export default function useWebRTC(
  callId,
  { start = false, isInitiator = false, localStream = null }
) {
  const [status, setStatus] = useState("waiting"); // waiting → connecting → connected → peer-left → ended
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [isChannelOpen, setIsChannelOpen] = useState(false);

  // 1) Signaling WebSocket
  useEffect(() => {
    if (!start) return;
    const ws = new WebSocket(
      process.env.REACT_APP_SERVER_URL.replace(/^http/, "ws") +
        `?roomId=${callId}`
    );
    wsRef.current = ws;
    ws.onopen = () => console.log("WS ▶︎ open");
    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case "room-status":
          // Quand on a les deux et qu'on n'a pas encore démarré...
          if (msg.peers === 2 && status === "waiting") {
            await _startCall();
          }
          break;
        case "offer":
          await pcRef.current.setRemoteDescription(msg.offer);
          await _createAndSendAnswer();
          break;
        case "answer":
          await pcRef.current.setRemoteDescription(msg.answer);
          break;
        case "candidate":
          if (msg.candidate) {
            await pcRef.current.addIceCandidate(msg.candidate);
          }
          break;
        case "end-call":
          _hangUp();
          break;
      }
    };
    ws.onclose = () => console.log("WS ▶︎ closed");
    return () => {
      ws.close();
      pcRef.current?.close();
    };
    // On ne dépend pas de status ici pour ne pas recréer la WS
  }, [callId, start, localStream]);

  // 2) Création de la RTCPeerConnection + échange SDP/ICE
  async function _startCall() {
    if (!localStream) {
      console.warn("pas de MediaStream prêt, impossible de démarrer");
      return;
    }

    setStatus("connecting");
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: process.env.REACT_APP_STUN_SERVER }],
    });
    pcRef.current = pc;

    // a) suivi du connectionState
    pc.onconnectionstatechange = () => {
      console.log("PC state →", pc.connectionState);
      if (pc.connectionState === "connected") setStatus("connected");
      else if (pc.connectionState === "disconnected" || pc.connectionState === "failed")
        setStatus("peer-left");
      else if (pc.connectionState === "connecting") setStatus("connecting");
    };

    // b) ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        wsRef.current.send(JSON.stringify({ type: "candidate", candidate }));
      }
    };

    // c) réception de l’audio distant
    pc.ontrack = ({ streams: [stream] }) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
      }
    };

    // d) ajout des pistes locales
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // e) DataChannel
    if (isInitiator) {
      const dc = pc.createDataChannel("chat");
      dcRef.current = dc;
      _setupDataChannel(dc);
    } else {
      pc.ondatachannel = ({ channel }) => {
        dcRef.current = channel;
        _setupDataChannel(channel);
      };
    }

    // f) offer (si initiator)
    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current.send(JSON.stringify({ type: "offer", offer }));
    }
  }

  async function _createAndSendAnswer() {
    const pc = pcRef.current;
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsRef.current.send(JSON.stringify({ type: "answer", answer }));
  }

  // 3) Chat
  function _setupDataChannel(dc) {
    dc.onopen = () => setIsChannelOpen(true);
    dc.onclose = () => setIsChannelOpen(false);
    dc.onmessage = ({ data }) =>
      setChatMessages((m) => [...m, { sender: "peer", text: data }]);
  }

  function sendMessage(text) {
    setChatMessages((m) => [...m, { sender: "local", text }]);
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(text);
    }
  }

  // 4) utilitaires
  function toggleMute() {
    const t = localStream?.getAudioTracks()[0];
    if (t) t.enabled = !t;
  }

  function _hangUp() {
    setStatus("ended");
    localStream?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    wsRef.current.send(JSON.stringify({ type: "end-call" }));
    wsRef.current.close();
  }

  return {
    remoteAudioRef,
    status,
    chatMessages,
    sendMessage,
    toggleMute,
    hangUp: _hangUp,
    isChannelOpen,
  };
}
