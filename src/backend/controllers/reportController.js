const mongoose = require('mongoose');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');
const Professor = require('../models/Professor');
const { toCsv } = require('../utils/csv');

/**
 * Calculate mean score for a student across all evaluation criteria
 */
const calculateMeanScore = (evaluations) => {
  console.log('🧮 calculateMeanScore called with', evaluations.length, 'evaluations');
  if (!evaluations || evaluations.length === 0) {
    console.log('⚠️ No evaluations provided');
    return 0;
  }
  
  const criteriaKeys = ['professionalism', 'communication', 'work_ethic', 'content_knowledge_skills', 'overall_contribution', 'participation'];
  let totalSum = 0;
  let totalCount = 0;
  
  evaluations.forEach((evaluation, index) => {
    console.log(`📋 Processing evaluation ${index + 1}:`, evaluation.ratings);
    if (evaluation.ratings) {
      criteriaKeys.forEach(criterion => {
        if (evaluation.ratings[criterion] && evaluation.ratings[criterion] > 0) {
          // Normalize participation score (1-4 scale) to 1-5 scale to match other criteria
          const score = criterion === 'participation' ? 
            (evaluation.ratings[criterion] * 5 / 4) : 
            evaluation.ratings[criterion];
          console.log(`  ${criterion}: ${evaluation.ratings[criterion]} -> ${score}`);
          totalSum += score;
          totalCount++;
        }
      });
    } else {
      console.log(`❌ Evaluation ${index + 1} has no ratings object`);
    }
  });
  
  const result = totalCount > 0 ? (totalSum / totalCount) * 20 : 0; // Convert to percentage (1-5 scale * 20 = 0-100%)
  console.log(`🎯 Final result: totalSum=${totalSum}, totalCount=${totalCount}, meanScore=${result}`);
  return result;
};

/**
 * Apply curved grading formula
 */
const applyCurvedGrading = (scores, boostFactor = 0.5, protectionThreshold = 80) => {
  // Calculate class statistics
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const standardDeviation = Math.sqrt(variance);
  
  // Apply curved grading
  const adjustedScores = scores.map(score => {
    // Protect scores >= threshold
    if (score >= protectionThreshold) {
      return score;
    }
    
    // Apply boost formula: score + k(mean - score)
    const boostedScore = score + boostFactor * (mean - score);
    
    // Ensure score doesn't exceed 100
    return Math.min(boostedScore, 100);
  });
  
  return {
    originalScores: scores,
    adjustedScores,
    classStats: {
      mean: parseFloat(mean.toFixed(2)),
      standardDeviation: parseFloat(standardDeviation.toFixed(2)),
      boostFactor,
      protectionThreshold
    }
  };
};

/**
 * Convert numeric score to letter grade
 */
const getLetterGrade = (score) => {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
};

/**
 * Get comprehensive course report with grading options
 */
exports.getCourseReport = async (req, res, next) => {
  try {
    console.log('📊 Starting getCourseReport for course:', req.params.course_id);
    const { course_id } = req.params;
    const { gradingMethod = 'mean', boostFactor = 0.5, protectionThreshold = 80 } = req.query;
    
    console.log('📋 Query parameters:', { gradingMethod, boostFactor, protectionThreshold });
    
    if (!mongoose.Types.ObjectId.isValid(course_id)) {
      console.log('❌ Invalid course ID:', course_id);
      const err = new Error('Invalid course ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }

    const courseObjectId = new mongoose.Types.ObjectId(course_id);

    // Get course details
    console.log('🔍 Finding course with ID:', courseObjectId);
    const course = await Course.findById(courseObjectId);
    if (!course) {
      console.log('❌ Course not found');
      const err = new Error('Course not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }
    console.log('✅ Course found:', course.course_name);

    // Get all students in the course with their teams
    console.log('👥 Finding students in course...');
    const students = await Student.find({ course_id: courseObjectId }).populate('team_id');
    console.log('📊 Students found:', students.length);
    
    // Log a sample student to see the structure
    if (students.length > 0) {
      console.log('👤 Sample student structure:', {
        _id: students[0]._id,
        student_name: students[0].student_name,
        course_id: students[0].course_id,
        team_id: students[0].team_id
      });
    }
    
    if (students.length === 0) {
      console.log('⚠️ No students found in course');
      return res.status(200).json({
        course: course,
        students: [],
        teams: [],
        gradingMethod,
        message: 'No students found in this course'
      });
    }

    // Get all evaluations for this course
    console.log('📝 Finding evaluations for course...');
    const evaluations = await Evaluation.find({ course_id: courseObjectId });
    console.log('📊 Evaluations found:', evaluations.length);
    
    // Log a sample evaluation to see the structure
    if (evaluations.length > 0) {
      console.log('📋 Sample evaluation structure:', {
        _id: evaluations[0]._id,
        course_id: evaluations[0].course_id,
        student_id: evaluations[0].student_id,
        evaluator_id: evaluations[0].evaluator_id,
        hasRatings: !!evaluations[0].ratings
      });
    }
    
    if (evaluations.length === 0) {
      console.log('⚠️ No evaluations found');
      return res.status(200).json({
        course: course,
        students: students.map(student => ({
          ...student.toObject(),
          meanScore: 0,
          letterGrade: 'No evaluations',
          evaluationsReceived: 0
        })),
        teams: [],
        gradingMethod,
        message: 'No evaluations found for this course'
      });
    }

    // AI flagging logic
    const professor = await Professor.findById(course.professor_id);
    const configuredWords = professor
      ? professor.aiConcerningWords
      : Professor.schema.path('aiConcerningWords').getDefault(null);
    const concerningWords = configuredWords
      .filter(word => typeof word === 'string')
      .map(word => word.trim().toLowerCase())
      .filter(Boolean);

    function flagEvaluation(evaluation) {
      // Flag if all ratings are 5 (except participation)
      const ratings = evaluation.ratings || {};
      const allFive = ['professionalism', 'communication', 'work_ethic', 'content_knowledge_skills', 'overall_contribution']
        .every(key => ratings[key] === 5);
      // Check for concerning words in feedback
      const feedback = (evaluation.overall_feedback || '').toLowerCase();
      const concerning = concerningWords.some(word => feedback.includes(word));
      return {
        allFive,
        concerning,
        flagged: allFive || concerning
      };
    }

    // Calculate scores for each student
    console.log('🧮 Calculating scores for', students.length, 'students');
    const studentScores = students.map(student => {
      console.log('Processing student:', student._id, 'name:', student.student_name);
      const studentEvaluations = evaluations.filter(
        evaluation => {
          // More robust checks for undefined values
          try {
            if (!evaluation || !evaluation.student_id || !student || !student._id) {
              console.log('❌ Missing required IDs:', { 
                hasEval: !!evaluation, 
                hasStudentId: !!(evaluation && evaluation.student_id), 
                hasStudent: !!student, 
                hasStudentObjId: !!(student && student._id) 
              });
              return false;
            }
            return evaluation.student_id.toString() === student._id.toString();
          } catch (error) {
            console.error('❌ Error comparing IDs:', error, { eval: evaluation, student: student });
            return false;
          }
        }
      );
      
      console.log(`📊 Found ${studentEvaluations.length} evaluations for ${student.student_name}`);
      const meanScore = calculateMeanScore(studentEvaluations);
      // Add AI flags to each evaluation
      const evaluationDetails = studentEvaluations.map(evaluation => ({
        ...evaluation.toObject(),
        aiFlags: flagEvaluation(evaluation)
      }));
      return {
        student: student,
        originalScore: parseFloat(meanScore.toFixed(2)),
        evaluationsReceived: studentEvaluations.length,
        evaluationDetails
      };
    });

    // Extract just the scores for grading calculations
    const rawScores = studentScores.map(item => item.originalScore).filter(score => score > 0);
    
    let gradingResults;
    if (gradingMethod === 'curved' && rawScores.length > 1) {
      gradingResults = applyCurvedGrading(rawScores, parseFloat(boostFactor), parseFloat(protectionThreshold));
    }

    // Apply grading results to students
    const studentsWithGrades = studentScores.map((item, index) => {
      let finalScore = item.originalScore;
      
      if (gradingMethod === 'curved' && gradingResults && item.originalScore > 0) {
        const scoreIndex = rawScores.indexOf(item.originalScore);
        if (scoreIndex !== -1) {
          finalScore = parseFloat(gradingResults.adjustedScores[scoreIndex].toFixed(2));
        }
      }
      
      return {
        ...item.student.toObject(),
        originalScore: item.originalScore,
        finalScore: finalScore,
        letterGrade: finalScore > 0 ? getLetterGrade(finalScore) : 'No evaluations',
        evaluationsReceived: item.evaluationsReceived,
        evaluationDetails: item.evaluationDetails, // Include the evaluation details!
        improvement: gradingMethod === 'curved' && item.originalScore > 0 ? 
          parseFloat((finalScore - item.originalScore).toFixed(2)) : 0
      };
    });

    // Get team statistics
    const teams = await Team.find({ course_id: courseObjectId });
    const teamStats = teams.map(team => {
      const teamStudents = studentsWithGrades.filter(
        // team_id is populated, so after toObject() it's a plain object, not an id
        student => student.team_id && String(student.team_id._id || student.team_id) === team._id.toString()
      );
      
      const teamScores = teamStudents.map(s => s.finalScore).filter(score => score > 0);
      const avgScore = teamScores.length > 0 ? 
        parseFloat((teamScores.reduce((sum, score) => sum + score, 0) / teamScores.length).toFixed(2)) : 0;
      
      return {
        ...team.toObject(),
        students: teamStudents,
        averageScore: avgScore,
        letterGrade: avgScore > 0 ? getLetterGrade(avgScore) : 'No evaluations'
      };
    });

    // Summary statistics
    const finalScores = studentsWithGrades.map(s => s.finalScore).filter(score => score > 0);
    const summary = {
      totalStudents: students.length,
      studentsWithEvaluations: finalScores.length,
      averageScore: finalScores.length > 0 ? 
        parseFloat((finalScores.reduce((sum, score) => sum + score, 0) / finalScores.length).toFixed(2)) : 0,
      gradeDistribution: {
        A: finalScores.filter(score => score >= 90).length,
        B: finalScores.filter(score => score >= 80 && score < 90).length,
        C: finalScores.filter(score => score >= 70 && score < 80).length,
        D: finalScores.filter(score => score >= 60 && score < 70).length,
        F: finalScores.filter(score => score < 60).length
      }
    };

    const response = {
      course: course,
      students: studentsWithGrades,
      teams: teamStats,
      summary,
      gradingMethod,
      gradingSettings: gradingMethod === 'curved' ? {
        boostFactor: parseFloat(boostFactor),
        protectionThreshold: parseFloat(protectionThreshold),
        classStats: gradingResults?.classStats
      } : null
    };

    res.status(200).json(response);

  } catch (err) {
    console.error('❌ Error generating course report:');
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Course ID:', req.params.course_id);
    console.error('Query params:', req.query);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

/**
 * Download report as CSV
 */
exports.downloadReport = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    const { gradingMethod = 'mean', boostFactor = 0.5, protectionThreshold = 80 } = req.query;
    
    // Get the report data (reuse the logic from getCourseReport)
    req.params.course_id = course_id;
    req.query = { gradingMethod, boostFactor, protectionThreshold };
    
    // Create a mock response object to capture the report data
    const mockRes = {
      status: () => mockRes,
      json: (data) => {
        // Convert to CSV format
        const csvHeaders = [
          'Student ID',
          'Name', 
          'Email',
          'Team',
          'Original Score',
          'Final Score',
          'Letter Grade',
          'Evaluations Received',
          'Improvement'
        ];
        
        const csvRows = data.students.map(student => [
          student.student_id,
          student.name,
          student.email,
          student.team_id?.team_name || 'No Team',
          student.originalScore,
          student.finalScore,
          student.letterGrade,
          student.evaluationsReceived,
          student.improvement || 0
        ]);
        
        const csvContent = toCsv([csvHeaders, ...csvRows]);
        
        // Send CSV file
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="course_${course_id}_report.csv"`);
        res.status(200).send(csvContent);
      }
    };
    
    // Call getCourseReport with mock response
    await exports.getCourseReport(req, mockRes, next);
    
  } catch (err) {
    console.error('Error downloading report:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

/**
 * Get individual student report
 */
exports.getStudentReport = async (req, res, next) => {
  try {
    const { course_id, student_id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(course_id)) {
      const err = new Error('Invalid course ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }

    const courseObjectId = new mongoose.Types.ObjectId(course_id);
    
    // Find the student
    const student = await Student.findOne({ 
      course_id: courseObjectId, 
      student_id: student_id 
    }).populate('team_id');
    
    if (!student) {
      const err = new Error('Student not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }

    // Get evaluations for this student
    const evaluations = await Evaluation.find({ 
      course_id: courseObjectId,
      student_id: student._id 
    });

    // Get evaluations by this student
    const evaluationsByStudent = await Evaluation.find({
      course_id: courseObjectId,
      evaluator_id: student._id
    });

    const meanScore = calculateMeanScore(evaluations);

    res.status(200).json({
      student: student,
      meanScore: parseFloat(meanScore.toFixed(2)),
      letterGrade: meanScore > 0 ? getLetterGrade(meanScore) : 'No evaluations',
      evaluationsReceived: evaluations.length,
      evaluationsGiven: evaluationsByStudent.length,
      detailedEvaluations: evaluations
    });

  } catch (err) {
    console.error('Error getting student report:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

/**
 * Get team report
 */
exports.getTeamReport = async (req, res, next) => {
  try {
    const { course_id, team_id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(course_id) || !mongoose.Types.ObjectId.isValid(team_id)) {
      const err = new Error('Invalid course ID or team ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }

    const courseObjectId = new mongoose.Types.ObjectId(course_id);
    const teamObjectId = new mongoose.Types.ObjectId(team_id);
    
    // Find the team
    const team = await Team.findById(teamObjectId);
    if (!team) {
      const err = new Error('Team not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }

    // Get team members
    const teamMembers = await Student.find({ 
      course_id: courseObjectId,
      team_id: teamObjectId 
    });

    // Get evaluations for team members
    const memberIds = teamMembers.map(member => member._id);
    const evaluations = await Evaluation.find({
      course_id: courseObjectId,
      student_id: { $in: memberIds }
    });

    // Calculate scores for each team member
      const memberScores = teamMembers.map(member => {
      const memberEvaluations = evaluations.filter(
        evaluation => evaluation.student_id.toString() === member._id.toString()
      );
      const meanScore = calculateMeanScore(memberEvaluations);
      
      return {
        ...member.toObject(),
        meanScore: parseFloat(meanScore.toFixed(2)),
        letterGrade: meanScore > 0 ? getLetterGrade(meanScore) : 'No evaluations',
        evaluationsReceived: memberEvaluations.length
      };
    });

    // Team statistics
    const teamScores = memberScores.map(m => m.meanScore).filter(score => score > 0);
    const teamAverage = teamScores.length > 0 ? 
      parseFloat((teamScores.reduce((sum, score) => sum + score, 0) / teamScores.length).toFixed(2)) : 0;

    res.status(200).json({
      team: team,
      members: memberScores,
      teamAverage: teamAverage,
      teamLetterGrade: teamAverage > 0 ? getLetterGrade(teamAverage) : 'No evaluations'
    });

  } catch (err) {
    console.error('Error getting team report:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

/**
 * Generate comprehensive report (alias for getCourseReport)
 */
exports.generateReport = async (req, res, next) => {
  return exports.getCourseReport(req, res, next);
};