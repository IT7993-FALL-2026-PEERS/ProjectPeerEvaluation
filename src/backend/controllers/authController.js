const Professor = require('../models/Professor');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { getConfig } = require('../config/env');
const { asText, firstNonText, validationError } = require('../utils/inputGuards');
const { getAllowedDomains, isAllowedInstructorEmail } = require('../utils/registrationPolicy');
const { RESEND_WAIT_MS, canSendAnotherLink, createVerificationToken, hashVerificationToken } = require('../utils/emailVerification');

const JWT_SECRET = getConfig().jwtSecret;
const JWT_EXPIRES_IN = '1h';

exports.login = async (req, res, next) => {
	try {
		const { email, password } = req.body;
		const nonText = firstNonText(req.body, ['email', 'password']);
		if (nonText) return next(validationError(`${nonText} must be text.`));
		if (!email || !password) {
			const err = new Error('Email and password are required.');
			err.code = 'VALIDATION_ERROR';
			err.status = 400;
			return next(err);
		}
		const professor = await Professor.findOne({ email: asText(email) });
		if (!professor) {
			const err = new Error('Invalid email or password.');
			err.code = 'AUTH_ERROR';
			err.status = 401;
			return next(err);
		}
		// CW-11: a new account has no password until its owner opens the emailed link and chooses one, so
		// there is nothing to compare yet.
		if (professor.email_verified === false) {
			const err = new Error('Open the link we emailed you to choose your password first. If it has not arrived, register again with the same email.');
			err.code = 'EMAIL_NOT_VERIFIED';
			err.status = 403;
			return next(err);
		}
		const isMatch = await bcrypt.compare(password, professor.password);
		if (!isMatch) {
			const err = new Error('Invalid email or password.');
			err.code = 'AUTH_ERROR';
			err.status = 401;
			return next(err);
		}
		// MFA check placeholder (implement actual logic as needed)
		if (professor.mfa_enabled) {
			// Return MFA required response (frontend will call verify-mfa)
			return res.status(200).json({ mfa_required: true, professor_id: professor._id });
		}
		// Generate JWT token
		const access_token = jwt.sign(
			{ id: professor._id, email: professor.email, name: professor.name },
			JWT_SECRET,
			{ expiresIn: JWT_EXPIRES_IN }
		);
		professor.last_login = new Date();
		await professor.save();
		res.status(200).json({
			access_token,
			professor: {
				id: professor._id,
				email: professor.email,
				name: professor.name,
				department: professor.department,
				mfa_enabled: professor.mfa_enabled,
				created_at: professor.created_at,
				last_login: professor.last_login
			}
		});
	} catch (err) {
		err.code = err.code || 'SERVER_ERROR';
		err.status = err.status || 500;
		next(err);
	}
};

exports.register = async (req, res, next) => {
	try {
		// Registration takes no password (CW-11). Whoever registers an address first could otherwise choose the
		// password of the person who owns it; the password is chosen from the emailed link instead, which only
		// the owner of the mailbox can open. A password sent along is ignored.
		const { email, name, department } = req.body;
		const nonText = firstNonText(req.body, ['email', 'name', 'department']);
		if (nonText) return next(validationError(`${nonText} must be text.`));
		if (!email || !name || !department) {
			const err = new Error('Email, name and department are required.');
			err.code = 'VALIDATION_ERROR';
			err.status = 400;
			return next(err);
		}
		// Only instructor addresses may register (FERPA); checked before anything is looked up or saved.
		if (!isAllowedInstructorEmail(email)) {
			const err = new Error(`Registration is limited to instructor email addresses (${getAllowedDomains().map((domain) => '@' + domain).join(', ')}).`);
			err.code = 'EMAIL_NOT_ALLOWED';
			err.status = 403;
			return next(err);
		}
		const existing = await Professor.findOne({ email: asText(email) });
		if (existing && existing.email_verified !== false) {
			const err = new Error('Email already registered.');
			err.code = 'DUPLICATE';
			err.status = 409;
			return next(err);
		}
		const sentRecently = () => res.status(201).json({
			message: 'A confirmation link was sent to this address recently. Check your inbox and spam folder and use it, or try again in 15 minutes.',
			verification_email_sent: false
		});
		// An address that is still waiting for its owner: nothing about the account changes, and a new link is
		// sent only once the wait since the last one is over, so a stranger cannot keep cancelling the real link.
		if (existing && !canSendAnotherLink(existing)) return sentRecently();

		// Every change below is one conditional database operation, so two requests at the same moment (two
		// resends, a resend and the owner confirming, two first registrations) cannot undo each other
		// (Codex review, second pass, 13 Oct). First the send slot is taken: the account is created, or the
		// pending one is claimed only if it is still pending and its wait is over. Whoever loses sends nothing.
		const now = new Date();
		let professor;
		let previousSentAt;
		if (existing) {
			professor = await Professor.findOneAndUpdate(
				{
					_id: existing._id,
					email_verified: false,
					$or: [
						// null also matches an account that has no sent time at all (no link was ever delivered)
						{ email_verification_sent_at: null },
						{ email_verification_sent_at: { $lte: new Date(now.getTime() - RESEND_WAIT_MS) } }
					]
				},
				{ $set: { email_verification_sent_at: now } },
				{ new: false }
			);
			if (!professor) return sentRecently();
			previousSentAt = professor.email_verification_sent_at;
		} else {
			try {
				professor = await Professor.create({ email, name, department, email_verified: false, email_verification_sent_at: now });
			} catch (createError) {
				// Another request created the same address a moment ago (the unique index): it sends the email.
				if (createError && createError.code === 11000) return sentRecently();
				throw createError;
			}
		}

		// Then the link is sent, and published only if it went out and the account is still pending: a failed
		// send never replaces a link that works, and a resend that finishes after the owner confirmed cannot
		// bring a link back to a confirmed account. Both updates also need the send slot to still be this
		// request's own (its send time, `now`): a send that stays in flight past the wait can have its slot
		// taken by a newer request, and when it finishes it must change nothing (Codex review, third pass).
		const { token, hash, expiresAt } = createVerificationToken();
		const sent = await sendVerificationEmail(professor.email, token, process.env.FRONTEND_URL);
		const emailSent = !!(sent && sent.success);
		if (emailSent) {
			await Professor.updateOne(
				{ _id: professor._id, email_verified: false, email_verification_sent_at: now },
				{ $set: { email_verification_token_hash: hash, email_verification_expires: expiresAt } }
			);
		} else {
			// Give the send slot back so a new try is allowed at once; the link already in the mailbox, if any, stays.
			await Professor.updateOne(
				{ _id: professor._id, email_verified: false, email_verification_sent_at: now },
				previousSentAt ? { $set: { email_verification_sent_at: previousSentAt } } : { $unset: { email_verification_sent_at: 1 } }
			);
		}
		const body = {
			message: emailSent
				? 'Registration started. We emailed you a link: open it to choose your password and finish.'
				: 'We could not send the confirmation email. Register again with the same email to get a new link.',
			verification_email_sent: emailSent
		};
		// The id of an account that is still pending is not given out.
		if (!existing) body.professor_id = professor._id;
		res.status(201).json(body);
	} catch (err) {
		err.code = err.code || 'SERVER_ERROR';
		err.status = err.status || 500;
		next(err);
	}
};

// Opens the emailed link and sets the password (CW-11). Only the hash of the token is stored, so the
// lookup is by hash. Both fields are checked before the lookup, so a request that lacks the password does
// not use the link up. The account is changed in one conditional update that needs the account to be
// pending and the link unexpired, so two confirmations at once cannot both succeed.
exports.verifyEmail = async (req, res, next) => {
	try {
		const { token, password } = req.body;
		const nonText = firstNonText(req.body, ['token', 'password']);
		if (nonText) return next(validationError(`${nonText} must be text.`));
		if (!token || !password) return next(validationError('A confirmation token and a password are required.'));
		const tokenHash = hashVerificationToken(asText(token));
		const invalidLink = () => {
			const err = new Error('This confirmation link is invalid or has expired. Register again with the same email to get a new one.');
			err.code = 'TOKEN_ERROR';
			err.status = 400;
			return err;
		};
		// A cheap look first, so a made-up link does not cost a password hash.
		const professor = await Professor.findOne({ email_verification_token_hash: tokenHash });
		if (!professor || !professor.email_verification_expires || professor.email_verification_expires < Date.now()) {
			return next(invalidLink());
		}
		const hashed = await bcrypt.hash(password, 10);
		const confirmed = await Professor.findOneAndUpdate(
			{ email_verification_token_hash: tokenHash, email_verification_expires: { $gt: new Date() }, email_verified: false },
			{
				$set: { password: hashed, email_verified: true },
				$unset: { email_verification_token_hash: 1, email_verification_expires: 1, email_verification_sent_at: 1 }
			}
		);
		if (!confirmed) return next(invalidLink());
		res.status(200).json({ message: 'Email confirmed. You can now log in.' });
	} catch (err) {
		err.code = err.code || 'SERVER_ERROR';
		err.status = err.status || 500;
		next(err);
	}
};

exports.logout = async (req, res) => {
  // For JWT, logout is handled on frontend by deleting token. Optionally, implement token blacklist.
  res.status(200).json({ message: 'Logout successful.' });
};

exports.refreshToken = async (req, res, next) => {
	// Placeholder: implement refresh token logic as needed
	const err = new Error('Refresh token not implemented.');
	err.code = 'NOT_IMPLEMENTED';
	err.status = 501;
	next(err);
};

exports.verifyMfa = async (req, res, next) => {
	// Placeholder: implement MFA verification logic as needed
	const err = new Error('MFA verification not implemented.');
	err.code = 'NOT_IMPLEMENTED';
	err.status = 501;
	next(err);
};

const { sendPasswordResetEmail, sendVerificationEmail } = require('../utils/emailUtils');

// Password reset request handler
exports.resetPassword = async (req, res, next) => {
	try {
		const { email } = req.body;
		const nonText = firstNonText(req.body, ['email']);
		if (nonText) return next(validationError(`${nonText} must be text.`));
		if (!email) {
			const err = new Error('Email is required.');
			err.code = 'VALIDATION_ERROR';
			err.status = 400;
			return next(err);
		}
		const professor = await Professor.findOne({ email: asText(email) });
		if (!professor) {
			// For security, do not reveal if email is not registered
			return res.status(200).json({ message: 'If the email is registered, a reset link will be sent.' });
		}
		// Generate secure token
		const token = crypto.randomBytes(32).toString('hex');
		professor.securityToken = token;
		professor.securityTokenExpires = Date.now() + 1000 * 60 * 60; // 1 hour expiry
		await professor.save();
		// Send password reset email
	await sendPasswordResetEmail(professor.email, token, process.env.FRONTEND_URL);
		res.status(200).json({ message: 'If the email is registered, a reset link will be sent.' });
	} catch (err) {
		err.code = err.code || 'SERVER_ERROR';
		err.status = err.status || 500;
		next(err);
	}
};

// Password update via token handler
exports.updatePassword = async (req, res, next) => {
	try {
		const { token, password } = req.body;
		const nonText = firstNonText(req.body, ['token', 'password']);
		if (nonText) return next(validationError(`${nonText} must be text.`));
		if (!token || !password) {
			const err = new Error('Token and new password are required.');
			err.code = 'VALIDATION_ERROR';
			err.status = 400;
			return next(err);
		}
		const professor = await Professor.findOne({ securityToken: asText(token) });
		if (!professor || !professor.securityTokenExpires || professor.securityTokenExpires < Date.now()) {
			const err = new Error('Invalid or expired token.');
			err.code = 'TOKEN_ERROR';
			err.status = 400;
			return next(err);
		}
		// Update password
		const hashed = await bcrypt.hash(password, 10);
		professor.password = hashed;
		professor.securityToken = undefined;
		professor.securityTokenExpires = undefined;
		await professor.save();
		res.status(200).json({ message: 'Password updated successfully.' });
	} catch (err) {
		err.code = err.code || 'SERVER_ERROR';
		err.status = err.status || 500;
		next(err);
	}
};