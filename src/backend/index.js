require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { getHealth } = require('./config/health');
const { applyServerTimeouts } = require('./config/serverTimeouts');

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

// Health check endpoint for API. Used by CD as the post-deploy readiness/smoke
// check (Milestone 3), so it has to reflect real dependency state, not just
// "the process is running" — it previously returned OK unconditionally even
// with MongoDB down.
app.get('/api/health', (req, res) => {
  const health = getHealth(mongoose.connection);
  res.status(health.status === 'OK' ? 200 : 503).json(health);
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/evaluate', require('./routes/evaluate'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/professor', require('./routes/professor'));

// Global error handler (must be last)
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 5000;
applyServerTimeouts(app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`)));
