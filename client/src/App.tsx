import React, { useState } from 'react';
import { RoomProvider, useRoom } from './context/RoomContext';
import { LoginPage } from './components/LoginPage';
import { LobbyPage } from './components/LobbyPage';
import { InterviewRoom } from './components/InterviewRoom';

type Step = 'login' | 'lobby' | 'room';

function AppContent() {
  const { user, room } = useRoom();
  const [step, setStep] = useState<Step>('login');

  if (!user) {
    return <LoginPage onJoinRoom={() => setStep('lobby')} />;
  }

  if (!room) {
    return <LobbyPage onEnterRoom={() => setStep('room')} />;
  }

  return <InterviewRoom />;
}

export default function App() {
  return (
    <RoomProvider>
      <AppContent />
    </RoomProvider>
  );
}
