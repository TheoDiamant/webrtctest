// src/hooks/useWebRTC.js
import { useEffect, useRef, useState } from "react";

export default function useWebRTC(
  callId,
  { timeout = 30000, start = true, isInitiator = false }
) {
  const wsRef = useRef();
  const pcRef = useRef();
  const dataChannelRef = useRef();
  const remoteAudioRef = useRef();
  const localStreamRef = useRef();

  const [status, setStatus] = useState("waiting");
  const [chatMessages, setChatMessages] = useState([]);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);

  useEffect(() => {
    if (!start) return;
    // open WebSocket to signaling server
    const serverUrl = process.env.REACT_APP_SERVER_URL;
    wsRef.current = new WebSocket(
      `${serverUrl.replace(/^http/, "ws")}?roomId=${callId}`
    );

    wsRef.current.onopen = () => console.log("WS open");
    wsRef.current.onclose = () => console.log("WS closed");

    wsRef.current.onmessage = async ({ data }) => {
      // normalize to string
      const text = typeof data === "string" ? data : data.toString();
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return; // ignore non-JSON blobs
      }

      switch (msg.type) {
        case "room-status":
          if (msg.peers === 2 && status === "waiting") {
            // seul l'initiateur fera l'offre, l'autre préparera sans offrir
            await initiateCall(isInitiator);
          }
          break;

        case "offer":
          await pcRef.current.setRemoteDescription(msg.offer);
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          wsRef.current.send(JSON.stringify({ type: "answer", answer }));
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
      }
    };

    async function initiateCall(isInitiator) {
      setStatus("connecting");
      // create peer connection
      pcRef.current = new RTCPeerConnection({
        iceServers: [{ urls: process.env.REACT_APP_STUN_SERVER }],
      });

      // get local audio stream
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // --- LOCAL SPEECH DETECTION ---
      const audioCtxLocal = new (window.AudioContext ||
        window.webkitAudioContext)();
      // ensure AudioContext is running
      audioCtxLocal.resume().catch(() => {});
      const analyserLocal = audioCtxLocal.createAnalyser();
      const srcLocal = audioCtxLocal.createMediaStreamSource(
        localStreamRef.current
      );
      srcLocal.connect(analyserLocal);
      analyserLocal.fftSize = 256;
      const dataArrayLocal = new Uint8Array(analyserLocal.frequencyBinCount);

      function detectLocal() {
        analyserLocal.getByteFrequencyData(dataArrayLocal);
        const avg =
          dataArrayLocal.reduce((sum, v) => sum + v, 0) / dataArrayLocal.length;
        setLocalSpeaking(avg > 30);
        requestAnimationFrame(detectLocal);
      }
      detectLocal();

      // add tracks to peer
      localStreamRef.current
        .getTracks()
        .forEach((t) => pcRef.current.addTrack(t, localStreamRef.current));

      // --- REMOTE SPEECH DETECTION on first track + force playback ---
      pcRef.current.ontrack = ({ streams: [stream] }) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          // force playback in case autoplay is blocked
          remoteAudioRef.current
            .play()
            .catch((err) => console.warn("Lecture auto bloquée :", err));
        }

        // once remote stream arrives, set up analyser once
        if (!remoteSpeaking) {
          const audioCtxRemote = new (window.AudioContext ||
            window.webkitAudioContext)();
          audioCtxRemote.resume().catch(() => {});
          const analyserRemote = audioCtxRemote.createAnalyser();
          const srcRemote = audioCtxRemote.createMediaStreamSource(stream);
          srcRemote.connect(analyserRemote);
          analyserRemote.fftSize = 256;
          const dataArrayRemote = new Uint8Array(
            analyserRemote.frequencyBinCount
          );

          function detectRemote() {
            analyserRemote.getByteFrequencyData(dataArrayRemote);
            const avgR =
              dataArrayRemote.reduce((sum, v) => sum + v, 0) /
              dataArrayRemote.length;
            setRemoteSpeaking(avgR > 30);
            requestAnimationFrame(detectRemote);
          }
          detectRemote();
        }
      };

      // set up data channel
      if (isInitiator) {
        dataChannelRef.current = pcRef.current.createDataChannel("chat");
        setupDataChannel();
      } else {
        pcRef.current.ondatachannel = ({ channel }) => {
          dataChannelRef.current = channel;
          setupDataChannel();
        };
      }

      // ICE candidates
      pcRef.current.onicecandidate = ({ candidate }) => {
        if (candidate)
          wsRef.current.send(JSON.stringify({ type: "candidate", candidate }));
      };

      // offer/answer exchange
      if (isInitiator) {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        wsRef.current.send(JSON.stringify({ type: "offer", offer }));
      }

      setStatus("connected");
    }

    function setupDataChannel() {
      dataChannelRef.current.onopen = () => console.log("DataChannel open");
      dataChannelRef.current.onmessage = ({ data }) =>
        setChatMessages((prev) => [...prev, { sender: "peer", text: data }]);
    }

    // timeout if not connected
    const timer = setTimeout(() => {
      if (status !== "connected") setStatus("timeout");
    }, timeout);

    return () => {
      clearTimeout(timer);
      wsRef.current?.close();
      pcRef.current?.close();
    };
  }, [callId, start]);

  function sendMessage(text) {
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(text);
      setChatMessages((prev) => [...prev, { sender: "local", text }]);
    }
  }

  function toggleMute() {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      track.enabled = !track.enabled;
    }
  }

  function hangUp() {
    wsRef.current.close();
    pcRef.current.close();
    setStatus("ended");
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
  };
}
