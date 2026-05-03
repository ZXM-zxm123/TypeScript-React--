import React, { useState } from 'react';
import { useRoom } from '../context/RoomContext';

interface LoginPageProps {
  onJoinRoom: () => void;
}

export function LoginPage({ onJoinRoom }: LoginPageProps) {
  const { login } = useRoom();
  const [name, setName] = useState('');
  const [role, setRole] = useState<'interviewer' | 'candidate'>('candidate');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    login(name.trim(), role);
    onJoinRoom();
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-800 rounded-xl p-8 shadow-2xl">
          <h1 className="text-3xl font-bold text-white text-center mb-8">
            Interview Platform
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-gray-300 mb-2">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-2">Join as</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setRole('interviewer')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    role === 'interviewer'
                      ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                      : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <span className="text-2xl mb-2 block">👔</span>
                  <span className="font-medium">Interviewer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('candidate')}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    role === 'candidate'
                      ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                      : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <span className="text-2xl mb-2 block">👤</span>
                  <span className="font-medium">Candidate</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
