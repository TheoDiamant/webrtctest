import React, { useEffect, useRef } from "react";

export default function Chat({
  messages,
  message,
  setMessage,
  onSend,
  isInitiator,
}) {
  const messagesEndRef = useRef(null);

  // scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((m, i) => {
          // determine “Host” vs “Guest”
          const label =
            m.sender === "local"
              ? isInitiator
                ? "Host"
                : "Guest"
              : isInitiator
              ? "Guest"
              : "Host";
          const cls = m.sender === "local" ? "host" : "guest";

          return (
            <div key={i} className={`message ${cls}`}>
              <div className="msg-label">{label}</div>
              <div className="msg-text">{m.text}</div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="Tapez un message…"
        />
        <button onClick={onSend}>Envoyer</button>
      </div>
    </div>
  );
}
