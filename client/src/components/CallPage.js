// src/pages/CallPage.jsx
import React, { useState } from "react";
import useWebRTC from "../hooks/useWebRTC";
import PrecallSplash from "../components/PrecallSplash";
import Chat from "../components/Chat";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import CallEndIcon from "@mui/icons-material/CallEnd";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

export default function CallPage({ callId }) {
  const params = new URLSearchParams(window.location.search);
  const isInitiator =
    params.get("initiator") === "true" ||
    sessionStorage.getItem("isInitiator") === "true";

  const [localStream, setLocalStream] = useState(null);
  const [splashDone, setSplashDone] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [muted, setMuted] = useState(false);

  const {
    remoteAudioRef,
    status,
    chatMessages,
    sendMessage,
    toggleMute,
    hangUp,
    isChannelOpen,
    localSpeaking,
    remoteSpeaking,
  } = useWebRTC(callId, {
    start: splashDone && !!localStream,
    isInitiator,
    localStream,
  });

  const handleJoin = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
      setSplashDone(true);
    } catch (err) {
      console.error("Permission micro refusée :", err);
      alert("Vous devez autoriser le micro pour rejoindre l’appel.");
    }
  };

  if (!splashDone) return <PrecallSplash onReady={handleJoin} />;

  return (
    <div className={`call-app${chatOpen ? " chat-open" : ""}`}>
      <header className="header">
        <span className="meeting-id">ID : {callId}</span>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={() => setChatOpen((o) => !o)}
          >
            <ChatBubbleOutlineIcon />
          </button>
        </div>
      </header>

      {isInitiator && (
        <div className="status-indicator">{status}</div>
      )}

      <main className="main-grid">
        {/* Local User */}
        <div className="video-card">
          <div className="pic-wrapper">
            <img
              className="profile-pic"
              src="/images/icon.png"
              alt="Vous"
            />
            {localSpeaking && <div className="wave" />}
            {muted && (
              <div className="mute-indicator">
                <MicOffIcon fontSize="small" />
              </div>
            )}
          </div>
          <div className="name">Vous</div>
          <button
            className="icon-btn mute-btn"
            onClick={() => {
              toggleMute();
              setMuted((m) => !m);
            }}
          >
            {muted ? <MicOffIcon /> : <MicIcon />}
          </button>
        </div>

        <div className="divider" />

        {/* Remote User */}
        <div className="video-card">
          <div className="pic-wrapper">
            <img
              className="profile-pic"
              src="/images/icon.png"
              alt="Interlocuteur"
            />
            {remoteSpeaking && <div className="wave" />}
          </div>
          <div className="name">Interlocuteur</div>
        </div>

        {chatOpen && (
          <aside className="chat-panel">
            <Chat
              messages={chatMessages}
              onSend={sendMessage}
              isChannelOpen={isChannelOpen}
            />
          </aside>
        )}
      </main>

      <footer className="controls">
        <button className="icon-btn hangup-btn" onClick={hangUp}>
          <CallEndIcon />
        </button>
      </footer>

      <audio
        ref={remoteAudioRef}
        autoPlay
        className="audio-player"
      />
    </div>
  );
}
