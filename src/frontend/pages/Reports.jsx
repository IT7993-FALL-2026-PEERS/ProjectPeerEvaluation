import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Alert,
  Chip,
  CircularProgress,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Download,
  Assessment,
  TrendingUp,
  People,
  School,
  ArrowBack,
  Comment
} from '@mui/icons-material';
import api from '../services/api';
import TeamGradesPanel from '../components/TeamGradesPanel';

function Reports() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const courseFromUrl = searchParams.get('course');
  
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(courseFromUrl || '');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gradingMethod, setGradingMethod] = useState('curved');
  const [alert, setAlert] = useState(null);
  const [courseInfo, setCourseInfo] = useState(null); // Store individual course info
  const [commentsDialogOpen, setCommentsDialogOpen] = useState(false);
  const [selectedStudentComments, setSelectedStudentComments] = useState(null);

  // Helper function to generate report for a specific course (the method is the one chosen in the box, unless one is given)
  const generateReportForCourse = useCallback(async (courseId, method = gradingMethod) => {
    if (!courseId) {
      console.warn('generateReportForCourse called without courseId');
      return;
    }

    console.log('🚀 Generating report for course:', courseId);
    setLoading(true);
    try {
      const params = new URLSearchParams({ gradingMethod: method });

      const response = await api.get(`/courses/${courseId}/reports?${params}`);
      setReportData(response.data);
      setAlert({ severity: 'success', message: 'Report generated successfully' });
    } catch (error) {
      console.error('Error generating report:', error);
      setAlert({ 
        severity: 'error', 
        message: error.response?.data?.message || 'Failed to generate report' 
      });
    } finally {
      setLoading(false);
    }
  }, [gradingMethod]);

  // Fetch courses on component mount
  useEffect(() => {
    console.log('🔍 Reports useEffect triggered, courseFromUrl:', courseFromUrl);
    const fetchCourses = async () => {
      try {
        const response = await api.get('/courses');
        const allCourses = response.data;
        const activeCourses = allCourses.filter(course => course.course_status === 'Active');
        setCourses(activeCourses);
        console.log('📚 Loaded courses:', activeCourses.length, 'active out of', allCourses.length, 'total');
        
        // If course was passed via URL, validate it exists
        if (courseFromUrl) {
          const courseFromAll = allCourses.find(course => course._id === courseFromUrl);
          const courseFromActive = activeCourses.find(course => course._id === courseFromUrl);
          
          console.log('🔍 Course lookup:', {
            courseFromUrl,
            foundInAll: !!courseFromAll,
            foundInActive: !!courseFromActive,
            courseStatus: courseFromAll?.course_status
          });
          
          if (courseFromActive) {
            console.log('✅ Valid active course from URL found');
            setSelectedCourse(courseFromUrl);
          } else if (courseFromAll) {
            console.log('⚠️ Course found but not active:', courseFromAll.course_status);
            setAlert({ 
              severity: 'warning', 
              message: `Course "${courseFromAll.course_name}" is ${courseFromAll.course_status.toLowerCase()}. Only active courses can generate reports.` 
            });
          } else {
            console.log('❌ Course not found in database');
            setAlert({ 
              severity: 'error', 
              message: 'Course not found. It may have been deleted.' 
            });
          }
        } else {
          console.log('ℹ️ No course from URL, manual selection required');
        }
      } catch (error) {
        console.error('Error fetching courses:', error);
        setAlert({ severity: 'error', message: 'Failed to load courses' });
      }
    };
    fetchCourses();
  }, [courseFromUrl]);

  // Fetch specific course info when courseFromUrl is provided
  useEffect(() => {
    if (courseFromUrl) {
      const fetchCourseInfo = async () => {
        try {
          console.log('🔍 Fetching specific course info for:', courseFromUrl);
          const response = await api.get(`/courses/${courseFromUrl}`);
          setCourseInfo(response.data);
          console.log('📋 Course info loaded:', response.data);
        } catch (error) {
          console.error('Error fetching course info:', error);
          // Don't set an alert here, just log the error
        }
      };
      fetchCourseInfo();
    }
  }, [courseFromUrl]);

  // Separate effect for auto-generating report when course is loaded
  useEffect(() => {
    if (courseFromUrl && courses.length > 0 && courses.some(course => course._id === courseFromUrl)) {
      console.log('🔄 Auto-generating report for course from URL');
      setTimeout(() => {
        generateReportForCourse(courseFromUrl);
      }, 100);
    }
  }, [courseFromUrl, courses, generateReportForCourse]);

  // Generate report
  const generateReport = async () => {
    if (!selectedCourse) {
      setAlert({ severity: 'warning', message: 'Please select a course' });
      return;
    }

    await generateReportForCourse(selectedCourse);
  };

  // Download report as CSV
  const downloadReport = async () => {
    // The file is for the report on the screen: its course and its method, which are not the ones in the boxes
    // after a change that has not been generated yet
    const reportCourse = reportData?.course?._id || selectedCourse;
    const reportMethod = reportData?.gradingMethod || gradingMethod;
    if (!reportCourse) {
      setAlert({ severity: 'warning', message: 'Please select a course first' });
      return;
    }

    try {
      const params = new URLSearchParams({
        gradingMethod: reportMethod
      });

      const response = await api.get(`/courses/${reportCourse}/reports/download?${params}`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `course_${reportCourse}_report.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setAlert({ severity: 'success', message: 'Report downloaded successfully' });
    } catch (error) {
      console.error('Error downloading report:', error);
      setAlert({ severity: 'error', message: 'Failed to download report' });
    }
  };

  // View comments for a student
  const viewStudentComments = (student) => {
    console.log('🔍 ViewStudentComments called with:', student);
    console.log('📋 Evaluation details:', student.evaluationDetails);
    console.log('📊 Has evaluationDetails?', !!student.evaluationDetails);
    console.log('📈 EvaluationDetails length:', student.evaluationDetails?.length);
    console.log('📝 First evaluation:', student.evaluationDetails?.[0]);
    console.log('💬 All student keys:', Object.keys(student));
    setSelectedStudentComments(student);
    setCommentsDialogOpen(true);
  };

  // Get letter grade color
  const getGradeColor = (grade) => {
    switch (grade) {
      case 'A': return 'success';
      case 'B': return 'primary';
      case 'C': return 'warning';
      case 'D': return 'error';
      case 'F': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        {/* <IconButton 
          onClick={() => navigate('/course-management')}
          sx={{ mr: 2 }}
        >
          <ArrowBack />
        </IconButton> */}
        <Box>
          <Typography variant="h4">
            📊 Evaluation Reports
          </Typography>
          {courseFromUrl && courses.length > 0 && (
            <Typography variant="subtitle1" color="text.secondary">
              {courses.find(c => c._id === selectedCourse)?.course_code} - {courses.find(c => c._id === selectedCourse)?.course_name}
            </Typography>
          )}
        </Box>
      </Box>

      {alert && (
        <Alert 
          severity={alert.severity} 
          onClose={() => setAlert(null)}
          sx={{ mb: 3 }}
        >
          {alert.message}
        </Alert>
      )}

      {/* Report Configuration */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Report Configuration
        </Typography>
        
        <Grid container spacing={3}>
          {/* Course Selection or Display */}
          <Grid item xs={12} md={4}>
            {courseFromUrl ? (
              // Show selected course info when coming from course management
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Course
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <School color="primary" />
                  <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                    {courseInfo ? (
                      `${courseInfo.course_name || 'Course'} ${courseInfo.course_section || 'Course Section'}`
                    ) : courses.length > 0 ? (
                      (() => {
                        const course = courses.find(c => c._id === selectedCourse || c.id === selectedCourse);
                        console.log('🔍 Course lookup debug:', {
                          selectedCourse,
                          coursesFound: courses.length,
                          foundCourse: course
                        });
                        if (course) {
                          return `${course.course_name || 'Course'} ${course.course_section || 'Course Section'}`;
                        } else {
                          return `Loading course details...`;
                        }
                      })()
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={16} />
                        Loading course information...
                      </Box>
                    )}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  startIcon={<ArrowBack />}
                  onClick={() => navigate('/course-management')}
                  sx={{ mt: 1 }}
                >
                  Back to Courses
                </Button>
              </Box>
            ) : (
              // Show course selection dropdown when accessing reports directly
              <FormControl fullWidth>
                <InputLabel>Select Course</InputLabel>
                <Select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  label="Select Course"
                >
                  {courses.map((course) => (
                    <MenuItem key={course._id} value={course._id}>
                      {course.course_code} - {course.course_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Grid>

          {/* Grading Method */}
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Grading Method</InputLabel>
              <Select
                value={gradingMethod}
                onChange={(e) => setGradingMethod(e.target.value)}
                label="Grading Method"
              >
                <MenuItem value="curved">Curved (mean 85, standard deviation 20)</MenuItem>
                <MenuItem value="mean">Regular (mean of the ratings)</MenuItem>
                <MenuItem value="multiplier">Contribution Multiplier (proposal)</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Actions */}
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', gap: 2, height: '100%', alignItems: 'center' }}>
              <Button
                variant="contained"
                onClick={generateReport}
                disabled={loading || !selectedCourse}
                startIcon={loading ? <CircularProgress size={20} /> : <Assessment />}
                fullWidth
              >
                {loading ? 'Generating...' : courseFromUrl ? 'Regenerate Report' : 'Generate Report'}
              </Button>
            </Box>
          </Grid>

          {/* Contribution Multiplier (CICD-81): the team's proposal, the sponsor has not decided it yet */}
          {gradingMethod === 'multiplier' && (
            <Grid item xs={12}>
              <Alert severity="info">
                <strong>Contribution Multiplier (the team&apos;s proposal, not yet decided by the sponsor):</strong> each team has one grade,
                the highest student score in the team unless you set it. A student&apos;s score is the median of the ratings received;
                the multiplier is that score ÷ the average of the other teammates, at most 1.00; the final grade is the team grade × the
                multiplier, rounded to the nearest 5. There is no floor: a student the multiplier takes below 70 keeps that grade and is
                flagged for you to review. A student with no ratings has no grade.
              </Alert>
            </Grid>
          )}

          {/* Curved grading: the sponsor's fixed parameters, nothing to set */}
          {gradingMethod === 'curved' && (
            <Grid item xs={12}>
              <Alert severity="info">
                <strong>Curved grading (the sponsor&apos;s method):</strong> the class is set to a mean of 85 and a standard deviation of 20.
                Adjusted score = 85 + 20 × (score − class mean) ÷ class standard deviation, at most 100.
                If every score is the same, everyone gets 85. It needs at least two students with evaluations.
              </Alert>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* Report Results */}
      {reportData && reportData.summary && (
        <>
          {/* Summary Statistics */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <People color="primary" />
                    <Typography variant="h6">{reportData.summary.totalStudents || 0}</Typography>
                  </Box>
                  <Typography color="textSecondary">Total Students</Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Assessment color="success" />
                    <Typography variant="h6">{reportData.summary.studentsWithEvaluations || 0}</Typography>
                  </Box>
                  <Typography color="textSecondary">With Evaluations</Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingUp color="warning" />
                    <Typography variant="h6">{reportData.summary.averageScore || 0}%</Typography>
                  </Box>
                  <Typography color="textSecondary">Class Average</Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <School color="info" />
                    <Typography variant="h6">
                      {reportData.summary.gradeDistribution ? 
                        Object.values(reportData.summary.gradeDistribution).reduce((a, b) => a + b, 0) : 0
                      }
                    </Typography>
                  </Box>
                  <Typography color="textSecondary">Graded Students</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Grade Distribution */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Grade Distribution
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {reportData.summary?.gradeDistribution ? Object.entries(reportData.summary.gradeDistribution).map(([grade, count]) => (
                <Chip
                  key={grade}
                  label={`${grade}: ${count}`}
                  color={getGradeColor(grade)}
                  variant={count > 0 ? 'filled' : 'outlined'}
                />
              )) : (
                <Typography color="text.secondary">No grade distribution available</Typography>
              )}
            </Box>
          </Paper>

          {/* Curved Grading Stats */}
          {gradingMethod === 'curved' && reportData.gradingSettings?.curveApplied === false && (
            <Alert severity="info" sx={{ mb: 3 }}>
              Fewer than two students have evaluations, so there is no class to curve. The scores below are the plain mean of the ratings.
            </Alert>
          )}
          {gradingMethod === 'curved' && reportData.gradingSettings?.classStats && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Curved Grading Statistics
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="textSecondary">Class Mean</Typography>
                  <Typography variant="h6">{reportData.gradingSettings.classStats.mean}%</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="textSecondary">Standard Deviation</Typography>
                  <Typography variant="h6">{reportData.gradingSettings.classStats.standardDeviation}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="textSecondary">Target Mean</Typography>
                  <Typography variant="h6">{reportData.gradingSettings.targetMean}%</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="textSecondary">Target Standard Deviation</Typography>
                  <Typography variant="h6">{reportData.gradingSettings.targetStandardDeviation}</Typography>
                </Grid>
              </Grid>
            </Paper>
          )}

          {/* Team grades: only for the report that was made with the Contribution Multiplier */}
          {/* It belongs to the course of the report on the screen, which is not the one chosen in the box after a change of course */}
          {reportData.gradingMethod === 'multiplier' && reportData.course?._id && (
            <TeamGradesPanel
              courseId={reportData.course._id}
              teams={reportData.teams || []}
              onChanged={() => generateReportForCourse(reportData.course._id, 'multiplier')}
            />
          )}

          {/* Student Results Table */}
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Student Results ({reportData.gradingMethod === 'multiplier' ? 'Contribution Multiplier' : gradingMethod === 'curved' ? 'Curved' : 'Regular'} Grading)
              </Typography>
              <Button
                variant="outlined"
                startIcon={<Download />}
                onClick={downloadReport}
              >
                Download CSV
              </Button>
            </Box>
            
            {/* Contribution Multiplier: the students it took below 70 are flagged, the grade is not raised */}
            {reportData.gradingMethod === 'multiplier' && reportData.summary?.flaggedStudents > 0 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {reportData.summary.flaggedStudents === 1
                  ? '1 student is flagged for review'
                  : `${reportData.summary.flaggedStudents} students are flagged for review`}
                : the multiplier took their grade below 70. They keep the grade it gives; check the ratings behind it
                before it is final.
              </Alert>
            )}

            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Student ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Team</TableCell>
                    <TableCell align="center">Evaluations</TableCell>
                    {gradingMethod === 'curved' && reportData.gradingMethod !== 'multiplier' && <TableCell align="center">Original Score</TableCell>}
                    {reportData.gradingMethod === 'multiplier' && <TableCell align="center">Score</TableCell>}
                    {reportData.gradingMethod === 'multiplier' && <TableCell align="center">Team Grade</TableCell>}
                    {reportData.gradingMethod === 'multiplier' && <TableCell align="center">Multiplier</TableCell>}
                    <TableCell align="center">Final Score</TableCell>
                    <TableCell align="center">Letter Grade</TableCell>
                    {gradingMethod === 'curved' && reportData.gradingMethod !== 'multiplier' && <TableCell align="center">Change</TableCell>}
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reportData.students && reportData.students.length > 0 ? reportData.students.map((student) => (
                    <TableRow key={student._id}>
                      <TableCell>{student.student_id}</TableCell>
                      <TableCell>{student.name}</TableCell>
                      <TableCell>{student.team_id?.team_name || 'No Team'}</TableCell>
                      <TableCell align="center">{student.evaluationsReceived}</TableCell>
                      {gradingMethod === 'curved' && reportData.gradingMethod !== 'multiplier' && (
                        <TableCell align="center">{student.originalScore}%</TableCell>
                      )}
                      {reportData.gradingMethod === 'multiplier' && (
                        <>
                          <TableCell align="center">{student.contributionScore == null ? '–' : `${student.contributionScore}%`}</TableCell>
                          <TableCell align="center">{student.teamGrade == null ? '–' : `${student.teamGrade}%`}</TableCell>
                          <TableCell align="center">{student.multiplier == null ? '–' : student.multiplier.toFixed(2)}</TableCell>
                        </>
                      )}
                      <TableCell align="center">
                        <strong>{student.finalScore}%</strong>
                        {student.flagged && (
                          <Tooltip title="The multiplier took this grade below 70. Check the ratings behind it before it is final.">
                            <Chip label="Review" color="warning" size="small" sx={{ ml: 1 }} />
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={student.letterGrade}
                          color={getGradeColor(student.letterGrade)}
                          size="small"
                        />
                      </TableCell>
                      {gradingMethod === 'curved' && reportData.gradingMethod !== 'multiplier' && (
                        <TableCell align="center">
                          {student.improvement > 0 && (
                            <Chip
                              label={`+${student.improvement}%`}
                              color="success"
                              size="small"
                            />
                          )}
                          {student.improvement < 0 && (
                            <Chip
                              label={`${student.improvement}%`}
                              color="warning"
                              size="small"
                            />
                          )}
                          {student.improvement === 0 && (
                            <Typography variant="body2" color="textSecondary">
                              No change
                            </Typography>
                          )}
                        </TableCell>
                      )}
                      <TableCell align="center">
                          {/* Show AI flag if any evaluation for this student is flagged, with extra visibility */}
                          {Array.isArray(student.evaluationDetails) && student.evaluationDetails.some(ev => ev.aiFlags?.flagged) && (
                            <Tooltip title="Flagged Evaluation">
                              <span role="img" aria-label="flag" style={{ color: '#d32f2f', fontWeight: 'bold', fontSize: '1.5em', marginRight: 12 }}>🚩</span>
                            </Tooltip>
                          )}
                          <Tooltip title="View Comments">
                            <IconButton
                              size="small"
                              onClick={() => viewStudentComments(student)}
                            >
                              <Comment />
                            </IconButton>
                          </Tooltip>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={reportData.gradingMethod === 'multiplier' ? 9 : gradingMethod === 'curved' ? 8 : 6} align="center">
                        <Typography color="text.secondary">No student data available</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {/* Comments Dialog */}
      <Dialog
        open={commentsDialogOpen}
        onClose={() => setCommentsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Comment />
            <Box>
              <Typography variant="h6">
                Peer Evaluation Feedback
              </Typography>
              <Typography variant="subtitle2" sx={{ opacity: 0.9 }}>
                {selectedStudentComments?.name}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedStudentComments?.evaluationDetails?.length > 0 ? (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Showing feedback that peers wrote about {selectedStudentComments.name} ({selectedStudentComments.evaluationDetails.length} evaluation(s))
              </Typography>
              {selectedStudentComments.evaluationDetails.map((evaluation, index) => (
                <Paper key={evaluation._id || index} sx={{ p: 3, mb: 2, bgcolor: 'grey.50', position: 'relative' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" color="primary">
                      Feedback from Peer #{index + 1}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Submitted: {evaluation.submitted_at ? new Date(evaluation.submitted_at).toLocaleDateString() : 'N/A'}
                    </Typography>
                  </Box>
                  {/* AI Flags - Highly Visible */}
                  {evaluation.aiFlags?.flagged && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" color="error" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span role="img" aria-label="flag">🚩</span>
                        <span>AI Flagged Evaluation</span>
                        <span>
                          <span style={{ fontWeight: 400, fontSize: 14 }}>
                            {evaluation.aiFlags.allFive && 'All 5s'}
                            {evaluation.aiFlags.allFive && evaluation.aiFlags.concerning ? ' & ' : ''}
                            {evaluation.aiFlags.concerning && 'Concerning Word'}
                          </span>
                        </span>
                      </Typography>
                    </Box>
                  )}
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                    What this peer said about {selectedStudentComments.name}:
                  </Typography>
                  <Typography 
                    variant="body1" 
                    sx={{ 
                      whiteSpace: 'pre-wrap', 
                      bgcolor: 'white', 
                      p: 2, 
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'grey.300',
                      minHeight: '60px'
                    }}
                  >
                    {evaluation.overall_feedback || 'No feedback provided'}
                  </Typography>
                  
                  {/* Show ratings that this peer gave to the selected student */}
                  {evaluation.ratings && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                        Ratings this peer gave to {selectedStudentComments.name}:
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={4}>
                          <Typography variant="caption">Professionalism: {evaluation.ratings?.professionalism || 0}/5</Typography>
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <Typography variant="caption">Communication: {evaluation.ratings?.communication || 0}/5</Typography>
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <Typography variant="caption">Work Ethic: {evaluation.ratings?.work_ethic || 0}/5</Typography>
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <Typography variant="caption">Knowledge/Skills: {evaluation.ratings?.content_knowledge_skills || 0}/5</Typography>
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <Typography variant="caption">Contribution: {evaluation.ratings?.overall_contribution || 0}/5</Typography>
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <Typography variant="caption">Participation: {evaluation.ratings?.participation || 0}/5</Typography>
                        </Grid>
                      </Grid>
                    </Box>
                  )}
                </Paper>
              ))}
            </Box>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="text.secondary">
                No peer evaluations available
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedStudentComments?.name} has not received any peer evaluations yet.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommentsDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Reports;