const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5000;

// Allowed Origins
const allowedOrigins = ['http://localhost:3000', 'http://arunsamy-demo.onrender.com'];

// CORS Options
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

// Middleware
app.use(express.json());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Preflight handling for all routes

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// MongoDB Schema Definitions
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
});

const connectionSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  roomId: String,
});

const User = mongoose.model('User', userSchema);
const Connection = mongoose.model('Connection', connectionSchema);

// MongoDB Connection
mongoose
  .connect('mongodb+srv://arunsamy4444:1234567890@cluster0.o981j.mongodb.net/?retryWrites=true&w=majority', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// API Routes

// User Signup
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    return res.status(400).send({ error: 'User already exists' });
  }

  const user = new User({ email, password });
  await user.save();
  res.status(201).send({ message: 'User registered successfully' });
});

// User Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || user.password !== password) {
    return res.status(401).send({ error: 'Invalid credentials' });
  }

  res.send({ userId: user._id, message: 'Login successful' });
});

// Get all users
app.get('/api/users', async (req, res) => {
  const users = await User.find();
  res.send(users);
});

// Send Friend Request
app.post('/api/send-request', async (req, res) => {
  const { recipientId, userId } = req.body;

  const existingConnection = await Connection.findOne({
    $or: [
      { requester: userId, recipient: recipientId },
      { requester: recipientId, recipient: userId },
    ],
  });

  if (existingConnection) {
    return res.status(400).send({ error: 'Connection already exists' });
  }

  const connection = new Connection({
    requester: userId,
    recipient: recipientId,
    status: 'pending',
  });

  await connection.save();
  res.send({ message: 'Friend request sent' });
});

// Accept Friend Request
app.post('/api/accept-request', async (req, res) => {
  const { requestId } = req.body;
  const roomId = uuidv4();

  try {
    const connection = await Connection.findByIdAndUpdate(
      requestId,
      { status: 'accepted', roomId },
      { new: true }
    );

    if (!connection) {
      return res.status(404).send({ error: 'Request not found' });
    }

    res.send({ message: 'Friend request accepted', roomId, connection });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Internal Server Error' });
  }
});

// WebSocket Event Handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', socket.id);
  });

  socket.on('offer', (data) => {
    socket.to(data.roomId).emit('offer', data.offer);
  });

  socket.on('answer', (data) => {
    socket.to(data.roomId).emit('answer', data.answer);
  });

  socket.on('candidate', (data) => {
    socket.to(data.roomId).emit('candidate', data.candidate);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Start the Server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
