import React, { useState, useRef, useEffect, useCallback } from 'react';

interface VideoWindowProps {
  isRecording: boolean;
}

type SharingMode = 'camera' | 'screen';

export function VideoWindow({ isRecording }: VideoWindowProps) {
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [sharingMode, setSharingMode] = useState<SharingMode>('camera');
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentStreamRef = useRef<MediaStream | null>(null);
  const screenShareTrackRef = useRef<MediaStreamTrack | null>(null);

  const getBrowserName = useCallback(() => {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'firefox';
    if (ua.includes('Chrome')) return 'chrome';
    if (ua.includes('Safari')) return 'safari';
    if (ua.includes('Edg')) return 'edge';
    return 'unknown';
  }, []);

  const createScreenShareConstraints = useCallback((browser: string) => {
    const baseConstraints: MediaTrackConstraints = {
      cursor: 'always' as const,
      width: { ideal: 1920, max: 3840 },
      height: { ideal: 1080, max: 2160 },
      frameRate: { ideal: 30, max: 60 }
    };

    if (browser === 'firefox') {
      return {
        video: {
          ...baseConstraints,
          mediaSource: 'screen' as const
        },
        audio: false
      };
    }

    return {
      video: {
        ...baseConstraints,
        displaySurface: 'monitor' as const,
        surfaceSwitching: 'include' as const
      },
      audio: false
    };
  }, []);

  const getFallbackConstraints = useCallback((browser: string) => {
    if (browser === 'firefox') {
      return [
        { video: { mediaSource: 'window' as const, cursor: 'always' }, audio: false },
        { video: { mediaSource: 'application' as const, cursor: 'always' }, audio: false },
        { video: { mediaSource: 'screen' as const, cursor: 'motion' as const }, audio: false }
      ];
    }
    return [
      { video: { displaySurface: 'window' as const, cursor: 'always' as const }, audio: false },
      { video: { displaySurface: 'browser' as const, cursor: 'always' as const }, audio: false },
      { video: { displaySurface: 'monitor' as const, cursor: 'motion' as const }, audio: false }
    ];
  }, []);

  const handleTrackEnded = useCallback((track: MediaStreamTrack) => {
    console.log('Screen share track ended:', track);
    setScreenShareError('屏幕共享已结束');
    setSharingMode('camera');
    
    if (peerConnection) {
      peerConnection.getSenders().forEach(sender => {
        if (sender.track === track) {
          peerConnection.removeTrack(sender);
        }
      });
    }
    
    screenShareTrackRef.current = null;
    restartCamera();
  }, [peerConnection]);

  const initializePeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log('Peer connection state:', pc.connectionState);
    };

    setPeerConnection(pc);
    return pc;
  }, []);

  const addTrackToPeerConnection = useCallback((track: MediaStreamTrack, stream: MediaStream) => {
    const pc = peerConnection || initializePeerConnection();
    if (pc) {
      pc.addTrack(track, stream);
      console.log('Track added to peer connection:', track.kind);
    }
  }, [peerConnection, initializePeerConnection]);

  const startScreenShare = useCallback(async () => {
    setScreenShareError(null);
    const browser = getBrowserName();
    
    const displayMediaOptions = [
      createScreenShareConstraints(browser),
      ...getFallbackConstraints(browser)
    ];

    let stream: MediaStream | null = null;
    let lastError: Error | null = null;

    for (let i = 0; i < displayMediaOptions.length; i++) {
      try {
        console.log(`Attempting screen share with constraints (${i + 1}/${displayMediaOptions.length}):`, displayMediaOptions[i]);
        stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions[i]);
        console.log('Screen share successful!');
        break;
      } catch (err) {
        lastError = err as Error;
        console.warn(`Screen share attempt ${i + 1} failed:`, err);
        if (err instanceof Error && err.name === 'NotAllowedError') {
          break;
        }
      }
    }

    if (!stream) {
      const errorMsg = lastError 
        ? `屏幕共享失败: ${lastError.message}` 
        : '无法获取屏幕共享权限';
      setScreenShareError(errorMsg);
      console.error(errorMsg);
      return;
    }

    if (currentStreamRef.current) {
      currentStreamRef.current.getTracks().forEach(track => track.stop());
    }

    const screenTrack = stream.getVideoTracks()[0];
    if (screenTrack) {
      screenTrack.addEventListener('ended', () => handleTrackEnded(screenTrack));
      screenShareTrackRef.current = screenTrack;
      addTrackToPeerConnection(screenTrack, stream);
    }

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    currentStreamRef.current = stream;
    setSharingMode('screen');
    setIsVideoEnabled(true);
  }, [getBrowserName, createScreenShareConstraints, getFallbackConstraints, handleTrackEnded, addTrackToPeerConnection]);

  const stopScreenShare = useCallback(() => {
    if (screenShareTrackRef.current) {
      screenShareTrackRef.current.stop();
    }
    screenShareTrackRef.current = null;
    setSharingMode('camera');
    setScreenShareError(null);
    restartCamera();
  }, []);

  const restartCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      currentStreamRef.current = stream;
      setSharingMode('camera');
      setIsVideoEnabled(true);
    } catch (err) {
      console.error('Failed to restart camera:', err);
    }
  }, []);

  const toggleSharingMode = useCallback(() => {
    if (sharingMode === 'camera') {
      startScreenShare();
    } else {
      stopScreenShare();
    }
  }, [sharingMode, startScreenShare, stopScreenShare]);

  const toggleVideo = useCallback(() => {
    if (currentStreamRef.current) {
      currentStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  }, [isVideoEnabled]);

  const toggleAudio = useCallback(() => {
    if (currentStreamRef.current) {
      currentStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  }, [isAudioEnabled]);

  useEffect(() => {
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        currentStreamRef.current = stream;
      } catch (err) {
        console.error('Failed to get camera media:', err);
      }
    }
    initCamera();

    return () => {
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnection) {
        peerConnection.close();
      }
    };
  }, []);

  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-700 z-50"
        onClick={() => setIsMinimized(false)}
      >
        <span className="text-xl">{sharingMode === 'screen' ? '🖥️' : '📹'}</span>
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
        {sharingMode === 'screen' && (
          <div className="absolute top-2 left-16 bg-purple-600 px-2 py-1 rounded text-xs text-white">
            🖥️ Screen Sharing
          </div>
        )}
        {screenShareError && (
          <div className="absolute bottom-2 left-2 right-2 bg-red-600/90 px-2 py-1 rounded text-xs text-white">
            ⚠️ {screenShareError}
          </div>
        )}
      </div>
      <div className="p-2 flex justify-center gap-2">
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
        <button
          onClick={toggleSharingMode}
          className={`p-2 rounded-full ${sharingMode === 'screen' ? 'bg-purple-600' : 'bg-gray-700'}`}
          title={sharingMode === 'screen' ? 'Stop screen share' : 'Start screen share'}
        >
          <span className="text-white">{sharingMode === 'screen' ? '🖥️' : '🖥️'}</span>
        </button>
      </div>
    </div>
  );
}
