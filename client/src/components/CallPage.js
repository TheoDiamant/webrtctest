// src/pages/CallPage.jsx
import React, { useState } from "react";
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
  const [splashDone, setSplashDone] = useState(isInitiator);
  const [muted, setMuted] = useState(false);

  const {
    remoteAudioRef,
    status,
    hangUp,
    toggleMute,
    localSpeaking,
    remoteSpeaking,
    remoteMuted,
  } = useWebRTC(callId, {
    start: splashDone && !!localStream,
    isInitiator,
    localStream,
  });

  // 1) On récupère le micro puis on démarre la session
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

  // 2) Splash avant join
  if (!splashDone) {
    return <PrecallSplash onReady={handleJoin} />;
  }

  // 3) UI principale
  return (
    <div className="call-app dark">
      <header className="header">
        <span className="meeting-id">ID : {callId}</span>
      </header>

      {isInitiator && (
        <div className="status-indicator">
          {status === "waiting" && "En attente de l’autre personne…"}
          {status === "connecting" && "Connexion en cours…"}
          {status === "connected" && "Interlocuteur connecté !"}
          {status === "peer-left" && "L’autre personne a quitté"}
          {status === "ended" && "Appel terminé"}
        </div>
      )}

      <main className="main-grid">
        {/* Votre carte */}
        <div className="video-card">
          {muted && (
            <div className="mute-indicator local">
              <MicOffIcon fontSize="small" /> Muet
            </div>
          )}
          <div className="pic-wrapper">
            <img
              src="/images/icon.png"
              alt="Vous"
              className="profile-pic"
            />
            {localSpeaking && <div className="wave" />}
          </div>
          <span className="name">Vous</span>
        </div>

        <div className="divider" />

        {/* Carte de l’interlocuteur */}
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
      </main>

      <footer className="controls">
        <button
          className="icon-btn mute-btn"
          onClick={() => {
            toggleMute();
            setMuted((m) => !m);
          }}
        >
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

      {/* Audio distant */}
      <audio ref={remoteAudioRef} autoPlay className="audio-player" />
    </div>
  );
}
