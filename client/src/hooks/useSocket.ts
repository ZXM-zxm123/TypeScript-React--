import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Message, RemoteCursor, ExecuteResult, CodeSnapshot } from '../types';

interface ServerToClientEvents {
  code_update: (data: { code: string }) => void;
  language_update: (data: { language: string }) => void;
  cursor_update: (data: RemoteCursor) => void;
  new_message: (data: Message) => void;
  user_joined: (data: { userId: string; userName: string }) => void;
  user_left: (data: { userId: string; userName: string }) => void;
  recording_started: (data: { startedBy: string }) => void;
  recording_stopped: (data: { stoppedBy: string }) => void;
  interview_ended: (data: { endedBy: string }) => void;
}

interface ClientToServerEvents {
  create_room: (data: { userId: string; userName: string }, callback: (res: { success: boolean; room?: { id: string; code: string; role: string } }) => void) => void;
  join_room: (data: { code: string; userId: string; userName: string }, callback: (res: { success: boolean; room?: { id: string; code: string; role: string }; previousCode?: string; language?: string; messages?: Message[]; snapshots?: CodeSnapshot[]; error?: string }) => void) => void;
  code_change: (data: { roomId: string; code: string }) => void;
  language_change: (data: { roomId: string; language: string }) => void;
  cursor_change: (data: { roomId: string; position: { lineNumber: number; column: number } }) => void;
  chat_message: (data: { roomId: string; content: string }, callback?: (res: { success: boolean }) => void) => void;
  execute_code: (data: { roomId: string; code: string; language: string; input: string }, callback: (res: ExecuteResult) => void) => void;
  start_recording: (data: { roomId: string }) => void;
  stop_recording: (data: { roomId: string; recordingData: string }) => void;
  end_interview: (data: { roomId: string }) => void;
  leave_room: (data: { roomId: string }) => void;
}

export function useSocket() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io('http://localhost:3001', {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback((userId: string, userName: string) => {
    return new Promise<{ success: boolean; room?: { id: string; code: string; role: string } }>((resolve) => {
      socketRef.current?.emit('create_room', { userId, userName }, (res) => {
        resolve(res);
      });
    });
  }, []);

  const joinRoom = useCallback((code: string, userId: string, userName: string) => {
    return new Promise<{ success: boolean; room?: { id: string; code: string; role: string }; previousCode?: string; language?: string; messages?: Message[]; snapshots?: CodeSnapshot[]; error?: string }>((resolve) => {
      socketRef.current?.emit('join_room', { code, userId, userName }, (res) => {
        resolve(res);
      });
    });
  }, []);

  const emitCodeChange = useCallback((roomId: string, code: string) => {
    socketRef.current?.emit('code_change', { roomId, code });
  }, []);

  const emitLanguageChange = useCallback((roomId: string, language: string) => {
    socketRef.current?.emit('language_change', { roomId, language });
  }, []);

  const emitCursorChange = useCallback((roomId: string, position: { lineNumber: number; column: number }) => {
    socketRef.current?.emit('cursor_change', { roomId, position });
  }, []);

  const sendMessage = useCallback((roomId: string, content: string) => {
    return new Promise<{ success: boolean }>((resolve) => {
      socketRef.current?.emit('chat_message', { roomId, content }, (res) => {
        resolve(res);
      });
    });
  }, []);

  const executeCode = useCallback((roomId: string, code: string, language: string, input: string) => {
    return new Promise<ExecuteResult>((resolve) => {
      socketRef.current?.emit('execute_code', { roomId, code, language, input }, (res) => {
        resolve(res);
      });
    });
  }, []);

  const startRecording = useCallback((roomId: string) => {
    socketRef.current?.emit('start_recording', { roomId });
  }, []);

  const stopRecording = useCallback((roomId: string, recordingData: string) => {
    socketRef.current?.emit('stop_recording', { roomId, recordingData });
  }, []);

  const endInterview = useCallback((roomId: string) => {
    socketRef.current?.emit('end_interview', { roomId });
  }, []);

  const leaveRoom = useCallback((roomId: string) => {
    socketRef.current?.emit('leave_room', { roomId });
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    createRoom,
    joinRoom,
    emitCodeChange,
    emitLanguageChange,
    emitCursorChange,
    sendMessage,
    executeCode,
    startRecording,
    stopRecording,
    endInterview,
    leaveRoom
  };
}
