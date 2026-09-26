const nodemailer = require('nodemailer');

// Email configuration
// In production, these should come from environment variables
const EMAIL_CONFIG = {
  service: process.env.SMTP_SERVICE || undefined, // Use 'gmail' for better compatibility
  host: process.env.SMTP_SERVICE ? undefined : (process.env.SMTP_HOST || 'localhost'),
  port: process.env.SMTP_SERVICE ? undefined : (parseInt(process.env.SMTP_PORT) || 587),
  secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'test@example.com',
    pass: process.env.SMTP_PASS || 'password'
  },
  // Add connection timeout and other options for better reliability
  connectionTimeout: 60000, // 60 seconds
  greetingTimeout: 30000,   // 30 seconds
  socketTimeout: 60000,     // 60 seconds
};

// Create transporter
const transporter = nodemailer.createTransport(EMAIL_CONFIG);

/**
 * Send evaluation invitation email to a student
 * @param {Object} student - Student object with name, email
 * @param {Object} course - Course object with course details
 * @param {String} evaluationToken - Unique token for the student's evaluation
 * @param {String} frontendUrl - Base URL of the frontend application
 * @param {Date} deadline - Evaluation deadline
 */
async function sendEvaluationInvitation(student, course, evaluationToken, frontendUrl = 'http://localhost:3000', deadline) {
  const evaluationUrl = `${frontendUrl}/evaluate/${evaluationToken}`;
  
  const subject = `Peer Evaluation for ${course.course_name} - ${course.course_number}`;
  
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c5aa0;">Peer Evaluation Invitation</h2>
          
          <p>Dear ${student.name},</p>
          
          <p>You have been invited to complete a peer evaluation for your teammates in:</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <strong>Course:</strong> ${course.course_name}<br>
            <strong>Course Number:</strong> ${course.course_number}<br>
            <strong>Section:</strong> ${course.course_section}<br>
            <strong>Semester:</strong> ${course.semester}
          </div>
          
          <p><strong>Deadline:</strong> ${deadline ? new Date(deadline).toLocaleDateString() : 'No deadline set'}</p>
          
          <p>Please click the link below to access your personalized evaluation form:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${evaluationUrl}" 
               style="background-color: #2c5aa0; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Complete Peer Evaluation
            </a>
          </div>
          
          <p><strong>Important Notes:</strong></p>
          <ul>
            <li>This link is personalized for you and should not be shared</li>
            <li>You can save and return to complete your evaluation later</li>
            <li>Your responses will be kept confidential</li>
            <li>Please provide constructive and honest feedback</li>
          </ul>
          
          <p>If you have any questions about the evaluation process, please contact your instructor.</p>
          
          <p>Best regards,<br>
          Peer Evaluation System</p>
          
          <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">
          <p style="font-size: 12px; color: #888;">
            This is an automated message. If you cannot click the link above, copy and paste this URL into your browser:<br>
            ${evaluationUrl}
          </p>
        </div>
      </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.SMTP_FROM || 'noreply@peerevaluation.com',
    to: student.email,
    subject: subject,
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send reminder email to a student
 */
async function sendEvaluationReminder(student, course, evaluationToken, frontendUrl = 'http://localhost:3000', deadline) {
  const evaluationUrl = `${frontendUrl}/evaluate/${evaluationToken}`;
  const subject = `Reminder: Peer Evaluation Due for ${course.course_name}`;
  
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #d9534f;">Peer Evaluation Reminder</h2>
          <p>Dear ${student.name},</p>
          <p><strong>This is a reminder</strong> that you have not yet completed your peer evaluation.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${evaluationUrl}" 
               style="background-color: #d9534f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Complete Evaluation Now
            </a>
          </div>
        </div>
      </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.SMTP_FROM || 'noreply@peerevaluation.com',
    to: student.email,
    subject: subject,
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending reminder email:', error);
    return { success: false, error: error.message };
  }
}

// ...existing code...

/**
 * Send password reset email to professor
 * @param {String} email - Professor's email
 * @param {String} token - Reset token
 */
async function sendPasswordResetEmail(email, token, frontendUrl = 'http://localhost:3000') {
  const baseUrl = process.env.FRONTEND_URL || frontendUrl;
  const resetUrl = `${baseUrl}/reset-password/${token}`;
  const subject = 'Password Reset Request';
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c5aa0;">Password Reset Request</h2>
          <p>We received a request to reset your password. If you did not make this request, you can ignore this email.</p>
          <p>To reset your password, click the link below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #2c5aa0; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          </div>
          <p>This link will expire in 1 hour.</p>
          <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">
          <p style="font-size: 12px; color: #888;">If you cannot click the link above, copy and paste this URL into your browser:<br>${resetUrl}</p>
        </div>
      </body>
    </html>
  `;
  const mailOptions = {
    from: process.env.SMTP_FROM || 'noreply@peerevaluation.com',
    to: email,
    subject: subject,
    html: htmlContent
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendEvaluationInvitation,
  sendEvaluationReminder,
  sendPasswordResetEmail
};