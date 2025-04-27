// src/hooks/useWebRTC.js
import { useEffect, useRef, useState } from "react";

export default function useWebRTC(
  callId,
  { timeout = 30000, start = true, isInitiator = false }
) {
  const [status, setStatus] = useState("waiting");
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const wsRef = useRef();
  const pcRef = useRef();
  const dataChannelRef = useRef();
  const remoteAudioRef = useRef();
  const localStreamRef = useRef();
  const remoteStreamRef = useRef(new MediaStream());

  const [chatMessages, setChatMessages] = useState([]);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [isChannelOpen, setIsChannelOpen] = useState(false);

  // 1) Signaling via WebSocket
  useEffect(() => {
    if (!start) return;

    wsRef.current = new WebSocket(
      `${process.env.REACT_APP_SERVER_URL.replace(/^http/, "ws")}?roomId=${callId}`
    );
    wsRef.current.onopen = () =>
      console.log("WS open", new Date());
    wsRef.current.onclose = () =>
      console.log("WS closed", new Date());

    wsRef.current.onmessage = async ({ data }) => {
      const text = data instanceof Blob ? await data.text() : data;
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        console.warn("WS: message non JSON reçu", text);
        return;
      }

      switch (msg.type) {
        case "room-status":
          console.log("room-status:", msg.peers);
          if (msg.peers === 2 && statusRef.current === "waiting") {
            // première arrivée du peer
            await initiateCall(isInitiator);
          } else if (
            msg.peers === 2 &&
            statusRef.current === "peer-left"
          ) {
            // peer revient après être parti
            setStatus("connecting");
            await initiateCall(isInitiator);
          } else if (
            msg.peers === 1 &&
            statusRef.current === "connected"
          ) {
            // peer a quitté
            console.log("Peer left → nettoyage");
            setStatus("peer-left");
            pcRef.current?.close();
            remoteStreamRef.current = new MediaStream();
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = null;
            }
            setIsChannelOpen(false);
          }
          break;

        case "offer":
          await pcRef.current.setRemoteDescription(msg.offer);
          pcRef.current.getTransceivers().forEach((t) => {
            if (t.receiver.track?.kind === "audio") t.direction = "sendrecv";
          });
          {
            const answer = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(answer);
            wsRef.current.send(JSON.stringify({ type: "answer", answer }));
          }
          break;

        case "answer":
          await pcRef.current.setRemoteDescription(msg.answer);
          break;

        case "candidate":
          await pcRef.current.addIceCandidate(msg.candidate);
          break;

        case "peer-left":
          setStatus("peer-left");
          break;

        case "call-ended":
          setStatus("ended");
          break;

        default:
          break;
      }
    };

    return () => {
      wsRef.current?.close();
      pcRef.current?.close();
    };
  }, [callId, start, isInitiator]);

  // 2) WebRTC peer connection & media
  async function initiateCall(isInitiator) {
    setStatus("connecting");
    pcRef.current = new RTCPeerConnection({
      iceServers: [{ urls: process.env.REACT_APP_STUN_SERVER }],
    });
    pcRef.current.oniceconnectionstatechange = () =>
      console.log("ICE:", pcRef.current.iceConnectionState);
    pcRef.current.onconnectionstatechange = () =>
      console.log("PC:", pcRef.current.connectionState);

    // 2.1) getUserMedia
    localStreamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    localStreamRef.current.getTracks().forEach((t) =>
      pcRef.current.addTrack(t, localStreamRef.current)
    );

    // 2.2) ajouter l’audio distant
    pcRef.current.ontrack = (event) => {
      // ajouter chaque piste au remoteStream
      remoteStreamRef.current.addTrack(event.track);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
      }
      event.track.onmute = () => setRemoteMuted(true);
      event.track.onunmute = () => setRemoteMuted(false);

      // animation voix distante
      if (!remoteSpeaking) {
        const ctx = new (window.AudioContext ||
          window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        ctx.createMediaStreamSource(remoteStreamRef.current).connect(analyser);
        analyser.fftSize = 256;
        const data = new Uint8Array(analyser.frequencyBinCount);
        (function detect() {
          analyser.getByteFrequencyData(data);
          setRemoteSpeaking(
            data.reduce((s, v) => s + v, 0) / data.length > 30
          );
          requestAnimationFrame(detect);
        })();
      }
    };

    // 3) DataChannel chat
    if (isInitiator) {
      dataChannelRef.current = pcRef.current.createDataChannel("chat");
      setupDataChannel();
    } else {
      pcRef.current.ondatachannel = ({ channel }) => {
        dataChannelRef.current = channel;
        setupDataChannel();
      };
    }

    // 4) ICE
    pcRef.current.onicecandidate = ({ candidate }) => {
      if (candidate)
        wsRef.current.send(JSON.stringify({ type: "candidate", candidate }));
    };

    // 5) Offer/Answer
    if (isInitiator) {
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      wsRef.current.send(JSON.stringify({ type: "offer", offer }));
    }

    setStatus("connected");
  }

  function setupDataChannel() {
    dataChannelRef.current.onopen = () => setIsChannelOpen(true);
    dataChannelRef.current.onclose = () => setIsChannelOpen(false);
    dataChannelRef.current.onmessage = ({ data }) =>
      setChatMessages((p) => [...p, { sender: "peer", text: data }]);
  }

  function sendMessage(text) {
    setChatMessages((p) => [...p, { sender: "local", text }]);
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(text);
    }
  }

  function toggleMute() {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) t.enabled = !t.enabled;
  }

  function hangUp() {
    if (isInitiator) {
      wsRef.current.send(JSON.stringify({ type: "end-call" }));
    }
    setStatus("ended");
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    remoteStreamRef.current = new MediaStream();
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setTimeout(() => {
      wsRef.current?.close();
      pcRef.current?.close();
    }, 100);
  }

  return {
    remoteAudioRef,
    status,
    chatMessages,
    sendMessage,
    toggleMute,
    hangUp,
    localSpeaking,
    remoteSpeaking,
    remoteMuted,
    isChannelOpen,
  };
}
