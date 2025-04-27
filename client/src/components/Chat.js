import React, { useEffect, useRef } from 'react';

export default function Chat({ messages, message, setMessage, onSend }) {
  const messagesEndRef = useRef(null);

  // Scroll en bas à chaque nouvel élément
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.sender}`}>
            {m.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSend()}
          placeholder="Tapez un message..."
        />
        <button onClick={onSend}>Envoyer</button>
      </div>
    </div>
  );
}
