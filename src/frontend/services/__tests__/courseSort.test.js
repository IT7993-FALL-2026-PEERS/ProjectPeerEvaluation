import { sortCourses, nextSortConfig } from '../courseSort';

// How the course list is ordered: by the column the professor clicked, with ties broken the same
// way whichever direction is chosen (CICD-57, step 6).
const course = (fields) => ({ course_name: 'X', course_number: 'N', course_section: '1', semester: 'Fall 2026', ...fields });
const names = (courses) => courses.map((c) => c.course_name);
const asc = (key) => ({ key, direction: 'asc' });
const desc = (key) => ({ key, direction: 'desc' });

describe('sortCourses', () => {
  test('sorts by name, ignoring case, in either direction', () => {
    const courses = [course({ course_name: 'beta' }), course({ course_name: 'Alpha' }), course({ course_name: 'Gamma' })];

    expect(names(sortCourses(courses, asc('course_name')))).toEqual(['Alpha', 'beta', 'Gamma']);
    expect(names(sortCourses(courses, desc('course_name')))).toEqual(['Gamma', 'beta', 'Alpha']);
  });

  test('does not change the list it is given', () => {
    const courses = [course({ course_name: 'b' }), course({ course_name: 'a' })];

    sortCourses(courses, asc('course_name'));

    expect(names(courses)).toEqual(['b', 'a']);
  });

  test('sorts by course number, using the old course_code when a course has no number', () => {
    const courses = [
      course({ course_name: 'Old', course_number: undefined, course_code: 'CS 2000' }),
      course({ course_name: 'New', course_number: 'CS 1000' }),
      course({ course_name: 'Blank', course_number: '', course_code: undefined }),
    ];

    expect(names(sortCourses(courses, asc('course_number')))).toEqual(['Blank', 'New', 'Old']);
    expect(names(sortCourses(courses, desc('course_number')))).toEqual(['Old', 'New', 'Blank']);
  });

  test('puts a course with only an old course code in order, whichever side of the comparison it lands on', () => {
    const old = course({ course_name: 'Old', course_number: undefined, course_code: 'CS 2000' });
    const current = course({ course_name: 'New', course_number: 'CS 1000' });

    expect(names(sortCourses([old, current], asc('course_number')))).toEqual(['New', 'Old']);
    expect(names(sortCourses([current, old], asc('course_number')))).toEqual(['New', 'Old']);
    expect(names(sortCourses([old, current], desc('course_number')))).toEqual(['Old', 'New']);
    expect(names(sortCourses([current, old], desc('course_number')))).toEqual(['Old', 'New']);
  });

  test('sorts the counts as numbers, treating a missing count as 0', () => {
    const courses = [
      course({ course_name: 'Ten', student_count: 10 }),
      course({ course_name: 'None' }),
      course({ course_name: 'Nine', student_count: 9 }),
    ];

    expect(names(sortCourses(courses, asc('student_count')))).toEqual(['None', 'Nine', 'Ten']);
    expect(names(sortCourses(courses, desc('student_count')))).toEqual(['Ten', 'Nine', 'None']);
    expect(names(sortCourses([course({ course_name: 'Two', team_count: 2 }), course({ course_name: 'Zero' })], asc('team_count')))).toEqual(['Zero', 'Two']);
  });

  test('breaks a semester tie by name, in the same order whichever way the semesters go', () => {
    const courses = [
      course({ course_name: 'Databases', semester: 'Fall 2026' }),
      course({ course_name: 'Algorithms', semester: 'Spring 2027' }),
      course({ course_name: 'Capstone', semester: 'Fall 2026' }),
    ];

    expect(names(sortCourses(courses, asc('semester')))).toEqual(['Capstone', 'Databases', 'Algorithms']);
    expect(names(sortCourses(courses, desc('semester')))).toEqual(['Algorithms', 'Capstone', 'Databases']);
  });

  test('breaks any other tie by section number, lowest first, reading "2" before "10"', () => {
    const courses = [
      course({ course_name: 'Same', course_section: '10' }),
      course({ course_name: 'Same', course_section: '2' }),
      course({ course_name: 'Same', course_section: 'x' }),
    ];

    expect(sortCourses(courses, asc('course_name')).map((c) => c.course_section)).toEqual(['x', '2', '10']);
    expect(sortCourses(courses, desc('course_name')).map((c) => c.course_section)).toEqual(['x', '2', '10']);
  });

  test('leaves courses that are equal in every way in the order given', () => {
    const courses = [course({ id: 1 }), course({ id: 2 }), course({ id: 3 })];

    expect(sortCourses(courses, asc('course_name')).map((c) => c.id)).toEqual([1, 2, 3]);
  });

  test('copes with a missing field when sorting by it', () => {
    const courses = [course({ course_name: 'B', semester: 'Fall' }), course({ course_name: 'A', semester: undefined })];

    expect(() => sortCourses(courses, asc('semester'))).not.toThrow();
  });
});

describe('nextSortConfig', () => {
  test('a new column starts ascending', () => {
    expect(nextSortConfig(asc('course_name'), 'semester')).toEqual(asc('semester'));
    expect(nextSortConfig(desc('course_name'), 'semester')).toEqual(asc('semester'));
  });

  test('the same column flips: ascending becomes descending and back', () => {
    expect(nextSortConfig(asc('semester'), 'semester')).toEqual(desc('semester'));
    expect(nextSortConfig(desc('semester'), 'semester')).toEqual(asc('semester'));
  });
});
