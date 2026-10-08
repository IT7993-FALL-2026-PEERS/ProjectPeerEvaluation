import React from 'react';
import {
  Button, Box, Card, CardContent, Collapse, Typography, TextField, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';

// The "Search Courses" card, moved out of CourseManagement.js (CICD-57, step 6). The page owns the
// filters and runs the search; this shows them and reports what the professor types and presses.
// `filters` is { course_name, course_number, course_section, semester, course_status }, and
// onChange gets the whole object back with one field changed.
function CourseSearchFilters({ filters, show, onToggle, onChange, onSearch, onClear }) {
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" component="h2">
            Search Courses
          </Typography>
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={onToggle}
          >
            {show ? 'Hide Filters' : 'Show Filters'}
          </Button>
        </Box>

        <Collapse in={show}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 2 }}>
            <TextField
              fullWidth
              label="Course Name"
              value={filters.course_name}
              onChange={(e) => onChange({ ...filters, course_name: e.target.value })}
              placeholder="Software Engineering"
            />
            <TextField
              fullWidth
              label="Course Number"
              value={filters.course_number}
              onChange={(e) => onChange({ ...filters, course_number: e.target.value })}
              placeholder="CS 4850"
            />
            <TextField
              fullWidth
              label="Course Section"
              value={filters.course_section}
              onChange={(e) => onChange({ ...filters, course_section: e.target.value })}
              placeholder="01"
            />
            <TextField
              fullWidth
              label="Semester"
              value={filters.semester}
              onChange={(e) => onChange({ ...filters, semester: e.target.value })}
              placeholder="Fall 2025"
            />
            <FormControl fullWidth>
              <InputLabel>Course Status</InputLabel>
              <Select
                value={filters.course_status}
                label="Course Status"
                onChange={(e) => onChange({ ...filters, course_status: e.target.value })}
              >
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Inactive">Inactive</MenuItem>
                <MenuItem value="">All</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<SearchIcon />}
              onClick={onSearch}
            >
              Search
            </Button>
            <Button
              variant="outlined"
              startIcon={<ClearIcon />}
              onClick={onClear}
            >
              Clear
            </Button>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

export default CourseSearchFilters;
