import React, { useState, useRef, useEffect } from 'react';

interface VideoWindowProps {
  isRecording: boolean;
}

export function VideoWindow({ isRecording }: VideoWindowProps) {
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function getMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Failed to get media:', err);
      }
    }
    getMedia();

    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const toggleVideo = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const toggleAudio = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-700 z-50"
        onClick={() => setIsMinimized(false)}
      >
        <span className="text-xl">📹</span>
        {isRecording && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-gray-900 rounded-lg overflow-hidden shadow-xl z-50">
      <div className="relative bg-gray-800 aspect-video">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        {isRecording && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-600 px-2 py-1 rounded">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-xs text-white font-medium">REC</span>
          </div>
        )}
        <button
          className="absolute top-2 right-2 p-1 bg-black/50 rounded hover:bg-black/70"
          onClick={() => setIsMinimized(true)}
        >
          <span className="text-white text-sm">−</span>
        </button>
      </div>
      <div className="p-2 flex justify-center gap-4">
        <button
          onClick={toggleVideo}
          className={`p-2 rounded-full ${isVideoEnabled ? 'bg-gray-700' : 'bg-red-600'}`}
          title={isVideoEnabled ? 'Disable video' : 'Enable video'}
        >
          <span className="text-white">{isVideoEnabled ? '📹' : '🚫'}</span>
        </button>
        <button
          onClick={toggleAudio}
          className={`p-2 rounded-full ${isAudioEnabled ? 'bg-gray-700' : 'bg-red-600'}`}
          title={isAudioEnabled ? 'Mute audio' : 'Unmute audio'}
        >
          <span className="text-white">{isAudioEnabled ? '🎤' : '🔇'}</span>
        </button>
      </div>
    </div>
  );
}
