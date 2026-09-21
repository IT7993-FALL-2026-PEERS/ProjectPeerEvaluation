require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://127.0.0.1:3000',
    'https://peer-evaluation-frontend.onrender.com',
    /\.onrender\.com$/  // Allow any Render.com subdomain
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));
app.use(express.json());

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peer-evaluation')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: '🎓 Peer Evaluation System API', 
    status: 'Running',
    endpoints: [
      'POST /api/auth/login - User login',
      'GET /api/courses - List courses',
      'POST /api/evaluate - Submit evaluation',
      'GET /api/ai - AI features'
    ]
  });
});

// Health check endpoint for API
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'Backend API is running',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/evaluate', require('./routes/evaluate'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/professor', require('./routes/professor'));
app.use('/api/professor', require('./routes/professor'));


// Global error handler (must be last)
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
