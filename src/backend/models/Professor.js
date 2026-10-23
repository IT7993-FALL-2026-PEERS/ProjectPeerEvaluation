

const mongoose = require('mongoose');

const ProfessorSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true,
		trim: true
	},
	email: {
		type: String,
		required: true,
		unique: true,
		lowercase: true,
		trim: true
	},
	// A new account has no password until its owner opens the emailed link and chooses one (CW-11), so it is
	// required only once the email is confirmed.
	password: {
		type: String,
		required: function () { return this.email_verified !== false; }
	},
	department: {
		type: String,
		required: true,
		trim: true
	},
	mfa_enabled: {
		type: Boolean,
		default: false
	},
	// CW-11: a newly registered account is created with false and cannot log in until the owner opens
	// the emailed link. The default is true so accounts that existed before this field keep working.
	email_verified: {
		type: Boolean,
		default: true
	},
	// SHA-256 of the emailed token (never the token itself) and when the link stops working.
	email_verification_token_hash: {
		type: String
	},
	email_verification_expires: {
		type: Date
	},
	// When the last link was sent; a pending address is not sent another one within the wait.
	email_verification_sent_at: {
		type: Date
	},
	last_login: {
		type: Date
	},
	securityToken: {
		type: String
	},
	securityTokenExpires: {
		type: Date
	},
	aiConcerningWords: {
		type: [String],
		default: [
			'cheat', 'abuse', 'bully', 'inappropriate', 'unfair', 'disrespect', 'threat', 'harass', 'plagiar',
			'violence', 'unsafe', 'hostile', 'ignore', 'exclude', 'rude', 'lazy', 'fail', 'problem', 'issue',
			'concern', 'complain', 'uncooperative', 'unresponsive', 'unacceptable', 'dishonest', 'lie', 'steal',
			'aggressive', 'argument', 'conflict', 'discriminate', 'bias', 'racist', 'sexist', 'toxic', 'unprofessional',
			'professor', 'teacher', 'instructor', 'faculty', 'grade', 'grading', 'unfair grade', 'unfair grading', 'retaliate', 'retaliation'
		]
	}
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Professor', ProfessorSchema);