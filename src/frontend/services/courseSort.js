// How the course list is ordered, moved out of CourseManagement.js (CICD-57, step 6).
// `sortConfig` is { key, direction } with direction 'asc' or 'desc'.

// The sort after the professor clicks `key`: a new column starts ascending, the same column flips.
export function nextSortConfig(prev, key) {
  return { key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' };
}

// A sorted copy of `courses`.
export function sortCourses(courses, sortConfig) {
  return [...courses].sort((a, b) => {
    const { key, direction } = sortConfig;
    let aValue = a[key];
    let bValue = b[key];
    // Handle alternate keys for course_number
    if (key === 'course_number') {
      aValue = a.course_number || a.course_code || '';
      bValue = b.course_number || b.course_code || '';
    }
    // Handle numbers for student_count/team_count
    if (key === 'student_count' || key === 'team_count') {
      aValue = a[key] || 0;
      bValue = b[key] || 0;
    }
    // Fallback to string compare
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }
    if (aValue < bValue) return direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return direction === 'asc' ? 1 : -1;

    // If sorting by semester, use course_name as secondary (alphabetical)
    if (key === 'semester') {
      const aName = (a.course_name || '').toLowerCase();
      const bName = (b.course_name || '').toLowerCase();
      if (aName < bName) return -1;
      if (aName > bName) return 1;
    }
    // Always use course_section as final tiebreaker (numeric, ascending)
    const aSection = parseInt(a.course_section, 10) || 0;
    const bSection = parseInt(b.course_section, 10) || 0;
    if (aSection < bSection) return -1;
    if (aSection > bSection) return 1;
    return 0;
  });
}
