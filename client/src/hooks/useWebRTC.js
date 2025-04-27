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

  const [chatMessages, setChatMessages] = useState([]);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [isChannelOpen, setIsChannelOpen] = useState(false);

  // 1) Signaling via WebSocket
  // 1) Signaling via WebSocket
  useEffect(() => {
    if (!start) return;

    const serverUrl = process.env.REACT_APP_SERVER_URL;
    wsRef.current = new WebSocket(
      `${serverUrl.replace(/^http/, "ws")}?roomId=${callId}`
    );
    wsRef.current.onopen = () =>
      console.log("%cWS open", "color:green;font-weight:bold;", new Date());
    wsRef.current.onclose = () =>
      console.log("%cWS closed", "color:gray;font-weight:bold;", new Date());

    wsRef.current.onmessage = async ({ data }) => {
      // Blob → texte
      let text = data instanceof Blob ? await data.text() : data;
      console.log("%cWS ←", "color:purple;", text);

      // JSON.parse
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        console.warn("WS: message non JSON reçu", text);
        return;
      }
      console.log("%cSignal→", "color:blue;", msg.type, msg);

      switch (msg.type) {
        case "room-status":
          console.log("room-status:", msg.peers);
          if (msg.peers === 2 && statusRef.current === "waiting") {
            await initiateCall(isInitiator);
          }
          break;
        case "offer":
          console.log("received OFFER", msg.offer);
          await pcRef.current.setRemoteDescription(msg.offer);
          {
            const answer = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(answer);
            wsRef.current.send(JSON.stringify({ type: "answer", answer }));
          }
          break;
        case "answer":
          console.log("received ANSWER", msg.answer);
          await pcRef.current.setRemoteDescription(msg.answer);
          break;
        case "candidate":
          console.log("received CANDIDATE", msg.candidate);
          await pcRef.current.addIceCandidate(msg.candidate);
          break;
        case "peer-left":
          console.log("peer-left");
          setStatus("peer-left");
          break;
        case "call-ended":
          console.log("call-ended");
          setStatus("ended");
          break;
        default:
          break;
      }
    };

    // cleanup : on ferme juste les connexions
    return () => {
      wsRef.current?.close();
      pcRef.current?.close();
    };
  }, [callId, start, isInitiator]);

  // 2) WebRTC peer connection & media
  async function initiateCall(isInitiator) {
    console.log("%c⏱ initiateCall()", "color:orange;", { isInitiator });
    setStatus("connecting");

    pcRef.current = new RTCPeerConnection({
      iceServers: [{ urls: process.env.REACT_APP_STUN_SERVER }],
    });
    pcRef.current.onconnectionstatechange = () =>
      console.log("PC connectionState:", pcRef.current.connectionState);
    pcRef.current.oniceconnectionstatechange = () =>
      console.log("PC iceConnectionState:", pcRef.current.iceConnectionState);

    // 2.1) récupérer l’audio local
    localStreamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    console.log("got localStream:", localStreamRef.current);

    // 2.2) détection de voix locale (animation)
    const audioCtxL = new (window.AudioContext || window.webkitAudioContext)();
    const analyserL = audioCtxL.createAnalyser();
    const srcL = audioCtxL.createMediaStreamSource(localStreamRef.current);
    srcL.connect(analyserL);
    analyserL.fftSize = 256;
    const dataL = new Uint8Array(analyserL.frequencyBinCount);
    (function detectLocal() {
      analyserL.getByteFrequencyData(dataL);
      setLocalSpeaking(
        dataL.reduce((sum, v) => sum + v, 0) / dataL.length > 30
      );
      requestAnimationFrame(detectLocal);
    })();

    // 2.3) ajout des pistes au PeerConnection
    localStreamRef.current.getTracks().forEach((t) => {
      console.log("addTrack:", t.kind);
      pcRef.current.addTrack(t, localStreamRef.current);
    });

    // 2.4) réception et affichage de l’audio distant
    pcRef.current.ontrack = ({ streams: [stream] }) => {
      console.log("%cPC ontrack →", "color:teal;", stream);
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;

      const rt = stream.getAudioTracks()[0];
      if (rt) {
        rt.onmute = () => setRemoteMuted(true);
        rt.onunmute = () => setRemoteMuted(false);
      }

      if (!remoteSpeaking) {
        const audioCtxR = new (window.AudioContext ||
          window.webkitAudioContext)();
        const analyserR = audioCtxR.createAnalyser();
        const srcR = audioCtxR.createMediaStreamSource(stream);
        srcR.connect(analyserR);
        analyserR.fftSize = 256;
        const dataR = new Uint8Array(analyserR.frequencyBinCount);
        (function detectRemote() {
          analyserR.getByteFrequencyData(dataR);
          setRemoteSpeaking(
            dataR.reduce((sum, v) => sum + v, 0) / dataR.length > 30
          );
          requestAnimationFrame(detectRemote);
        })();
      }
    };

    // 3) DataChannel pour le chat
    if (isInitiator) {
      console.log("creating DataChannel as initiator");
      dataChannelRef.current = pcRef.current.createDataChannel("chat");
      setupDataChannel();
    } else {
      pcRef.current.ondatachannel = ({ channel }) => {
        console.log("ondatachannel → received channel", channel);
        dataChannelRef.current = channel;
        setupDataChannel();
      };
    }

    // 4) échange ICE
    pcRef.current.onicecandidate = ({ candidate }) => {
      console.log("onicecandidate → send", candidate);
      if (candidate) {
        wsRef.current.send(JSON.stringify({ type: "candidate", candidate }));
      }
    };

    // 5) negotiation offer/answer
    if (isInitiator) {
      const offer = await pcRef.current.createOffer();
      console.log("created OFFER", offer);
      await pcRef.current.setLocalDescription(offer);
      wsRef.current.send(JSON.stringify({ type: "offer", offer }));
    }

    setStatus("connected");
    console.log("status → connected");
  }

  function setupDataChannel() {
    dataChannelRef.current.onopen = () => {
      console.log("%cDataChannel open", "color:green;", dataChannelRef.current);
      setIsChannelOpen(true);
    };
    dataChannelRef.current.onclose = () => {
      console.log("%cDataChannel closed", "color:red;", dataChannelRef.current);
      setIsChannelOpen(false);
    };
    dataChannelRef.current.onmessage = ({ data }) => {
      console.log("%cDataChannel ← peer:", "color:purple;", data);
      setChatMessages((prev) => [...prev, { sender: "peer", text: data }]);
    };
  }

  // Envoi d’un message (chat)
  function sendMessage(text) {
    console.log(
      "sendMessage() →",
      text,
      "DCstate:",
      dataChannelRef.current?.readyState
    );
    setChatMessages((prev) => [...prev, { sender: "local", text }]);

    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(text);
    } else {
      console.warn("DataChannel pas open, message pas envoyé au pair :", text);
    }
  }

  function toggleMute() {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) t.enabled = !t;
  }

  function hangUp() {
    if (isInitiator) {
      wsRef.current.send(JSON.stringify({ type: "end-call" }));
    }
    console.log("hangUp()");
    setStatus("ended");
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
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
