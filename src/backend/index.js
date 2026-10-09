require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { getHealth } = require('./config/health');
const { applyServerTimeouts } = require('./config/serverTimeouts');
const { requestLogger } = require('./middleware/requestLogger');
const { applyRateLimits, trustProxyHops } = require('./config/rateLimit');
const { corsOptions } = require('./config/corsConfig');

const app = express();

// Render puts two proxies in front of the app (Cloudflare and its load balancer). Trusting
// exactly those hops makes req.ip the real client address (for the rate limits) and keeps a
// client from spoofing X-Forwarded-For. See config/rateLimit.js.
app.set('trust proxy', trustProxyHops());

// Middleware
// CORS: only the frontend at FRONTEND_URL, plus localhost outside production. See config/corsConfig.js.
app.use(cors(corsOptions()));
app.use(express.json());
app.use(require('./middleware/defaultBody'));

// Request logger middleware (redacts student evaluation tokens)
app.use(requestLogger);

// Staging may only email through the Mailtrap sandbox (utils/emailGuard.js). Sends are refused
// either way; this says so in the log at startup instead of at the first send.
const emailTransport = require('./utils/emailGuard').checkTransport();
if (!emailTransport.allowed) console.error(`❌ ${emailTransport.reason}`);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peer-evaluation')
  .then(() => {
    console.log('✅ MongoDB connected');
    return require('./utils/ensureIndexes').ensureEvaluationIndexes();
  })
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

// Rate limits (API-5): after the health check, which must never be limited, and before the routers
applyRateLimits(app);

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
// The deployed commit in the startup line, so Render's log shows which version started (Render sets
// RENDER_GIT_COMMIT; it's also in /api/health).
const commit = process.env.RENDER_GIT_COMMIT ? ` (commit ${process.env.RENDER_GIT_COMMIT.slice(0, 7)})` : '';
// Express 5 passes a failed bind (such as EADDRINUSE) to this callback instead of throwing, and the
// open MongoDB connection would keep a listener-less process alive, so stop here.
applyServerTimeouts(app.listen(PORT, (err) => {
  if (err) {
    console.error(`❌ Could not listen on port ${PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`🚀 Server running on port ${PORT}${commit}`);
}));
