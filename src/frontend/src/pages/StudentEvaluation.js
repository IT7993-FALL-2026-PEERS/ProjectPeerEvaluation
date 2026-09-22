import React, { useState, useEffect } from 'react';
import SchoolIcon from '@mui/icons-material/School';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  FormControl,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Grid,
  Avatar,
  AppBar,
  Toolbar
} from '@mui/material';
import { CheckCircle as CheckIcon, Person as PersonIcon } from '@mui/icons-material';
import api from '../services/api';

function StudentEvaluation() {
  const { token } = useParams();
  const navigate = useNavigate();
  
  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [evaluationData, setEvaluationData] = useState(null);
  const [evaluations, setEvaluations] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Load evaluation form data
  useEffect(() => {
    const loadEvaluationForm = async () => {
      try {
        const response = await api.get(`/evaluate/${token}`);
        
        if (response.data.completed) {
          setSuccess(true);
          setEvaluationData({ 
            course: { name: 'Course' }, 
            evaluator: { name: 'Student' },
            submitted_at: response.data.submitted_at 
          });
        } else {
          setEvaluationData(response.data);
          
          // Initialize evaluation state for each teammate
          const initialEvaluations = {};
          response.data.teammates.forEach(teammate => {
            initialEvaluations[teammate._id] = {
              student_id: teammate._id,
              ratings: {
                professionalism: '',
                communication: '',
                work_ethic: '',
                content_knowledge_skills: '',
                overall_contribution: '',
                participation: ''
              },
              overall_feedback: ''
            };
          });
          setEvaluations(initialEvaluations);
        }
      } catch (error) {
        console.error('Error loading evaluation form:', error);
        const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || 'Failed to load evaluation form';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      loadEvaluationForm();
    } else {
      setError('No evaluation token provided');
      setLoading(false);
    }
  }, [token]);

  // Handle rating change
  const handleRatingChange = (teammateId, criterion, value) => {
    setEvaluations(prev => ({
      ...prev,
      [teammateId]: {
        ...prev[teammateId],
        ratings: {
          ...prev[teammateId].ratings,
          [criterion]: parseInt(value)
        }
      }
    }));
  };

  // Handle feedback change
  const handleFeedbackChange = (teammateId, feedback) => {
    setEvaluations(prev => ({
      ...prev,
      [teammateId]: {
        ...prev[teammateId],
        overall_feedback: feedback
      }
    }));
  };

  // Submit evaluation
  const handleSubmit = async () => {
    console.log('Submit button clicked!');
    console.log('Current evaluations state:', evaluations);
    
    // Validate all evaluations
    const evaluationArray = Object.values(evaluations);
    console.log('Evaluation array:', evaluationArray);
    
    for (const evaluation of evaluationArray) {
      // Check all ratings are filled
      for (const [criterion, value] of Object.entries(evaluation.ratings)) {
        if (value === '' || value === null || value === undefined) {
          console.log(`Missing rating for ${criterion}:`, value);
          setError(`Please provide a rating for ${criterion.replace('_', ' ')} for all team members.`);
          return;
        }
      }
      
      // Check feedback is provided
      if (!evaluation.overall_feedback || evaluation.overall_feedback.trim().length < 10) {
        console.log('Missing or insufficient feedback:', evaluation.overall_feedback);
        setError('Please provide overall feedback (at least 10 characters) for all team members.');
        return;
      }
    }

    console.log('Validation passed, submitting...');
    setSubmitting(true);
    setError('');

    try {
      console.log('Making API call to:', `/evaluate/${token}`);
      const response = await api.post(`/evaluate/${token}`, {
        evaluations: evaluationArray
      });
      
      console.log('API response:', response);
      setSuccess(true);
    } catch (error) {
      console.error('Error submitting evaluation:', error);
      console.error('Error response:', error.response);
      setError(error.response?.data?.error?.message || 'Failed to submit evaluation');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  // Success state
  if (success) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CheckIcon color="success" sx={{ fontSize: 64, mb: 2 }} />
          <Typography variant="h4" gutterBottom color="success.main">
            Evaluation Completed!
          </Typography>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Thank you for completing your peer evaluation. Your responses have been submitted successfully.
          </Typography>
          {evaluationData?.submitted_at && (
            <Typography variant="body2" color="text.secondary">
              Submitted: {new Date(evaluationData.submitted_at).toLocaleString()}
            </Typography>
          )}
          <Box sx={{ mt: 3 }}>
            <Button variant="outlined" onClick={() => navigate('/')}>
              Return to Home
            </Button>
          </Box>
        </Paper>
      </Container>
    );
  }

  // Error state
  if (error && !evaluationData) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      {/* AppBar Header */}
      <AppBar position="static" color="primary" elevation={2} sx={{ mb: 4, borderRadius: 2 }}>
        <Toolbar>
          <Avatar sx={{ bgcolor: 'white', color: 'primary.main', mr: 2 }}>
            <SchoolIcon />
          </Avatar>
          <Typography variant="h5" color="inherit" sx={{ flexGrow: 1, fontWeight: 700 }}>
            {evaluationData?.rubric?.title || 'Peer Evaluation'}
          </Typography>
        </Toolbar>
      </AppBar>
      <Paper sx={{ p: 3, mb: 3, boxShadow: 3, borderRadius: 3 }}>
        <Typography variant="h6" color="primary" gutterBottom>
          {evaluationData?.rubric?.description}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ boxShadow: 1, borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" color="primary" gutterBottom>
                  Course Information
                </Typography>
                <Typography variant="body2">
                  <strong>Course:</strong> {evaluationData?.course?.name}
                </Typography>
                <Typography variant="body2">
                  <strong>Section:</strong> {evaluationData?.course?.number} - {evaluationData?.course?.section}
                </Typography>
                <Typography variant="body2">
                  <strong>Semester:</strong> {evaluationData?.course?.semester}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ boxShadow: 1, borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" color="primary" gutterBottom>
                  Your Information
                </Typography>
                <Typography variant="body2">
                  <strong>Name:</strong> {evaluationData?.evaluator?.name}
                </Typography>
                <Typography variant="body2">
                  <strong>Student ID:</strong> {evaluationData?.evaluator?.student_id}
                </Typography>
                <Typography variant="body2">
                  <strong>Team:</strong> {evaluationData?.evaluator?.team}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Evaluation Forms */}
      {evaluationData?.teammates?.map((teammate, index) => (
        <Card key={teammate._id} sx={{ p: 3, mb: 4, boxShadow: 4, borderRadius: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                <PersonIcon />
              </Avatar>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Evaluate: {teammate.name}
              </Typography>
              <Chip label={teammate.student_id} sx={{ ml: 2, fontWeight: 500 }} color="primary" />
            </Box>
            <Divider sx={{ mb: 2 }} />
            {/* Rating Criteria */}
            {evaluationData?.rubric?.criteria?.map((criterion) => (
              <Box key={criterion.id} sx={{ mb: 3 }}>
                <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 500 }} gutterBottom>
                  {criterion.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {criterion.description}
                </Typography>
                <FormControl component="fieldset">
                  <RadioGroup
                    row
                    value={evaluations[teammate._id]?.ratings[criterion.id] || ''}
                    onChange={(e) => handleRatingChange(teammate._id, criterion.id, e.target.value)}
                  >
                    {Object.entries(criterion.scaleDescriptions)
                      .sort(([a], [b]) => parseInt(b) - parseInt(a))
                      .map(([value, description]) => (
                        <FormControlLabel
                          key={value}
                          value={value}
                          control={<Radio sx={{ color: 'primary.main' }} />}
                          label={
                            <Box>
                              <Typography variant="body2" fontWeight="bold" color="primary.main">
                                {value}
                              </Typography>
                              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                                {description}
                              </Typography>
                            </Box>
                          }
                          sx={{ mr: 3, alignItems: 'flex-start' }}
                        />
                      ))}
                  </RadioGroup>
                </FormControl>
              </Box>
            ))}
            {/* Overall Feedback */}
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 500 }} gutterBottom>
                {evaluationData?.rubric?.overallFeedback?.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {evaluationData?.rubric?.overallFeedback?.description}
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={4}
                value={evaluations[teammate._id]?.overall_feedback || ''}
                onChange={(e) => handleFeedbackChange(teammate._id, e.target.value)}
                placeholder="Provide constructive feedback for this team member..."
                helperText={`${evaluations[teammate._id]?.overall_feedback?.length || 0} characters (minimum 10 required)`}
                sx={{ bgcolor: '#f5f5f5', borderRadius: 2 }}
              />
            </Box>
            {index < evaluationData.teammates.length - 1 && <Divider sx={{ mt: 3 }} />}
          </CardContent>
        </Card>
      ))}

      {/* Submit Button */}
      <Box sx={{ textAlign: 'center', mt: 4 }}>
        <Button
          variant="contained"
          size="large"
          onClick={handleSubmit}
          disabled={submitting}
          sx={{ minWidth: 200, fontWeight: 700, fontSize: 18, boxShadow: 2, borderRadius: 2 }}
        >
          {submitting ? <CircularProgress size={24} /> : 'Submit Evaluation'}
        </Button>
      </Box>
      {/* Footer */}
      <Box sx={{ mt: 6, textAlign: 'center', color: 'text.secondary' }}>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="body2">
          &copy; {new Date().getFullYear()} Project Peer Evaluation | For help, contact your instructor or support.
        </Typography>
      </Box>
    </Container>
  );
}

export default StudentEvaluation;