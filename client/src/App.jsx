import React from 'react';
import CreateCall from './components/CreateCall';
import CallPage from './components/CallPage';

export default function App() {
  const path = window.location.pathname;
  const match = path.match(/\/call\/(.+)/);
  const callId = match ? match[1] : null;
  return callId ? <CallPage callId={callId} /> : <CreateCall />;
}