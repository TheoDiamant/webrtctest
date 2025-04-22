import { useEffect, useRef, useState } from 'react';

export default function useWebRTC(callId, { timeout = 30000, start = true }) {
  const wsRef = useRef();
  const pcRef = useRef();
  const dataChannelRef = useRef();
  const remoteAudioRef = useRef();
  const localStreamRef = useRef();
  const [status, setStatus] = useState('waiting');
  const [chatMessages, setChatMessages] = useState([]);

  useEffect(() => {
    if (!start) return;
    const serverUrl = process.env.REACT_APP_SERVER_URL;
    wsRef.current = new WebSocket(`${serverUrl.replace(/^http/, 'ws')}?roomId=${callId}`);

    wsRef.current.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case 'room-status':
          if (msg.peers === 2 && status === 'waiting') {
            await initiateCall(true);
          }
          break;
        case 'offer':
          await pcRef.current.setRemoteDescription(msg.offer);
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          wsRef.current.send(JSON.stringify({ type: 'answer', answer }));
          break;
        case 'answer':
          await pcRef.current.setRemoteDescription(msg.answer);
          break;
        case 'candidate':
          await pcRef.current.addIceCandidate(msg.candidate);
          break;
        case 'peer-left':
          setStatus('peer-left');
          break;
        default:
          break;
      }
    };

    wsRef.current.onopen = () => console.log('WS open');
    wsRef.current.onclose = () => console.log('WS closed');

    async function initiateCall(isInitiator) {
      setStatus('connecting');
      pcRef.current = new RTCPeerConnection({ iceServers: [{ urls: process.env.REACT_APP_STUN_SERVER }] });
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current.getTracks().forEach(t => pcRef.current.addTrack(t, localStreamRef.current));
      pcRef.current.ontrack = ({ streams: [stream] }) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream; };

      if (isInitiator) {
        dataChannelRef.current = pcRef.current.createDataChannel('chat');
        setupDataChannel();
      } else {
        pcRef.current.ondatachannel = ({ channel }) => { dataChannelRef.current = channel; setupDataChannel(); };
      }

      pcRef.current.onicecandidate = ({ candidate }) => {
        if (candidate) wsRef.current.send(JSON.stringify({ type: 'candidate', candidate }));
      };

      if (isInitiator) {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        wsRef.current.send(JSON.stringify({ type: 'offer', offer }));
      }

      setStatus('connected');
    }

    function setupDataChannel() {
      dataChannelRef.current.onopen = () => console.log('DataChannel open');
      dataChannelRef.current.onmessage = ({ data }) => setChatMessages(prev => [...prev, { sender: 'peer', text: data }]);
    }

    const timer = setTimeout(() => { if (status !== 'connected') setStatus('timeout'); }, timeout);

    return () => {
      clearTimeout(timer);
      wsRef.current?.close();
      pcRef.current?.close();
    };
  }, [callId, start]);

  function sendMessage(text) {
    if (dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(text);
      setChatMessages(prev => [...prev, { sender: 'local', text }]);
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
    setStatus('ended');
  }

  return { remoteAudioRef, status, chatMessages, sendMessage, toggleMute, hangUp };
}