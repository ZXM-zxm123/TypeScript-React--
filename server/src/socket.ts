import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  createRoom,
  getRoomById,
  getRoomByCode,
  joinRoom,
  endRoom,
  addMessage,
  getMessagesByRoom,
  addCodeSnapshot,
  getCodeSnapshotsByRoom,
  saveRecording
} from './database.js';

interface CursorPosition {
  lineNumber: number;
  column: number;
}

interface RoomState {
  code: string;
  language: string;
  cursors: Map<string, CursorPosition>;
}

const rooms = new Map<string, RoomState>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getClientRoom(socket: Socket): string | null {
  const rooms = socket.rooms;
  for (const room of rooms) {
    if (room !== socket.id) {
      return room;
    }
  }
  return null;
}

export function setupSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('create_room', (data: { userId: string; userName: string }, callback) => {
      const roomId = uuidv4();
      const roomCode = generateRoomCode();
      const room = createRoom(roomId, roomCode, data.userId);

      rooms.set(roomId, {
        code: '',
        language: 'javascript',
        cursors: new Map()
      });

      socket.join(roomId);
      socket.data.userId = data.userId;
      socket.data.userName = data.userName;
      socket.data.role = 'interviewer';

      callback({
        success: true,
        room: {
          id: room.id,
          code: room.code,
          role: 'interviewer'
        }
      });
    });

    socket.on('join_room', (data: { code: string; userId: string; userName: string }, callback) => {
      const room = getRoomByCode(data.code.toUpperCase());
      if (!room) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      if (room.candidate_id && room.candidate_id !== data.userId) {
        callback({ success: false, error: 'Room is full' });
        return;
      }

      joinRoom(room.id, data.userId);
      socket.join(room.id);
      socket.data.userId = data.userId;
      socket.data.userName = data.userName;
      socket.data.role = 'candidate';

      let roomState = rooms.get(room.id);
      if (!roomState) {
        roomState = {
          code: '',
          language: 'javascript',
          cursors: new Map()
        };
        rooms.set(room.id, roomState);
      }

      const messages = getMessagesByRoom(room.id);
      const snapshots = getCodeSnapshotsByRoom(room.id);

      callback({
        success: true,
        room: {
          id: room.id,
          code: room.code,
          role: 'candidate'
        },
        previousCode: roomState.code,
        language: roomState.language,
        messages: messages.map(m => ({
          id: m.id,
          senderId: m.sender_id,
          senderRole: m.sender_role,
          content: m.content,
          timestamp: m.timestamp
        })),
        snapshots: snapshots.map(s => ({
          code: s.code,
          language: s.language,
          timestamp: s.timestamp
        }))
      });

      socket.to(room.id).emit('user_joined', {
        userId: data.userId,
        userName: data.userName
      });
    });

    socket.on('code_change', (data: { roomId: string; code: string }) => {
      const roomState = rooms.get(data.roomId);
      if (roomState) {
        roomState.code = data.code;
        addCodeSnapshot(data.roomId, data.code, roomState.language);
      }
      socket.to(data.roomId).emit('code_update', { code: data.code });
    });

    socket.on('language_change', (data: { roomId: string; language: string }) => {
      const roomState = rooms.get(data.roomId);
      if (roomState) {
        roomState.language = data.language;
      }
      socket.to(data.roomId).emit('language_update', { language: data.language });
    });

    socket.on('cursor_change', (data: { roomId: string; position: CursorPosition }) => {
      const roomState = rooms.get(data.roomId);
      if (roomState && socket.data.userId) {
        roomState.cursors.set(socket.data.userId, data.position);
        socket.to(data.roomId).emit('cursor_update', {
          userId: socket.data.userId,
          userName: socket.data.userName,
          position: data.position
        });
      }
    });

    socket.on('chat_message', (data: { roomId: string; content: string }, callback) => {
      if (!socket.data.userId || !socket.data.role) {
        callback?.({ success: false, error: 'Not authenticated' });
        return;
      }

      const message = addMessage(
        data.roomId,
        socket.data.userId,
        socket.data.role,
        data.content
      );

      io.to(data.roomId).emit('new_message', {
        id: message.id,
        senderId: message.sender_id,
        senderRole: message.sender_role,
        content: message.content,
        timestamp: message.timestamp
      });

      callback?.({ success: true, message });
    });

    socket.on('execute_code', async (data: { roomId: string; code: string; language: string; input: string }, callback) => {
      try {
        const response = await fetch('http://localhost:4001/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: data.code,
            language: data.language,
            input: data.input
          })
        });

        const result = await response.json();
        callback(result);
      } catch (error) {
        callback({ success: false, error: 'Execution service unavailable' });
      }
    });

    socket.on('start_recording', (data: { roomId: string }) => {
      socket.to(data.roomId).emit('recording_started', {
        startedBy: socket.data.userId
      });
    });

    socket.on('stop_recording', (data: { roomId: string; recordingData: string }) => {
      saveRecording(data.roomId, data.recordingData);
      socket.to(data.roomId).emit('recording_stopped', {
        stoppedBy: socket.data.userId
      });
    });

    socket.on('end_interview', (data: { roomId: string }) => {
      const room = getRoomById(data.roomId);
      if (room) {
        endRoom(data.roomId);
        io.to(data.roomId).emit('interview_ended', {
          endedBy: socket.data.userId
        });
      }
    });

    socket.on('leave_room', (data: { roomId: string }) => {
      const roomId = data.roomId;
      socket.leave(roomId);
      socket.to(roomId).emit('user_left', {
        userId: socket.data.userId,
        userName: socket.data.userName
      });
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      const roomId = getClientRoom(socket);
      if (roomId) {
        const roomState = rooms.get(roomId);
        if (roomState && socket.data.userId) {
          roomState.cursors.delete(socket.data.userId);
        }
        socket.to(roomId).emit('user_left', {
          userId: socket.data.userId,
          userName: socket.data.userName
        });
      }
    });
  });
}
