const mongoose = require('mongoose');
const Course = require('../models/Course');

// Runs after authenticateToken on every /api/courses/:course_id/... route.
// A course that belongs to another professor answers 404, same as a missing one,
// so course ids can't be probed.
async function requireCourseOwner(req, res, next) {
  const { course_id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(course_id)) {
    const err = new Error('Invalid course ID.');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    return next(err);
  }
  try {
    const owned = await Course.exists({ _id: course_id, professor_id: req.user.id });
    if (!owned) {
      const err = new Error('Course not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }
    next();
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
}

module.exports = { requireCourseOwner };
