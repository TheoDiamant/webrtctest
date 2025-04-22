import React, { useEffect, useRef } from 'react';

export default function Chat({ messages, message, setMessage, onSend }) {
  const ref = useRef();
  useEffect(() => { ref.current.scrollTop = ref.current.scrollHeight; }, [messages]);

  return (
    <div className="chat-container">
      <div className="chat-messages" ref={ref}>
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.sender}`}>{m.text}</div>
        ))}
      </div>
      <div className="chat-input">
        <input
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