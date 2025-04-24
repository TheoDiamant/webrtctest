// src/hooks/useWebRTC.js
import { useEffect, useRef, useState } from "react";

export default function useWebRTC(
  callId,
  { timeout = 30000, start = true, isInitiator = false }
) {
  // --- refs & state ---
  const wsRef = useRef();
  const pcRef = useRef();
  const dataChannelRef = useRef();
  const remoteAudioRef = useRef();
  const localStreamRef = useRef();

  const [status, setStatus] = useState("waiting");
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const [chatMessages, setChatMessages] = useState([]);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);

  // --- SIGNALING WS SETUP ---
  useEffect(() => {
    if (!start) return;
    const serverUrl = process.env.REACT_APP_SERVER_URL;
    wsRef.current = new WebSocket(
      `${serverUrl.replace(/^http/, "ws")}?roomId=${callId}`
    );
    wsRef.current.onopen = () => console.log("WS open");
    wsRef.current.onclose = () => console.log("WS closed");

    wsRef.current.onmessage = async ({ data }) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "room-status":
          if (msg.peers === 2 && statusRef.current === "waiting") {
            await initiateCall(isInitiator);
          }
          break;
        case "offer":
          await pcRef.current.setRemoteDescription(msg.offer);
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
      }
    };

    const timer = setTimeout(() => {
      if (statusRef.current !== "connected") setStatus("timeout");
    }, timeout);

    return () => {
      clearTimeout(timer);
      wsRef.current?.close();
      pcRef.current?.close();
    };
  }, [callId, start, isInitiator]);

  // --- PEER CONNECTION SETUP ---
  async function initiateCall(isInitiator) {
    setStatus("connecting");
    pcRef.current = new RTCPeerConnection({
      iceServers: [{ urls: process.env.REACT_APP_STUN_SERVER }],
    });

    // local audio + speech detection
    localStreamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
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

    localStreamRef.current
      .getTracks()
      .forEach((t) => pcRef.current.addTrack(t, localStreamRef.current));

    // remote audio + speech & mute detection
    pcRef.current.ontrack = ({ streams: [stream] }) => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;

      // watch track mute/unmute events
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

    // data channel for chat + mute signaling
    if (isInitiator) {
      dataChannelRef.current = pcRef.current.createDataChannel("chat");
      setupDataChannel();
    } else {
      pcRef.current.ondatachannel = ({ channel }) => {
        dataChannelRef.current = channel;
        setupDataChannel();
      };
    }

    pcRef.current.onicecandidate = ({ candidate }) => {
      if (candidate)
        wsRef.current.send(JSON.stringify({ type: "candidate", candidate }));
    };

    if (isInitiator) {
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      wsRef.current.send(JSON.stringify({ type: "offer", offer }));
    }

    setStatus("connected");
  }

  function setupDataChannel() {
    dataChannelRef.current.onopen = () => console.log("DataChannel open");
    dataChannelRef.current.onmessage = ({ data }) => {
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        /* not JSON? */
      }
      // handle mute signaling
      if (parsed && parsed.type === "mute") {
        setRemoteMuted(parsed.muted);
        return;
      }
      // otherwise chat message
      setChatMessages((prev) => [...prev, { sender: "peer", text: data }]);
    };
  }

  // --- PUBLIC API ---
  function sendMessage(text) {
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(text);
      setChatMessages((prev) => [...prev, { sender: "local", text }]);
    }
  }

  function toggleMute() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    // flip track.enabled
    track.enabled = !track.enabled;
    // only the invitee sends their mute state to the host
    if (!isInitiator && dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(
        JSON.stringify({ type: "mute", muted: !track.enabled })
      );
    }
  }

  function hangUp() {
    if (isInitiator) {
      wsRef.current.send(JSON.stringify({ type: "end-call" }));
    }
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
  };
}
