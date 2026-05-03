import React, { useState, useRef, useEffect, useCallback } from 'react';

interface VideoWindowProps {
  isRecording: boolean;
}

type SharingMode = 'camera' | 'screen';

interface NetworkQuality {
  rtt: number;
  packetLoss: number;
  jitter: number;
  bandwidthEstimate: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

// 视频质量配置层级
const VIDEO_QUALITY_LEVELS = {
  excellent: { maxBitrate: 1500, minBitrate: 800, resolution: { width: 640, height: 480 }, framerate: 30 },
  good: { maxBitrate: 1000, minBitrate: 500, resolution: { width: 640, height: 480 }, framerate: 30 },
  fair: { maxBitrate: 600, minBitrate: 300, resolution: { width: 480, height: 360 }, framerate: 24 },
  poor: { maxBitrate: 300, minBitrate: 100, resolution: { width: 320, height: 240 }, framerate: 15 }
};

// 编解码器优先级
const PREFERRED_VIDEO_CODECS = [
  { mimeType: 'video/H264', clockRate: 90000 },
  { mimeType: 'video/VP8', clockRate: 90000 },
  { mimeType: 'video/VP9', clockRate: 90000 }
];

const PREFERRED_AUDIO_CODECS = [
  { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { mimeType: 'audio/ISAC', clockRate: 16000 },
  { mimeType: 'audio/G722', clockRate: 8000 }
];

export function VideoWindow({ isRecording }: VideoWindowProps) {
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [sharingMode, setSharingMode] = useState<SharingMode>('camera');
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentStreamRef = useRef<MediaStream | null>(null);
  const screenShareTrackRef = useRef<MediaStreamTrack | null>(null);
  const networkStatsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const getBrowserName = useCallback(() => {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'firefox';
    if (ua.includes('Chrome')) return 'chrome';
    if (ua.includes('Safari')) return 'safari';
    if (ua.includes('Edg')) return 'edge';
    return 'unknown';
  }, []);

  // 优化的视频约束
  const getOptimizedVideoConstraints = useCallback((quality: keyof typeof VIDEO_QUALITY_LEVELS = 'good') => {
    const config = VIDEO_QUALITY_LEVELS[quality];
    return {
      width: { ideal: config.resolution.width, max: config.resolution.width },
      height: { ideal: config.resolution.height, max: config.resolution.height },
      frameRate: { ideal: config.framerate, max: config.framerate },
      aspectRatio: 1.333,
      facingMode: 'user'
    };
  }, []);

  const createScreenShareConstraints = useCallback((browser: string) => {
    const baseConstraints: MediaTrackConstraints = {
      cursor: 'always' as const,
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 30, max: 30 }
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

  // 配置编解码器优先级
  const configureCodecs = useCallback(async (transceivers: RTCRtpTransceiver[]) => {
    for (const transceiver of transceivers) {
      if (transceiver.kind === 'video' && transceiver.setCodecPreferences) {
        const cap = RTCRtpSender.getCapabilities('video');
        if (cap) {
          const preferredCodecs = cap.codecs.filter(codec => 
            PREFERRED_VIDEO_CODECS.some(pref => 
              codec.mimeType === pref.mimeType && 
              codec.clockRate === pref.clockRate
            )
          );
          if (preferredCodecs.length > 0) {
            transceiver.setCodecPreferences(preferredCodecs);
            console.log('Video codecs configured:', preferredCodecs.map(c => c.mimeType));
          }
        }
      }
      
      if (transceiver.kind === 'audio' && transceiver.setCodecPreferences) {
        const cap = RTCRtpSender.getCapabilities('audio');
        if (cap) {
          const preferredCodecs = cap.codecs.filter(codec => 
            PREFERRED_AUDIO_CODECS.some(pref => 
              codec.mimeType === pref.mimeType && 
              codec.clockRate === pref.clockRate
            )
          );
          if (preferredCodecs.length > 0) {
            transceiver.setCodecPreferences(preferredCodecs);
            console.log('Audio codecs configured:', preferredCodecs.map(c => c.mimeType));
          }
        }
      }
    }
  }, []);

  // 配置发送器参数（码率自适应、分辨率降级策略）
  const configureSenderParameters = useCallback((sender: RTCRtpSender) => {
    if (sender.track?.kind !== 'video') return;
    
    const parameters = sender.getParameters();
    
    if (!parameters.encodings || parameters.encodings.length === 0) {
      parameters.encodings = [{ rid: 'main' }];
    }
    
    // 配置码率自适应
    const config = VIDEO_QUALITY_LEVELS.good;
    parameters.encodings[0].maxBitrate = config.maxBitrate * 1000;
    parameters.encodings[0].minBitrate = config.minBitrate * 1000;
    parameters.encodings[0].maxFramerate = config.framerate;
    
    // 配置分辨率降级策略 - 优先保持帧率
    parameters.degradationPreference = 'maintain-framerate' as const;
    
    sender.setParameters(parameters);
    console.log('Sender parameters configured:', parameters);
  }, []);

  // 动态调整比特率
  const adjustBitrate = useCallback((pc: RTCPeerConnection, quality: keyof typeof VIDEO_QUALITY_LEVELS) => {
    const config = VIDEO_QUALITY_LEVELS[quality];
    pc.getSenders().forEach(sender => {
      if (sender.track?.kind === 'video') {
        const parameters = sender.getParameters();
        if (parameters.encodings && parameters.encodings.length > 0) {
          parameters.encodings[0].maxBitrate = config.maxBitrate * 1000;
          parameters.encodings[0].minBitrate = config.minBitrate * 1000;
          parameters.encodings[0].maxFramerate = config.framerate;
          sender.setParameters(parameters);
        }
      }
    });
    console.log(`Bitrate adjusted to ${quality}:`, config);
  }, []);

  // 检测网络质量
  const monitorNetworkQuality = useCallback(async (pc: RTCPeerConnection) => {
    try {
      const stats = await pc.getStats();
      let packetLoss = 0;
      let rtt = 0;
      let jitter = 0;
      let bandwidthEstimate = 0;

      stats.forEach(report => {
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          packetLoss = report.packetsLost || 0;
          jitter = report.jitter || 0;
        }
        if (report.type === 'candidate-pair' && report.nominated) {
          rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
          bandwidthEstimate = report.availableOutgoingBitrate || 0;
        }
        if (report.type === 'transport') {
          rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : rtt;
        }
      });

      let quality: NetworkQuality['quality'];
      if (rtt < 100 && packetLoss < 1) {
        quality = 'excellent';
      } else if (rtt < 200 && packetLoss < 3) {
        quality = 'good';
      } else if (rtt < 400 && packetLoss < 5) {
        quality = 'fair';
      } else {
        quality = 'poor';
      }

      const newQuality: NetworkQuality = { rtt, packetLoss, jitter, bandwidthEstimate, quality };
      setNetworkQuality(newQuality);

      adjustBitrate(pc, quality);
    } catch (error) {
      console.warn('Failed to get network stats:', error);
    }
  }, [adjustBitrate]);

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
    // 优化的 ICE 服务器配置 - 包含多个 STUN 和 TURN 服务器
    const iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // 亚洲地区 STUN 服务器
      { urls: 'stun:stun.nextcloud.com:443' }
    ];

    const rtcConfig: RTCConfiguration = {
      iceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all',
      sdpSemantics: 'unified-plan'
    };

    const pc = new RTCPeerConnection(rtcConfig);

    // 配置码率自适应的 bwe
    pc.ontrack = (event) => {
      console.log('Track received:', event.track.kind);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        if (networkStatsIntervalRef.current) {
          clearInterval(networkStatsIntervalRef.current);
        }
        networkStatsIntervalRef.current = setInterval(() => {
          monitorNetworkQuality(pc);
        }, 2000);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Peer connection state:', pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        if (networkStatsIntervalRef.current) {
          clearInterval(networkStatsIntervalRef.current);
        }
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', pc.iceGatheringState);
    };

    pc.onnegotiationneeded = () => {
      console.log('Negotiation needed');
    };

    setPeerConnection(pc);
    return pc;
  }, [monitorNetworkQuality]);

  const addTrackToPeerConnection = useCallback(async (track: MediaStreamTrack, stream: MediaStream) => {
    const pc = peerConnection || initializePeerConnection();
    if (pc) {
      const transceiver = pc.addTransceiver(track, {
        direction: 'sendrecv',
        streams: [stream],
        sendEncodings: [
          {
            rid: 'main',
            maxBitrate: VIDEO_QUALITY_LEVELS.good.maxBitrate * 1000,
            maxFramerate: VIDEO_QUALITY_LEVELS.good.framerate
          }
        ]
      });

      configureSenderParameters(transceiver.sender);
      await configureCodecs(pc.getTransceivers());

      console.log('Track added to peer connection:', track.kind);
    }
  }, [peerConnection, initializePeerConnection, configureSenderParameters, configureCodecs]);

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
      await addTrackToPeerConnection(screenTrack, stream);
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
        video: getOptimizedVideoConstraints('good'),
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      currentStreamRef.current = stream;
      
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];
      
      if (audioTrack) await addTrackToPeerConnection(audioTrack, stream);
      if (videoTrack) await addTrackToPeerConnection(videoTrack, stream);
      
      setSharingMode('camera');
      setIsVideoEnabled(true);
    } catch (err) {
      console.error('Failed to restart camera:', err);
    }
  }, [getOptimizedVideoConstraints, addTrackToPeerConnection]);

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
          video: getOptimizedVideoConstraints('good'),
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        currentStreamRef.current = stream;
        
        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];
        
        const pc = initializePeerConnection();
        if (audioTrack) {
          await addTrackToPeerConnection(audioTrack, stream);
        }
        if (videoTrack) {
          await addTrackToPeerConnection(videoTrack, stream);
        }
      } catch (err) {
        console.error('Failed to get camera media:', err);
      }
    }
    initCamera();

    return () => {
      if (currentStreamRef.current) {
        currentStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (networkStatsIntervalRef.current) {
        clearInterval(networkStatsIntervalRef.current);
      }
      if (peerConnection) {
        peerConnection.close();
      }
    };
  }, [getOptimizedVideoConstraints, initializePeerConnection, addTrackToPeerConnection]);

  const getNetworkQualityColor = () => {
    if (!networkQuality) return 'text-gray-400';
    switch (networkQuality.quality) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-blue-400';
      case 'fair': return 'text-yellow-400';
      case 'poor': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

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
        {networkQuality && (
          <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-xs">
            <span className={getNetworkQualityColor()}>
              📶 {networkQuality.quality} | RTT: {Math.round(networkQuality.rtt)}ms
            </span>
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
