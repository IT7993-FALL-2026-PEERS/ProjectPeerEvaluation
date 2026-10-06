// The query string the course list sends to GET /api/courses, built from the search filters
// ({ course_name, course_number, course_section, semester, course_status }).
//
// A text filter with nothing in it is left out. The status is different: the server reads a missing
// course_status as Active and an empty one as "every course", so a blank status (the All choice) has
// to be sent as `course_status=` (CICD-60).
export function buildCourseQuery(filters) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text || key === 'course_status') query.append(key, text);
  });
  return query.toString();
}
