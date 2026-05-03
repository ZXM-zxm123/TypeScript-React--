export interface User {
  id: string;
  name: string;
  role: 'interviewer' | 'candidate';
}

export interface Room {
  id: string;
  code: string;
  role: 'interviewer' | 'candidate';
}

export interface Message {
  id: number;
  senderId: string;
  senderRole: 'interviewer' | 'candidate';
  content: string;
  timestamp: string;
}

export interface CodeSnapshot {
  code: string;
  language: string;
  timestamp: string;
}

export interface CursorPosition {
  lineNumber: number;
  column: number;
}

export interface RemoteCursor {
  userId: string;
  userName: string;
  position: CursorPosition;
}

export interface RecordingEvent {
  type: 'code_change' | 'cursor_change' | 'chat_message' | 'language_change';
  timestamp: number;
  data: unknown;
}

export interface ExecuteResult {
  success: boolean;
  output: string;
  error?: string;
  time: number;
}
