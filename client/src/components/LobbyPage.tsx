import React, { useState } from 'react';
import { useRoom } from '../context/RoomContext';

interface LobbyPageProps {
  onEnterRoom: () => void;
}

export function LobbyPage({ onEnterRoom }: LobbyPageProps) {
  const { user, createRoom, joinRoom, room } = useRoom();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError('');
    const result = await createRoom();
    if (result.success) {
      onEnterRoom();
    } else {
      setError(result.error || 'Failed to create room');
    }
    setIsCreating(false);
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setError('');
    const result = await joinRoom(joinCode.trim().toUpperCase());
    if (result.success) {
      onEnterRoom();
    } else {
      setError(result.error || 'Failed to join room');
    }
  };

  if (room) {
    onEnterRoom();
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-800 rounded-xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white">
              Welcome, {user?.name}
            </h2>
            <p className="text-gray-400 mt-1">
              {user?.role === 'interviewer' ? '👔 Interviewer' : '👤 Candidate'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {user?.role === 'interviewer' && (
              <button
                onClick={handleCreateRoom}
                disabled={isCreating}
                className="w-full py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"
              >
                {isCreating ? 'Creating...' : 'Create Interview Room'}
              </button>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-800 text-gray-400">or</span>
              </div>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-3">
              <div>
                <label className="block text-gray-300 mb-2">Room Code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500 text-center text-2xl tracking-widest font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={joinCode.length !== 6}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Join Room
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
