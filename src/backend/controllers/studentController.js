const mongoose = require('mongoose');
const Student = require('../models/Student');
const csv = require('csv-parser');
const fs = require('fs');
const { asText, firstNonText, validationError } = require('../utils/inputGuards');
const { isEmailFormat } = require('../utils/emailFormat');

// Manual add student to course
exports.addStudent = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    const { student_id, name, email, group_assignment } = req.body;
    const nonText = firstNonText(req.body, ['student_id', 'name', 'email', 'group_assignment']);
    if (nonText) return next(validationError(`${nonText} must be text.`));
    if (!mongoose.Types.ObjectId.isValid(course_id)) {
      const err = new Error('Invalid course ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }
    if (!student_id || !name || !email) {
      const err = new Error('Missing required fields: student_id, name, email.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }
        if (!isEmailFormat(email.trim())) {
      return next(validationError('email is not a valid email address.'));
    }
    // Check for duplicate student_id in this course
    const existing = await Student.findOne({ course_id, student_id: asText(student_id) });
    if (existing) {
      const err = new Error('Student with this ID already exists in this course.');
      err.code = 'DUPLICATE';
      err.status = 409;
      return next(err);
    }
    
    let teamId = null;
    
    // If group_assignment is provided, find or create the team
    if (group_assignment && group_assignment.trim() !== '') {
      const Team = require('../models/Team');
      const courseObjectId = new mongoose.Types.ObjectId(course_id);
      
      // Try to find existing team with this name in this course
      let team = await Team.findOne({ 
        team_name: group_assignment.trim(), 
        course_id: courseObjectId 
      });
      
      // If team doesn't exist, create it
      if (!team) {
        team = new Team({
          team_name: group_assignment.trim(),
          course_id: courseObjectId,
          students: [],
          student_count: 0,
          team_status: 'Active'
        });
        await team.save();
        console.log(`Created new team: ${group_assignment.trim()} for manual student addition`);
        
        // Update course team_count
        const Course = require('../models/Course');
        const teamCount = await Team.countDocuments({ course_id: courseObjectId });
        await Course.findByIdAndUpdate(courseObjectId, { team_count: teamCount });
      }
      
      teamId = team._id;
    }
    
    const student = new Student({ 
      student_id, 
      name, 
      email, 
      course_id, 
      group_assignment: group_assignment || null,
      team_id: teamId
      // evaluation_token will be generated when evaluations are sent
    });
    await student.save();
    
    // If student was assigned to a team, update the team
    if (teamId) {
      const Team = require('../models/Team');
      
      // Add student to team's students array
      await Team.findByIdAndUpdate(teamId, {
        $addToSet: { students: student._id }
      });
      
      // Update team's student_count
      const teamStudentCount = await Student.countDocuments({ team_id: teamId });
      await Team.findByIdAndUpdate(teamId, { student_count: teamStudentCount });
      
      console.log(`Added student ${student_id} to team ${group_assignment}, new team count: ${teamStudentCount}`);
    }
    
    // Update student_count in the Course document
    const Course = require('../models/Course');
    const courseObjectId = new mongoose.Types.ObjectId(course_id);
    const studentCount = await Student.countDocuments({ course_id: courseObjectId });
    await Course.findByIdAndUpdate(courseObjectId, { student_count: studentCount });
    res.status(201).json({ message: 'Student added.', student });
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.listStudents = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(course_id)) {
      const err = new Error('Invalid course ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }
    const students = await Student.find({ course_id });
    res.status(200).json(students);
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.updateStudent = async (req, res, next) => {
  try {
    const { course_id, student_id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(student_id)) {
      const err = new Error('Invalid student ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }

    // Only these fields can be edited. Anything else in the body (course_id,
    // evaluation_token, evaluation_completed, team_id, ...) is ignored: the team is
    // set below from group_assignment, within this course (API-4, CICD-45).
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const updates = {};
    for (const field of ['student_id', 'name', 'email', 'group_assignment']) {
      const value = body[field];
      if (value === undefined) continue;
      const clearsTeam = field === 'group_assignment' && value === null;
      if (typeof value !== 'string' && !clearsTeam) {
        const err = new Error(`${field} must be text.`);
        err.code = 'VALIDATION_ERROR';
        err.status = 400;
        return next(err);
      }
      updates[field] = clearsTeam ? null : asText(value);
    }
    
    if (updates.email !== undefined && !isEmailFormat(updates.email.trim())) {
      return next(validationError('email is not a valid email address.'));
    }
    
    // Look the student up by ObjectIds, never by the raw request values
    const studentObjectId = new mongoose.Types.ObjectId(student_id);
    const courseIdCast = new mongoose.Types.ObjectId(course_id);

    // Get current student data before update
    const currentStudent = await Student.findOne({ _id: studentObjectId, course_id: courseIdCast });
    if (!currentStudent) {
      const err = new Error('Student not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }
    
    const oldTeamId = currentStudent.team_id;
    let newTeamId = null;
    // Team membership changes only when the request names a team (or clears it). An edit of just the
    // name or email must leave Team.students alone, or the two sides of the membership disagree.
    const teamChangeRequested = updates.group_assignment !== undefined;
    
    // Handle team assignment changes
    if (updates.group_assignment !== undefined) {
      if (updates.group_assignment && updates.group_assignment.trim() !== '') {
        const Team = require('../models/Team');
        const courseObjectId = new mongoose.Types.ObjectId(course_id);
        
        // Find or create the new team
        let team = await Team.findOne({ 
          team_name: updates.group_assignment.trim(), 
          course_id: courseObjectId 
        });
        
        if (!team) {
          team = new Team({
            team_name: updates.group_assignment.trim(),
            course_id: courseObjectId,
            students: [],
            student_count: 0,
            team_status: 'Active'
          });
          await team.save();
          console.log(`Created new team: ${updates.group_assignment.trim()} for student update`);
          
          // Update course team_count
          const Course = require('../models/Course');
          const teamCount = await Team.countDocuments({ course_id: courseObjectId });
          await Course.findByIdAndUpdate(courseObjectId, { team_count: teamCount });
        }
        
        newTeamId = team._id;
        updates.team_id = newTeamId;
      } else {
        // Clearing team assignment
        updates.team_id = null;
        updates.group_assignment = null;
      }
    }
    
    // Update the student
    const student = await Student.findOneAndUpdate({ _id: studentObjectId, course_id: courseIdCast }, updates, { new: true });
    
    // Handle team membership changes
    const Team = require('../models/Team');
    
    // Remove from old team if changed
    if (teamChangeRequested && oldTeamId && (!newTeamId || oldTeamId.toString() !== newTeamId.toString())) {
      await Team.findByIdAndUpdate(oldTeamId, {
        $pull: { students: student_id }
      });
      
      const oldTeamStudentCount = await Student.countDocuments({ team_id: oldTeamId });
      await Team.findByIdAndUpdate(oldTeamId, { student_count: oldTeamStudentCount });
      console.log(`Removed student from old team ${oldTeamId}, new count: ${oldTeamStudentCount}`);
    }
    
    // Add to new team if assigned
    if (newTeamId && (!oldTeamId || oldTeamId.toString() !== newTeamId.toString())) {
      await Team.findByIdAndUpdate(newTeamId, {
        $addToSet: { students: student._id }
      });
      
      const newTeamStudentCount = await Student.countDocuments({ team_id: newTeamId });
      await Team.findByIdAndUpdate(newTeamId, { student_count: newTeamStudentCount });
      console.log(`Added student to new team ${newTeamId}, new count: ${newTeamStudentCount}`);
    }
    
    res.status(200).json({ message: 'Student updated.' });
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.deleteStudent = async (req, res, next) => {
  try {
    const { course_id, student_id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(student_id)) {
      const err = new Error('Invalid student ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }
    const student = await Student.findOneAndDelete({ _id: student_id, course_id });
    if (!student) {
      const err = new Error('Student not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }

    // If student was part of a team, update that team
    if (student.team_id) {
      const Team = require('../models/Team');
      
      // Remove student from team's students array
      await Team.findByIdAndUpdate(student.team_id, {
        $pull: { students: student._id }
      });
      
      // Update team's student_count
      const teamStudentCount = await Student.countDocuments({ team_id: student.team_id });
      await Team.findByIdAndUpdate(student.team_id, { student_count: teamStudentCount });
      
      console.log(`Updated team ${student.team_id} student count to ${teamStudentCount}`);
    }

    // Update student_count in the Course document
    const Course = require('../models/Course');
    const courseObjectId = new mongoose.Types.ObjectId(course_id);
    const studentCount = await Student.countDocuments({ course_id: courseObjectId });
    console.log('Updating student_count for course:', course_id, 'to', studentCount);
    await Course.findByIdAndUpdate(courseObjectId, { student_count: studentCount });
    console.log('Course update result:', await Course.findById(courseObjectId));
    
    res.status(200).json({ message: 'Student deleted.' });
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.bulkDeleteStudents = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    const { student_ids } = req.body;
    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      const err = new Error('student_ids array required.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }

    // Get students to be deleted to check their teams
    const studentsToDelete = await Student.find({ _id: { $in: student_ids }, course_id });
    const teamsToUpdate = new Set();
    
    // Collect unique team IDs that will be affected
    studentsToDelete.forEach(student => {
      if (student.team_id) {
        teamsToUpdate.add(student.team_id.toString());
      }
    });

    // Delete the students
    const result = await Student.deleteMany({ _id: { $in: student_ids }, course_id });

    // Clean up related evaluations for deleted students
    const Evaluation = require('../models/Evaluation');
    const evaluationCleanup = await Evaluation.deleteMany({ 
      student_id: { $in: student_ids },
      course_id: course_id 
    });
    console.log(`Deleted ${evaluationCleanup.deletedCount} evaluations for deleted students`);

    // Update affected teams
    if (teamsToUpdate.size > 0) {
      const Team = require('../models/Team');
      
      for (const teamId of teamsToUpdate) {
        // Remove deleted students from team's students array
        await Team.findByIdAndUpdate(teamId, {
          $pull: { students: { $in: student_ids } }
        });
        
        // Update team's student_count
        const teamStudentCount = await Student.countDocuments({ team_id: teamId });
        await Team.findByIdAndUpdate(teamId, { student_count: teamStudentCount });
        
        console.log(`Updated team ${teamId} student count to ${teamStudentCount}`);
      }
    }

    // Update student_count in the Course document
    const Course = require('../models/Course');
    const courseObjectId = new mongoose.Types.ObjectId(course_id);
    const studentCount = await Student.countDocuments({ course_id: courseObjectId });
    console.log('Updating student_count for course:', course_id, 'to', studentCount);
    await Course.findByIdAndUpdate(courseObjectId, { student_count: studentCount });
    console.log('Course update result:', await Course.findById(courseObjectId));
    
    res.status(200).json({ message: 'Students deleted.', deleted_count: result.deletedCount });
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.uploadRoster = async (req, res, next) => {
  console.log('params:', req.params);
  console.log('file:', req.file);
  // Check for file
  if (!req.file) {
    const err = new Error('No file uploaded.');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    return next(err);
  }
  const { course_id } = req.params;
  const errors = [];
  const studentsToCreate = [];
  const idsInFile = new Set();
  try {
    // Parse CSV and collect students
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (row) => {
        console.log('Parsed row:', row);
        console.log('team_name value:', row.team_name);
        console.log('group_assignment value:', row.group_assignment);
        console.log('group value:', row.group);
        // Validate required columns (name, student_id, email are required; team_name is optional)
        // Checked after trimming: a value that is only spaces is missing
        const studentId = (row.student_id || '').trim();
        const name = (row.name || '').trim();
        const email = (row.email || '').trim();
        if (!studentId || !name || !email) {
          errors.push(`Missing required fields in row: ${JSON.stringify(row)}`);
          return;
        }
        if (!isEmailFormat(email)) {
          errors.push(`Invalid email in row: ${JSON.stringify(row)}`);
          return;
        }
        // The same student twice in one file: the first row is used, and the professor is told. Two inserts
        // for one id would otherwise fail on the unique index and leave the roster half applied.
        if (idsInFile.has(studentId)) {
          errors.push(`Duplicate student_id ${studentId}: it appears more than once in the file, so only the first row was used.`);
          return;
        }
        idsInFile.add(studentId);
        // Prepare student object (evaluation_token will be generated when evaluations are sent)
        const teamAssignment = (row.team_name || row.group_assignment || row.group || '').trim() || null;
        console.log('Final team assignment for student:', row.student_id, '=', teamAssignment);
        studentsToCreate.push({
          student_id: studentId,
          name,
          email,
          group_assignment: teamAssignment, // Primary: team_name, fallback for backward compatibility
          course_id
        });
      })
      .on('end', async () => {
        console.log('CSV parsing completed. Total students parsed:', studentsToCreate.length);
        try {
          // A file with no usable rows changes nothing: reject it before any write,
          // so a wrong or empty file can never wipe evaluations (API-3, FR-06).
          if (studentsToCreate.length === 0) {
            fs.rmSync(req.file.path, { force: true });
            const detail = errors.slice(0, 3).join('; ');
            const more = errors.length > 3 ? ` (and ${errors.length - 3} more)` : '';
            const err = new Error(
              errors.length === 0
                ? 'The file has no students. Each row needs student_id, name and email.'
                : `No student in the file could be added. ${detail}${more}. Each row needs student_id, name and email.`
            );
            err.code = 'VALIDATION_ERROR';
            err.status = 400;
            return next(err);
          }

          const courseObjectId = new mongoose.Types.ObjectId(course_id);
          
          // Deduplicate: filter out students that already exist in this course
          const existingStudents = await Student.find({
            course_id: courseObjectId,
            student_id: { $in: studentsToCreate.map(s => s.student_id) }
          }).select('student_id team_id group_assignment');
          const existingByStudentId = new Map(existingStudents.map(s => [s.student_id, s]));
          const existingIds = new Set(existingStudents.map(s => s.student_id));
          const filteredToCreate = studentsToCreate.filter(s => !existingIds.has(s.student_id));
          
          console.log('Existing students:', existingIds.size);
          console.log('New students to create:', filteredToCreate.length);
          
          // Check if we should update existing students with team assignments
          const studentsToUpdate = studentsToCreate.filter(s => existingIds.has(s.student_id));
          console.log('Existing students to potentially update with teams:', studentsToUpdate.length);
          
          // A student who has submitted or received evaluations keeps their team: a move would leave the saved
          // evaluations pointing at a team they are no longer in (the evaluation form, completion checks and
          // reports all work from the team). The professor is told, and can change the team by hand.
          // Everyone else is moved as the file says (Codex review, 13 Oct 2026).
          const Team = require('../models/Team');
          const Evaluation = require('../models/Evaluation');
          // Compared by team id, not by the name stored on the student: the two can disagree after an interrupted
          // write, and the name alone would let a student with evaluations be moved (Codex review, second pass).
          const requestedNames = [...new Set(studentsToUpdate.map((s) => s.group_assignment).filter(Boolean))];
          const teamIdByName = new Map();
          if (requestedNames.length > 0) {
            const found = await Team.find({ course_id: courseObjectId, team_name: { $in: requestedNames } }).select('team_name');
            for (const team of found) teamIdByName.set(team.team_name, String(team._id));
          }
          const lockedIds = new Set();
          const wantsMove = studentsToUpdate.filter((s) => {
            if (!s.group_assignment) return false;
            const current = existingByStudentId.get(s.student_id).team_id;
            const target = teamIdByName.get(s.group_assignment);
            return !target || !current || String(current) !== target;
          });
          if (wantsMove.length > 0) {
            const [evaluators, recipients] = await Promise.all([
              Evaluation.distinct('evaluator_id', { course_id: courseObjectId }),
              Evaluation.distinct('student_id', { course_id: courseObjectId })
            ]);
            const involved = new Set([...evaluators, ...recipients].map(String));
            for (const s of wantsMove) {
              if (involved.has(String(existingByStudentId.get(s.student_id)._id))) {
                lockedIds.add(s.student_id);
                errors.push(`Student ${s.student_id} was not moved to ${s.group_assignment}: they have submitted or received evaluations in this course, so their team was kept.`);
              }
            }
          }
          // A second look just before a move: an evaluation may have been saved since the check above.
          const hasEvaluations = async (studentObjectId) => !!(await Evaluation.exists({
            course_id: courseObjectId,
            $or: [{ evaluator_id: studentObjectId }, { student_id: studentObjectId }]
          }));
          const movableStudents = studentsToUpdate.filter((s) => !lockedIds.has(s.student_id));

          // Combine new students and the existing students who may move, for team processing
          const allStudentsForTeamProcessing = [...filteredToCreate, ...movableStudents];

          // Step 1: Create Team records for unique team names
          console.log('Starting team creation process...');
          const uniqueTeamNames = [...new Set(allStudentsForTeamProcessing
            .map(s => s.group_assignment)
            .filter(teamName => teamName && teamName.trim() !== '')
          )];

          console.log('Unique team names found:', uniqueTeamNames);
          console.log('All students for team processing:', allStudentsForTeamProcessing.map(s => ({ id: s.student_id, team: s.group_assignment })));

          const createdTeams = {};
          for (const teamName of uniqueTeamNames) {
            try {
              console.log(`Processing team: ${teamName}`);
              // Check if team already exists for this course
              let existingTeam = await Team.findOne({ 
                team_name: teamName, 
                course_id: courseObjectId 
              });
              
              if (!existingTeam) {
                // Create new team
                const newTeam = new Team({
                  team_name: teamName,
                  course_id: courseObjectId,
                  students: [],
                  student_count: 0,
                  team_status: 'Active'
                });
                existingTeam = await newTeam.save();
                console.log(`✅ Created new team: ${teamName} with ID: ${existingTeam._id}`);
              } else {
                console.log(`Team already exists: ${teamName} with ID: ${existingTeam._id}`);
              }
              createdTeams[teamName] = existingTeam._id;
            } catch (teamError) {
              console.error(`❌ Error creating team ${teamName}:`, teamError);
              errors.push(`Failed to create team: ${teamName}`);
            }
          }

          // Step 2: Insert new students only
          let created = [];
          if (filteredToCreate.length > 0) {
            console.log('Starting student insertion...');
            try {
              created = await Student.insertMany(filteredToCreate, { ordered: false });
              console.log(`✅ Inserted ${created.length} new students`);
            } catch (insertError) {
              console.error('❌ Error inserting students:', insertError);
              // Try to get partial results
              const insertedStudents = await Student.find({
                course_id: courseObjectId,
                student_id: { $in: filteredToCreate.map(s => s.student_id) }
              });
              created = insertedStudents;
              console.log(`⚠️ Partial insertion: ${created.length} students were created despite errors`);
            }
          }
          
          // Nothing was saved (the insert failed outright): take the error path below
          // instead of going on to clear evaluations for a roster that was never applied.
          if (filteredToCreate.length > 0 && created.length === 0 && studentsToUpdate.length === 0) {
            throw new Error('No students could be saved.');
          }

          // Say which new students were not saved. The insert can save some rows and not others, with or without
          // throwing, and that used to be reported as a plain success (Codex review, 13 Oct 2026).
          const savedIds = new Set(created.map((s) => s.student_id));
          const failedToSave = filteredToCreate.map((s) => s.student_id).filter((id) => !savedIds.has(id));
          if (failedToSave.length > 0) {
            errors.push(`Could not save ${failedToSave.length} new student(s): ${failedToSave.join(', ')}.`);
          }

          // Step 3: Link all students to teams (use original CSV data for team assignments)
          console.log('Starting team linking process...');
          
          // Create a map of student_id to team assignment from CSV data
          const studentTeamMap = {};
          allStudentsForTeamProcessing.forEach(student => {
            if (student.group_assignment) {
              studentTeamMap[student.student_id] = student.group_assignment;
            }
          });
          
          console.log('Student team mapping:', studentTeamMap);
          
          // Get all students in the course to link them
          const allStudentsInCourse = await Student.find({ course_id: courseObjectId });
          
          // Step 4: Link students to teams using the CSV mapping. For each student: write the student, add them to
          // the new team's list, then take them out of every other team's list in the course. If a write fails the
          // student is still somewhere consistent, and uploading the file again finishes the job (every step can be
          // repeated). A student already in the course who is about to move is checked for evaluations once more
          // here, because one may have been saved since the first check.
          for (const student of allStudentsInCourse) {
            try {
              const teamAssignment = studentTeamMap[student.student_id];
              if (teamAssignment && createdTeams[teamAssignment]) {
                const teamId = createdTeams[teamAssignment];
                const isExisting = existingIds.has(student.student_id);
                const isMove = !student.team_id || String(student.team_id) !== String(teamId);
                if (isExisting && isMove && await hasEvaluations(student._id)) {
                  errors.push(`Student ${student.student_id} was not moved to ${teamAssignment}: they have submitted or received evaluations in this course, so their team was kept.`);
                  continue;
                }
                console.log(`Linking student ${student.student_id} to team ${teamAssignment} (ID: ${teamId})`);

                await Student.findByIdAndUpdate(student._id, {
                  team_id: teamId,
                  group_assignment: teamAssignment
                });
                await Team.findByIdAndUpdate(teamId, {
                  $addToSet: { students: student._id }
                });
                if (isExisting) {
                  await Team.updateMany(
                    { course_id: courseObjectId, _id: { $ne: teamId } },
                    { $pull: { students: student._id } }
                  );
                }
                console.log(`✅ Linked student ${student.student_id} to team ${teamAssignment}`);
              } else if (studentTeamMap[student.student_id]) {
                console.log(`Student ${student.student_id} has team assignment but team not found:`, teamAssignment);
              } else {
                console.log(`Student ${student.student_id} has no team assignment in CSV`);
              }
            } catch (linkError) {
              console.error(`❌ Error linking student ${student.student_id}:`, linkError);
              errors.push(`Failed to link student ${student.student_id} to team`);
            }
          }

          // Recount every team in the course: a move changes two of them, and an earlier partial failure may
          // have left a count stale.
          console.log('Updating team student counts...');
          const teamsInCourse = await Team.find({ course_id: courseObjectId }).select('_id');
          for (const { _id: teamId } of teamsInCourse) {
            const teamStudentCount = await Student.countDocuments({ team_id: teamId });
            await Team.findByIdAndUpdate(teamId, { student_count: teamStudentCount });
            console.log(`Updated team ${teamId} student count to ${teamStudentCount}`);
          }

          // Step 5: Update course student_count and team_count
          console.log('Updating course student count...');
          const Course = require('../models/Course');
          const studentCount = await Student.countDocuments({ course_id: courseObjectId });
          const teamCount = await Team.countDocuments({ course_id: courseObjectId });
          await Course.findByIdAndUpdate(courseObjectId, { 
            student_count: studentCount,
            team_count: teamCount 
          });
          console.log(`Updated course student count to ${studentCount}`);
          console.log(`Updated course team count to ${teamCount}`);

          // A roster upload never touches evaluations or evaluation links: previously submitted evaluations must be
          // saved, and rosters can be uploaded or updated without losing existing data (sponsor decision, 12 Oct 2026).
          // Clearing them is a separate, explicit action (the reset-evaluation-state endpoint).
          fs.unlinkSync(req.file.path); // Clean up temp file
          
          // Add error for duplicates if any were filtered
          if (filteredToCreate.length < studentsToCreate.length) {
            errors.push('Some students were not added because they already exist in this course.');
          }

          const teamsCreatedCount = Object.keys(createdTeams).length;
          console.log(`✅ CSV upload completed successfully!`);
          console.log(`New students created: ${created.length}`);
          console.log(`Existing students updated: ${studentsToUpdate.length}`);
          console.log(`Teams created/updated: ${teamsCreatedCount}`);
          console.log(`Team names: ${Object.keys(createdTeams).join(', ')}`);
          
          res.status(200).json({
            message: failedToSave.length > 0
              ? `Roster processed with some errors. ${created.length} new students added, ${failedToSave.length} could not be saved.`
              : `Roster processed successfully. ${created.length} new students added, ${studentsToUpdate.length} existing students updated.`,
            students: created.map(s => s.student_id),
            students_failed: failedToSave,
            students_updated: movableStudents.map(s => s.student_id),
            teams_created: teamsCreatedCount,
            team_names: Object.keys(createdTeams),
            errors
          });
        } catch (insertErr) {
          console.error('InsertMany error:', insertErr);
          fs.unlinkSync(req.file.path);
          errors.push('Some students could not be added (possible duplicates or DB error).');
          res.status(200).json({
            message: 'Roster uploaded with some errors.',
            students: [],
            teams_created: 0,
            errors
          });
        }
      });
  } catch (err) {
    err.code = 'SERVER_ERROR';
    err.status = 500;
    next(err);
  }
};

// Delete ALL students from a course
exports.deleteAllStudents = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(course_id)) {
      const err = new Error('Invalid course ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }

    const courseObjectId = new mongoose.Types.ObjectId(course_id);

    // Get count of students before deletion
    const studentCount = await Student.countDocuments({ course_id: courseObjectId });
    
    if (studentCount === 0) {
      return res.status(200).json({ 
        message: 'No students to delete.',
        deleted_count: 0 
      });
    }

    // Delete all students in the course
    const deleteResult = await Student.deleteMany({ course_id: courseObjectId });

    // Delete all related evaluations
    const Evaluation = require('../models/Evaluation');
    const evaluationsDeleteResult = await Evaluation.deleteMany({ course_id: courseObjectId });

    // Delete all teams in the course (since they'll be empty)
    const Team = require('../models/Team');
    const teamsDeleteResult = await Team.deleteMany({ course_id: courseObjectId });

    // Update course student_count and team_count to 0
    const Course = require('../models/Course');
    await Course.findByIdAndUpdate(courseObjectId, { 
      student_count: 0,
      team_count: 0 
    });

    console.log(`Deleted ${deleteResult.deletedCount} students, ${evaluationsDeleteResult.deletedCount} evaluations, and ${teamsDeleteResult.deletedCount} teams from course ${course_id}`);

    res.status(200).json({ 
      message: `Successfully deleted all students, evaluations, and teams from course.`,
      deleted_students: deleteResult.deletedCount,
      deleted_evaluations: evaluationsDeleteResult.deletedCount,
      deleted_teams: teamsDeleteResult.deletedCount
    });

  } catch (err) {
    console.error('Error deleting all students:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

/**
 * Reset evaluation state for a course (clear tokens and evaluation records)
 */
exports.resetEvaluationState = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(course_id)) {
      const err = new Error('Invalid course ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }

    const courseObjectId = new mongoose.Types.ObjectId(course_id);

    // Clear evaluation tokens from all students in this course
    const tokenUpdateResult = await Student.updateMany(
      { course_id: courseObjectId }, 
      { $unset: { evaluation_token: 1, evaluation_token_expires_at: 1, evaluation_deadline_zone: 1 }, $set: { evaluation_completed: false } }
    );

    // Clear all evaluation records for this course
    const Evaluation = require('../models/Evaluation');
    const evaluationDeleteResult = await Evaluation.deleteMany({ course_id: courseObjectId });

    console.log(`Reset evaluation state for course ${course_id}: cleared ${tokenUpdateResult.modifiedCount} tokens, deleted ${evaluationDeleteResult.deletedCount} evaluations`);

    res.status(200).json({
      message: 'Evaluation state reset successfully.',
      tokens_cleared: tokenUpdateResult.modifiedCount,
      evaluations_deleted: evaluationDeleteResult.deletedCount
    });

  } catch (err) {
    console.error('Error resetting evaluation state:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};