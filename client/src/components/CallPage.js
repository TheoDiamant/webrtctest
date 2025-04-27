import React, { useState, useEffect } from "react";
import useWebRTC from "../hooks/useWebRTC";
import Chat from "./Chat";
import PrecallSplash from "./PrecallSplash";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import CallEndIcon from "@mui/icons-material/CallEnd";

export default function CallPage({ callId }) {
  const params = new URLSearchParams(window.location.search);
  const isInitiator =
    params.get("initiator") === "true" ||
    sessionStorage.getItem("isInitiator") === "true";

  // invitees see a splash first
  const [splashDone, setSplashDone] = useState(isInitiator);
  const [chatOpen, setChatOpen] = useState(false);
  const [muted, setMuted] = useState(false);

  const {
    remoteAudioRef,
    status,
    chatMessages,
    sendMessage,
    toggleMute,
    hangUp,
    localSpeaking,
    remoteSpeaking,
    remoteMuted,
  } = useWebRTC(callId, {
    start: splashDone,
    timeout: 30000,
    isInitiator,
  });

  const [msg, setMsg] = useState("");
  const fullLink = window.location.href;

  // play tones / navigate home after hangup
  useEffect(() => {
    function goHome() {
      window.location.href = "/";
    }
    if (status === "connected") {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 440;
      osc.connect(ctx.destination);
      osc.start();
      setTimeout(() => osc.stop(), 200);
    }
    if (status === "peer-left" || status === "ended") {
      new Audio("/sounds/skype-hangup.mp3").play();
      // only auto-exit guest
      if (!isInitiator) setTimeout(goHome, 2000);
      // host stays, but call-ended will redirect anyway
    }
  }, [status, isInitiator]);

  const handleMute = () => {
    toggleMute();
    setMuted((m) => !m);
  };

  // 1) show splash for invitees
  if (!splashDone) {
    return <PrecallSplash onReady={() => setSplashDone(true)} />;
  }

  // 2) main UI
  return (
    <div className={`call-app dark${chatOpen ? " chat-open" : ""}`}>
      <header className="header">
        <span className="meeting-id">ID : {callId}</span>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={() => {
              setChatOpen((o) => !o);
              // dès que l'utilisateur tape, on débloque la lecture audio
              if (remoteAudioRef.current) {
                remoteAudioRef.current.play().catch(() => {
                  /* silent */
                });
                // maintenant on peut enlever le muted
                remoteAudioRef.current.muted = false;
              }
            }}
          >
            <ChatBubbleOutlineIcon fontSize="small" />
          </button>
        </div>
      </header>

      {/* only host sees status */}
      {isInitiator && (
        <div className="status-indicator">
          {status === "waiting" && "En attente de l’autre personne…"}
          {status === "connecting" && "Connexion en cours…"}
          {status === "connected" && "Interlocuteur connecté !"}
          {status === "timeout" && "Temps d’attente dépassé"}
          {status === "peer-left" && "L’autre personne a quitté"}
          {status === "ended" && "Appel terminé"}
        </div>
      )}

      <main className="main-grid">
        {/* Local card */}
        <div className="video-card">
          {muted && (
            <div className="mute-indicator local">
              <MicOffIcon fontSize="small" /> Muet
            </div>
          )}
          <div className="pic-wrapper">
            <img src="/images/icon.png" alt="Vous" className="profile-pic" />
            {localSpeaking && <div className="wave" />}
          </div>
          <span className="name">Vous</span>
        </div>

        <div className="divider" />

        {/* Remote card */}
        <div className="video-card">
          {remoteMuted && (
            <div className="mute-indicator remote">
              <MicOffIcon fontSize="small" /> Muet
            </div>
          )}
          <div className="pic-wrapper">
            <img
              src="/images/icon.png"
              alt="Interlocuteur"
              className="profile-pic"
            />
            {remoteSpeaking && <div className="wave" />}
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
            isInitiator={isInitiator}
          />
        </aside>
      </main>

      <footer className="controls">
        <button className="icon-btn mute-btn" onClick={handleMute}>
          {muted ? (
            <MicOffIcon fontSize="large" />
          ) : (
            <MicIcon fontSize="large" />
          )}
        </button>
        <button className="icon-btn hangup-btn" onClick={hangUp}>
          <CallEndIcon fontSize="large" />
        </button>
      </footer>

      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        muted
        className="audio-player"
      />
    </div>
  );
}
