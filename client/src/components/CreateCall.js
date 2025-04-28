// src/pages/CreateCall.jsx
import React, { useState } from 'react';
import axios from 'axios';

export default function CreateCall() {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    try {
      const res = await axios.post(
        `${process.env.REACT_APP_SERVER_URL}/create-call`,
        {},
        { auth: { username: user, password: pass } }
      );
      sessionStorage.setItem('isInitiator', 'true');
      window.location.href = `/call/${res.data.callId}`;
    } catch {
      setError('Échec d’authentification');
    }
  };

  return (
    <>
      <style>{`
        .container {
          max-width: 360px;
          margin: 5rem auto;
          padding: 2rem;
          background: #202124;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.6);
          color: #e8eaed;
          font-family: "Google Sans", sans-serif;
        }
        .container h2 {
          margin-bottom: 1.5rem;
          text-align: center;
          font-size: 1.5rem;
        }
        .container input {
          width: 100%;
          padding: 0.75rem 1rem;
          margin-bottom: 1rem;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 4px;
          background: #303134;
          color: #e8eaed;
          font-size: 1rem;
        }
        .container input::placeholder {
          color: rgba(255,255,255,0.6);
        }
        .container button {
          width: 100%;
          padding: 0.75rem;
          background: #1a73e8;
          border: none;
          border-radius: 4px;
          color: #fff;
          font-size: 1rem;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .container button:hover {
          background: #1669c1;
        }
        .error {
          color: #ea4335;
          margin-bottom: 1rem;
          text-align: center;
        }
      `}</style>

      <div className="container">
        <h2>Créer un appel</h2>
        {error && <p className="error">{error}</p>}
        <input
          type="text"
          placeholder="Username"
          value={user}
          onChange={e => setUser(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={pass}
          onChange={e => setPass(e.target.value)}
        />
        <button onClick={handleCreate}>Créer un appel</button>
      </div>
    </>
  );
}
