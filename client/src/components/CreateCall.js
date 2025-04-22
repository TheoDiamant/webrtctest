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
      setError('Échec authentification');
    }
  };

  return (
    <div className="container">
      <h2>Créer un appel</h2>
      {error && <p className="error">{error}</p>}
      <input placeholder="Username" value={user} onChange={e => setUser(e.target.value)} />
      <input
        type="password"
        placeholder="Password"
        value={pass}
        onChange={e => setPass(e.target.value)}
      />
      <button onClick={handleCreate}>Créer un appel</button>
    </div>
  );
}