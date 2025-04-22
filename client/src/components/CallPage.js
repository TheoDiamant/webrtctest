// src/components/CallPage.jsx
import React, { useState, useEffect } from "react";
import useWebRTC from "../hooks/useWebRTC";
import Chat from "./Chat";

export default function CallPage({ callId }) {
  // initiator flag
  const params = new URLSearchParams(window.location.search);
  const urlInit = params.get("initiator") === "true";
  const sessInit = sessionStorage.getItem("isInitiator") === "true";
  const isInitiator = urlInit || sessInit;

  const [accepted, setAccepted] = useState(isInitiator);
  const [chatOpen, setChatOpen] = useState(false);

  const {
    remoteAudioRef,
    status,
    chatMessages,
    sendMessage,
    toggleMute,
    hangUp,
  } = useWebRTC(callId, { start: accepted, timeout: 30000 });

  const [msg, setMsg] = useState("");
  const fullLink = window.location.href;

  function playBeep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 440;
    o.connect(ctx.destination);
    o.start();
    setTimeout(() => o.stop(), 200);
  }
  function playHangup() {
    new Audio("/sounds/skype-hangup.mp3").play();
  }

  useEffect(() => {
    if (status === "connected") playBeep();
    if (status === "peer-left" || status === "ended") {
      playHangup();
      setTimeout(() => (window.location.href = "/"), 2000);
    }
  }, [status]);

  if (!accepted) {
    return (
      <div className="call-app call-incoming">
        <header className="header">
          <h3>Appel entrant</h3>
        </header>
        <div className="incoming-actions">
          <button className="btn accept" onClick={() => setAccepted(true)}>
            <i className="material-icons">call</i> Décrocher
          </button>
          <button className="btn reject" onClick={() => (window.location.href = "/")}>
            <i className="material-icons">call_end</i> Raccrocher
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`call-app${chatOpen ? " chat-open" : ""}`}>
      <header className="header">
        <span className="meeting-id">ID de réunion : {callId}</span>
        <div className="header-actions">
          <button className="copy-btn" onClick={() => navigator.clipboard.writeText(fullLink)}>
            <i className="material-icons">content_copy</i>
          </button>
          <button className="chat-toggle-btn" onClick={() => setChatOpen(o => !o)}>
            <i className="material-icons">chat_bubble_outline</i>
          </button>
        </div>
      </header>

      <main className="main-grid">
        <div className="video-card">
          <div className="pic-wrapper">
            <img src="/images/icon.png" alt="Vous" className="profile-pic" />
            <div className="wave"></div>
          </div>
          <span className="name">Vous</span>
        </div>

        <div className="divider" />

        <div className="video-card">
          <div className="pic-wrapper">
            <img src="/images/icon.png" alt="Interlocuteur" className="profile-pic" />
            <div className="wave"></div>
          </div>
          <span className="name">Interlocuteur</span>
        </div>

        <aside className="chat-panel">
          <Chat
            messages={chatMessages}
            message={msg}
            setMessage={setMsg}
            onSend={() => {
              sendMessage(msg);
              setMsg("");
            }}
          />
        </aside>
      </main>

      <footer className="controls">
        <button className="btn mute-btn" onClick={toggleMute}>
          <i className="material-icons">mic</i>
        </button>
        <button className="btn hangup-btn" onClick={hangUp}>
          <i className="material-icons">call_end</i>
        </button>
      </footer>

      <audio ref={remoteAudioRef} autoPlay hidden />
    </div>
  );
}
