// src/pages/CallPage.jsx
import React, { useState, useEffect } from "react";
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
  } = useWebRTC(callId, {
    start: splashDone && !!localStream,
    isInitiator,
    localStream,
  });

  // Quand l’utilisateur clique sur « Rejoindre »
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

  if (!splashDone) {
    return <PrecallSplash onReady={handleJoin} />;
  }

  return (
    <div className={`call-app dark${chatOpen ? " chat-open" : ""}`}>
      <header>
        <span>ID : {callId}</span>
        <button onClick={() => setChatOpen((o) => !o)}>
          <ChatBubbleOutlineIcon />
        </button>
      </header>

      {/* Status pour l’hôte */}
      {isInitiator && <div className="status">{status}</div>}

      <main>
        <div className="card">
          <div className="you">Vous</div>
          <button onClick={() => { toggleMute(); setMuted((m) => !m); }}>
            {muted ? <MicOffIcon /> : <MicIcon />}
          </button>
        </div>
        <div className="card">
          <div className="them">Interlocuteur</div>
        </div>
        {chatOpen && (
          <aside>
            <Chat
              messages={chatMessages}
              onSend={sendMessage}
              isChannelOpen={isChannelOpen}
            />
          </aside>
        )}
      </main>

      <footer>
        <button onClick={hangUp}>
          <CallEndIcon />
        </button>
      </footer>

      {/* On n’attache l’audio distant que si on a bien un stream */}
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
}
