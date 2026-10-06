import { buildCourseQuery } from '../courseQuery';

// The query string the course list sends. A blank text filter is left out, but a blank status is
// sent as `course_status=`, because the server treats a missing status as Active and a blank one as
// "every course" (CICD-60).
const FILTERS = { course_name: '', course_number: '', course_section: '', semester: '', course_status: 'Active' };

describe('buildCourseQuery', () => {
  test('sends the default filters as just the Active status', () => {
    expect(buildCourseQuery(FILTERS)).toBe('course_status=Active');
  });

  test('sends a blank status as an empty value, so the server lists every course', () => {
    expect(buildCourseQuery({ ...FILTERS, course_status: '' })).toBe('course_status=');
  });

  test('sends a blank status whatever order the filters come in', () => {
    const query = buildCourseQuery({ course_status: '', course_name: 'Data' });

    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({ course_status: '', course_name: 'Data' });
  });

  test('sends Inactive as it is', () => {
    expect(buildCourseQuery({ ...FILTERS, course_status: 'Inactive' })).toBe('course_status=Inactive');
  });

  test('sends each text filter that has something in it, trimmed', () => {
    const query = buildCourseQuery({
      course_name: '  Data ', course_number: 'IT 3100', course_section: ' 02', semester: 'Fall 2026 ', course_status: 'Active',
    });

    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      course_name: 'Data', course_number: 'IT 3100', course_section: '02', semester: 'Fall 2026', course_status: 'Active',
    });
  });

  test('leaves out a text filter that is empty or only spaces', () => {
    expect(buildCourseQuery({ ...FILTERS, course_name: '   ', semester: '' })).toBe('course_status=Active');
  });

  test('encodes characters that would otherwise break the query', () => {
    const query = buildCourseQuery({ ...FILTERS, course_name: 'R&D = 100%' });

    expect(new URLSearchParams(query).get('course_name')).toBe('R&D = 100%');
    expect(query).not.toContain('R&D');
  });

  test('sends a status that is blank only through spaces as empty, not as a space', () => {
    expect(buildCourseQuery({ ...FILTERS, course_status: '  ' })).toBe('course_status=');
  });
});
