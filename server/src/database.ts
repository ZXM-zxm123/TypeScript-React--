import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'interview.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    interviewer_id TEXT NOT NULL,
    candidate_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    recording_data TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS code_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    code TEXT NOT NULL,
    language TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
  CREATE INDEX IF NOT EXISTS idx_snapshots_room ON code_snapshots(room_id);
`);

export interface Room {
  id: string;
  code: string;
  interviewer_id: string;
  candidate_id: string | null;
  created_at: string;
  ended_at: string | null;
  recording_data: string | null;
}

export interface Message {
  id: number;
  room_id: string;
  sender_id: string;
  sender_role: 'interviewer' | 'candidate';
  content: string;
  timestamp: string;
}

export interface CodeSnapshot {
  id: number;
  room_id: string;
  code: string;
  language: string;
  timestamp: string;
}

export function createRoom(id: string, code: string, interviewerId: string): Room {
  const stmt = db.prepare('INSERT INTO rooms (id, code, interviewer_id) VALUES (?, ?, ?)');
  stmt.run(id, code, interviewerId);
  return getRoomById(id)!;
}

export function getRoomById(id: string): Room | undefined {
  const stmt = db.prepare('SELECT * FROM rooms WHERE id = ?');
  return stmt.get(id) as Room | undefined;
}

export function getRoomByCode(code: string): Room | undefined {
  const stmt = db.prepare('SELECT * FROM rooms WHERE code = ? AND ended_at IS NULL');
  return stmt.get(code) as Room | undefined;
}

export function joinRoom(roomId: string, candidateId: string): void {
  const stmt = db.prepare('UPDATE rooms SET candidate_id = ? WHERE id = ? AND candidate_id IS NULL');
  stmt.run(candidateId, roomId);
}

export function endRoom(roomId: string): void {
  const stmt = db.prepare('UPDATE rooms SET ended_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run(roomId);
}

export function saveRecording(roomId: string, recordingData: string): void {
  const stmt = db.prepare('UPDATE rooms SET recording_data = ? WHERE id = ?');
  stmt.run(recordingData, roomId);
}

export function addMessage(roomId: string, senderId: string, senderRole: string, content: string): Message {
  const stmt = db.prepare('INSERT INTO messages (room_id, sender_id, sender_role, content) VALUES (?, ?, ?, ?)');
  const result = stmt.run(roomId, senderId, senderRole, content);
  return getMessageById(result.lastInsertRowid as number)!;
}

export function getMessageById(id: number): Message | undefined {
  const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
  return stmt.get(id) as Message | undefined;
}

export function getMessagesByRoom(roomId: string): Message[] {
  const stmt = db.prepare('SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp ASC');
  return stmt.all(roomId) as Message[];
}

export function addCodeSnapshot(roomId: string, code: string, language: string): CodeSnapshot {
  const stmt = db.prepare('INSERT INTO code_snapshots (room_id, code, language) VALUES (?, ?, ?)');
  const result = stmt.run(roomId, code, language);
  return getCodeSnapshotById(result.lastInsertRowid as number)!;
}

export function getCodeSnapshotById(id: number): CodeSnapshot | undefined {
  const stmt = db.prepare('SELECT * FROM code_snapshots WHERE id = ?');
  return stmt.get(id) as CodeSnapshot | undefined;
}

export function getCodeSnapshotsByRoom(roomId: string): CodeSnapshot[] {
  const stmt = db.prepare('SELECT * FROM code_snapshots WHERE room_id = ? ORDER BY timestamp ASC');
  return stmt.all(roomId) as CodeSnapshot[];
}

export function getRoomHistory(): Room[] {
  const stmt = db.prepare('SELECT * FROM rooms WHERE ended_at IS NOT NULL ORDER BY created_at DESC');
  return stmt.all() as Room[];
}

export default db;
