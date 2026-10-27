import React from 'react';
import { Box, Typography } from '@mui/material';
import { TEAM_NAME_HELP } from '../services/teamName';

// The format guide at the top of both roster upload dialogs (Manage Students and the course row). It says what the
// server does with a file (backend studentController.uploadRoster): three columns every row needs, an optional
// team, and that a team is named Team 1, Team 2, ... — a row with any other team name is skipped and reported.
const EXAMPLE = [
  'student_id,name,email,team_name',
  '1001,Ann Archer,ann@example.edu,Team 1',
  '1002,Ben Baker,ben@example.edu,Team 1',
  '1003,Cy Cole,cy@example.edu,Team 2',
].join('\n');

function CsvFormatGuide() {
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Upload a CSV file with these columns. The first row is the header:
      </Typography>
      <Box sx={{ pl: 2, mb: 1 }}>
        <span style={{ fontWeight: 'bold', color: 'red', fontSize: '1.1em' }}>student_id,name,email,team_name</span>
      </Box>
      <Box component="ul" sx={{ m: 0, pl: 4, mb: 1 }}>
        <Typography component="li" variant="body2">student_id, name and email are required on every row.</Typography>
        <Typography component="li" variant="body2">
          team_name is optional. {TEAM_NAME_HELP} (just the number, like 3, also works.) A row with any other team name
          (such as Alpha) is skipped and reported.
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Example:</Typography>
      <Box
        component="pre"
        aria-label="Example CSV file"
        sx={{ m: 0, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.8rem', overflowX: 'auto' }}
      >
        {EXAMPLE}
      </Box>
    </Box>
  );
}

export default CsvFormatGuide;
