import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers } from './socket.js';
import { getRoomHistory, getRoomById, getMessagesByRoom, getCodeSnapshotsByRoom } from './database.js';

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST']
  }
});

setupSocketHandlers(io);

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = getRoomById(req.params.id);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  const messages = getMessagesByRoom(req.params.id);
  const snapshots = getCodeSnapshotsByRoom(req.params.id);
  res.json({ room, messages, snapshots });
});

app.get('/api/history', (_, res) => {
  const rooms = getRoomHistory();
  res.json({ rooms });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
