import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSocket } from '../hooks/useSocket';
import type { User, Room, Message, RemoteCursor, RecordingEvent } from '../types';

interface RoomContextType {
  user: User | null;
  room: Room | null;
  messages: Message[];
  remoteCursors: RemoteCursor[];
  isRecording: boolean;
  recordingEvents: RecordingEvent[];
  isConnected: boolean;
  login: (name: string, role: 'interviewer' | 'candidate') => void;
  createRoom: () => Promise<{ success: boolean; error?: string }>;
  joinRoom: (code: string) => Promise<{ success: boolean; error?: string }>;
  leaveRoom: () => void;
  sendMessage: (content: string) => Promise<void>;
  startRecording: () => void;
  stopRecording: () => void;
  endInterview: () => void;
}

const RoomContext = createContext<RoomContextType | null>(null);

export function RoomProvider({ children }: { children: ReactNode }) {
  const socketHook = useSocket();
  const [user, setUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingEvents, setRecordingEvents] = useState<RecordingEvent[]>([]);
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);

  const login = useCallback((name: string, role: 'interviewer' | 'candidate') => {
    const newUser: User = {
      id: uuidv4(),
      name,
      role
    };
    setUser(newUser);
  }, []);

  const createRoom = useCallback(async () => {
    if (!user) return { success: false, error: 'User not logged in' };

    const result = await socketHook.createRoom(user.id, user.name);
    if (result.success && result.room) {
      setRoom({
        id: result.room.id,
        code: result.room.code,
        role: result.room.role as 'interviewer' | 'candidate'
      });
      setMessages([]);
      setRemoteCursors([]);
      return { success: true };
    }
    return { success: false, error: 'Failed to create room' };
  }, [user, socketHook]);

  const joinRoom = useCallback(async (code: string) => {
    if (!user) return { success: false, error: 'User not logged in' };

    const result = await socketHook.joinRoom(code, user.id, user.name);
    if (result.success && result.room) {
      setRoom({
        id: result.room.id,
        code: result.room.code,
        role: result.room.role as 'interviewer' | 'candidate'
      });
      if (result.messages) {
        setMessages(result.messages);
      }
      return { success: true };
    }
    return { success: false, error: result.error || 'Failed to join room' };
  }, [user, socketHook]);

  const leaveRoom = useCallback(() => {
    if (room) {
      socketHook.leaveRoom(room.id);
    }
    setRoom(null);
    setMessages([]);
    setRemoteCursors([]);
    setIsRecording(false);
    setRecordingEvents([]);
  }, [room, socketHook]);

  const sendMessage = useCallback(async (content: string) => {
    if (!room) return;
    await socketHook.sendMessage(room.id, content);
  }, [room, socketHook]);

  const startRecording = useCallback(() => {
    if (!room) return;
    socketHook.startRecording(room.id);
    setIsRecording(true);
    setRecordingEvents([]);
    recordingInterval.current = setInterval(() => {
      setRecordingEvents(prev => [
        ...prev,
        { type: 'code_change', timestamp: Date.now(), data: null }
      ]);
    }, 1000);
  }, [room, socketHook]);

  const stopRecording = useCallback(() => {
    if (!room) return;
    const recordingData = JSON.stringify(recordingEvents);
    socketHook.stopRecording(room.id, recordingData);
    setIsRecording(false);
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
      recordingInterval.current = null;
    }
  }, [room, socketHook, recordingEvents]);

  const endInterview = useCallback(() => {
    if (!room) return;
    socketHook.endInterview(room.id);
    leaveRoom();
  }, [room, socketHook, leaveRoom]);

  React.useEffect(() => {
    if (!socketHook.socket) return;

    const handleCodeUpdate = ({ code }: { code: string }) => {
      if (isRecording) {
        setRecordingEvents(prev => [...prev, {
          type: 'code_change',
          timestamp: Date.now(),
          data: { code }
        }]);
      }
    };

    const handleNewMessage = (message: Message) => {
      setMessages(prev => [...prev, message]);
      if (isRecording) {
        setRecordingEvents(prev => [...prev, {
          type: 'chat_message',
          timestamp: Date.now(),
          data: message
        }]);
      }
    };

    const handleCursorUpdate = (cursor: RemoteCursor) => {
      setRemoteCursors(prev => {
        const filtered = prev.filter(c => c.userId !== cursor.userId);
        return [...filtered, cursor];
      });
      if (isRecording) {
        setRecordingEvents(prev => [...prev, {
          type: 'cursor_change',
          timestamp: Date.now(),
          data: cursor
        }]);
      }
    };

    const handleUserLeft = ({ userId }: { userId: string }) => {
      setRemoteCursors(prev => prev.filter(c => c.userId !== userId));
    };

    const handleInterviewEnded = () => {
      leaveRoom();
    };

    socketHook.socket.on('code_update', handleCodeUpdate);
    socketHook.socket.on('new_message', handleNewMessage);
    socketHook.socket.on('cursor_update', handleCursorUpdate);
    socketHook.socket.on('user_left', handleUserLeft);
    socketHook.socket.on('interview_ended', handleInterviewEnded);

    return () => {
      socketHook.socket?.off('code_update', handleCodeUpdate);
      socketHook.socket?.off('new_message', handleNewMessage);
      socketHook.socket?.off('cursor_update', handleCursorUpdate);
      socketHook.socket?.off('user_left', handleUserLeft);
      socketHook.socket?.off('interview_ended', handleInterviewEnded);
    };
  }, [socketHook.socket, isRecording, leaveRoom]);

  return (
    <RoomContext.Provider
      value={{
        user,
        room,
        messages,
        remoteCursors,
        isRecording,
        recordingEvents,
        isConnected: socketHook.isConnected,
        login,
        createRoom,
        joinRoom,
        leaveRoom,
        sendMessage,
        startRecording,
        stopRecording,
        endInterview
      }}
    >
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within RoomProvider');
  }
  return context;
}
