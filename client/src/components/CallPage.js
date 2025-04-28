// src/pages/CallPage.jsx
import React, { useState, useEffect } from "react";
import useWebRTC from "../hooks/useWebRTC";
import PrecallSplash from "../components/PrecallSplash";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import CallEndIcon from "@mui/icons-material/CallEnd";

export default function CallPage({ callId }) {
  const params = new URLSearchParams(window.location.search);
  const isInitiator =
    params.get("initiator") === "true" ||
    sessionStorage.getItem("isInitiator") === "true";

  const [localStream, setLocalStream] = useState(null);
  const [splashDone, setSplashDone] = useState(false);
  const [muted, setMuted] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [duration, setDuration] = useState(null);

  const { remoteAudioRef, status, toggleMute, hangUp } = useWebRTC(
    callId,
    {
      start: splashDone && !!localStream,
      isInitiator,
      localStream,
    }
  );

  // On démarre le chrono dès qu'on est connecté
  useEffect(() => {
    if (status === "connected") {
      setStartTime(Date.now());
    }
    if (status === "ended" && startTime) {
      const diff = Date.now() - startTime;
      const min = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setDuration(`${min} min ${sec} s`);
    }
  }, [status]);

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

  // Si l’appel est terminé, on affiche l’écran dédié
  if (status === "ended") {
    return (
      <div className="ended-container">
        <h2>🔒 Votre réunion est terminée</h2>
        {duration && <p>Durée : {duration}</p>}
      </div>
    );
  }

  if (!splashDone) {
    return <PrecallSplash onReady={handleJoin} />;
  }

  return (
    <div className="call-app">
      <header className="header">
        <span className="meeting-id">ID : {callId}</span>
      </header>

      {isInitiator && <div className="status-indicator">{status}</div>}

      <main className="main-grid">
        {/* Vous */}
        <div className="video-card">
          <div className="avatar-wrapper">
            <img src="/images/icon.png" alt="Vous" className="avatar" />
          </div>
          <div className="name">Vous</div>
        </div>

        <div className="divider" />

        {/* Interlocuteur */}
        <div className="video-card">
          <div className="avatar-wrapper">
            <img
              src="/images/icon.png"
              alt="Interlocuteur"
              className="avatar"
            />
          </div>
          <div className="name">Interlocuteur</div>
        </div>
      </main>

      <footer className="controls">
        <button
          className="icon-btn mute-btn"
          onClick={() => {
            toggleMute();
            setMuted((m) => !m);
          }}
        >
          {muted ? <MicOffIcon /> : <MicIcon />}
        </button>
        <button className="icon-btn hangup-btn" onClick={hangUp}>
          <CallEndIcon />
        </button>
      </footer>

      <audio ref={remoteAudioRef} autoPlay className="audio-player" />
    </div>
  );
}
