require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
module.exports = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/peer-eval';
