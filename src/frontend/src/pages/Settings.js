import React, { useState, useEffect } from 'react';
import { Box, Typography, List, ListItem, ListItemText, IconButton, TextField, Button, Paper } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import api from '../services/api';

function Settings() {
  const navigate = useNavigate();
  const [words, setWords] = useState([]);
  const [newWord, setNewWord] = useState('');
  const [editIndex, setEditIndex] = useState(null);
  const [editWord, setEditWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch current words from backend
    const fetchWords = async () => {
      setLoading(true);
      try {
        const res = await api.get('/professor/ai-words');
        setWords(res.data.words || []);
      } catch (err) {
        setError('Failed to load words');
      } finally {
        setLoading(false);
      }
    };
    fetchWords();
  }, []);

  const handleAddWord = async () => {
    if (!newWord.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/professor/ai-words', { action: 'add', word: newWord.trim() });
      setWords(res.data.words);
      setNewWord('');
    } catch (err) {
      setError('Failed to add word');
    } finally {
      setLoading(false);
    }
  };

  const handleEditWord = (index) => {
    setEditIndex(index);
    setEditWord(words[index]);
  };

  const handleSaveEdit = async () => {
    if (!editWord.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/professor/ai-words', { action: 'edit', index: editIndex, word: editWord.trim() });
      setWords(res.data.words);
      setEditIndex(null);
      setEditWord('');
    } catch (err) {
      setError('Failed to edit word');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWord = async (index) => {
    setLoading(true);
    try {
      const res = await api.post('/professor/ai-words', { action: 'delete', index });
      setWords(res.data.words);
    } catch (err) {
      setError('Failed to delete word');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 500, mx: 'auto', mt: 6 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/course-management')} sx={{ mb: 2 }}>
        Back to Courses
      </Button>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>AI Flagged Words Settings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Add, edit, or delete words that will be flagged as concerning in student evaluations.
        </Typography>
        {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
        <List>
          {words.map((word, idx) => (
            <ListItem key={idx} secondaryAction={
              editIndex === idx ? (
                <>
                  <IconButton edge="end" color="primary" onClick={handleSaveEdit}><SaveIcon /></IconButton>
                  <IconButton edge="end" color="secondary" onClick={() => { setEditIndex(null); setEditWord(''); }}><CancelIcon /></IconButton>
                </>
              ) : (
                <>
                  <IconButton edge="end" color="primary" onClick={() => handleEditWord(idx)}><EditIcon /></IconButton>
                  <IconButton edge="end" color="error" onClick={() => handleDeleteWord(idx)}><DeleteIcon /></IconButton>
                </>
              )
            }>
              {editIndex === idx ? (
                <TextField value={editWord} onChange={e => setEditWord(e.target.value)} size="small" />
              ) : (
                <ListItemText primary={word} />
              )}
            </ListItem>
          ))}
        </List>
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <TextField
            label="Add new word"
            value={newWord}
            onChange={e => setNewWord(e.target.value)}
            size="small"
          />
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddWord} disabled={loading}>Add</Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default Settings;
