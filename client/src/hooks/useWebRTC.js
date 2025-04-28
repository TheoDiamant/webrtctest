// src/hooks/useWebRTC.js
import { useEffect, useRef, useState } from "react";

export default function useWebRTC(
  callId,
  { start = false, isInitiator = false, localStream = null }
) {
  const [status, setStatus] = useState("waiting");
  const [chatMessages, setChatMessages] = useState([]);
  const [isChannelOpen, setIsChannelOpen] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // —————————————
  // 1) Détection de la voix locale
  useEffect(() => {
    if (!localStream) return;
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(localStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let rafId;

    const detect = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] - 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setLocalSpeaking(rms > 10);
      rafId = requestAnimationFrame(detect);
    };
    detect();

    return () => {
      cancelAnimationFrame(rafId);
      audioCtx.close();
    };
  }, [localStream]);

  // —————————————
  // 2) Signaling WebSocket & RTC
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
          if (msg.peers === 2 && status === "waiting") await _startCall();
          break;
        case "offer":
          await pcRef.current.setRemoteDescription(msg.offer);
          await _createAndSendAnswer();
          break;
        case "answer":
          await pcRef.current.setRemoteDescription(msg.answer);
          break;
        case "candidate":
          if (msg.candidate) await pcRef.current.addIceCandidate(msg.candidate);
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
  }, [callId, start, localStream, status]);

  async function _startCall() {
    if (!localStream) {
      console.warn("pas de MediaStream prêt");
      return;
    }
    setStatus("connecting");
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: process.env.REACT_APP_STUN_SERVER }],
    });
    pcRef.current = pc;

    // suivi du state
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("connected");
      else if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      )
        setStatus("peer-left");
      else if (pc.connectionState === "connecting")
        setStatus("connecting");
    };

    // ICE
    pc.onicecandidate = ({ candidate }) => {
      if (candidate)
        wsRef.current.send(JSON.stringify({ type: "candidate", candidate }));
    };

    // réception de l’audio distant + détection de voix
    pc.ontrack = ({ streams: [stream] }) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;

        // setup remote analyser
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let rafId;
        const detect = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = data[i] - 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setRemoteSpeaking(rms > 10);
          rafId = requestAnimationFrame(detect);
        };
        detect();

        // nettoyer si on quitte
        return () => {
          cancelAnimationFrame(rafId);
          audioCtx.close();
        };
      }
    };

    // envoi des pistes locales
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // data channel pour le chat
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

    // création de l’offre
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

  function _setupDataChannel(dc) {
    dc.onopen = () => setIsChannelOpen(true);
    dc.onclose = () => setIsChannelOpen(false);
    dc.onmessage = ({ data }) =>
      setChatMessages((m) => [...m, { sender: "peer", text: data }]);
  }

  function sendMessage(text) {
    setChatMessages((m) => [...m, { sender: "local", text }]);
    if (dcRef.current?.readyState === "open") dcRef.current.send(text);
  }

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
    localSpeaking,
    remoteSpeaking,
  };
}
