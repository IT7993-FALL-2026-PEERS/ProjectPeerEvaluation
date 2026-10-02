const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Professor = require('../../models/Professor');
const Course = require('../../models/Course');
const Student = require('../../models/Student');
const Team = require('../../models/Team');

// The shared, deterministic fixture for the integration tests. Same ids, names and passwords
// on every run, so a failing test can be reproduced exactly.
//
//   Professor Ada  owns course CS 4850 with 4 students in two teams (Alpha: Ann, Ben; Beta: Cy, Di)
//   Professor Bo   owns course IT 3100 with 1 student (Eve), no team
//
// Passwords are test values only and appear nowhere else.
const PASSWORDS = { ada: 'ada-test-password-1', bo: 'bo-test-password-1' };

const id = (suffix) => new mongoose.Types.ObjectId(suffix.padStart(24, '0'));
const IDS = {
  ada: id('a1'),
  bo: id('b1'),
  courseAda: id('c1'),
  courseBo: id('c2'),
  teamAlpha: id('e1'),
  teamBeta: id('e2'),
  ann: id('f1'),
  ben: id('f2'),
  cy: id('f3'),
  di: id('f4'),
  eve: id('f5'),
};

async function seed() {
  // bcrypt cost 4 keeps the fixture fast; production uses 10.
  const [adaHash, boHash] = await Promise.all([
    bcrypt.hash(PASSWORDS.ada, 4),
    bcrypt.hash(PASSWORDS.bo, 4),
  ]);
  await Professor.create([
    { _id: IDS.ada, name: 'Ada Lovelace', email: 'ada@example.edu', password: adaHash, department: 'Computer Science' },
    { _id: IDS.bo, name: 'Bo Peep', email: 'bo@example.edu', password: boHash, department: 'Information Technology' },
  ]);
  await Course.create([
    {
      _id: IDS.courseAda, course_name: 'Capstone', course_number: 'CS 4850', course_section: '01',
      semester: 'Fall 2026', professor_id: IDS.ada, student_count: 4, team_count: 2,
    },
    {
      _id: IDS.courseBo, course_name: 'Databases', course_number: 'IT 3100', course_section: '02',
      semester: 'Fall 2026', professor_id: IDS.bo, student_count: 1, team_count: 0,
    },
  ]);
  await Team.create([
    { _id: IDS.teamAlpha, team_name: 'Alpha', course_id: IDS.courseAda, students: [IDS.ann, IDS.ben], student_count: 2 },
    { _id: IDS.teamBeta, team_name: 'Beta', course_id: IDS.courseAda, students: [IDS.cy, IDS.di], student_count: 2 },
  ]);
  await Student.create([
    { _id: IDS.ann, student_id: '1001', name: 'Ann Archer', email: 'ann@example.edu', course_id: IDS.courseAda, team_id: IDS.teamAlpha, group_assignment: 'Alpha' },
    { _id: IDS.ben, student_id: '1002', name: 'Ben Baker', email: 'ben@example.edu', course_id: IDS.courseAda, team_id: IDS.teamAlpha, group_assignment: 'Alpha' },
    { _id: IDS.cy, student_id: '1003', name: 'Cy Cole', email: 'cy@example.edu', course_id: IDS.courseAda, team_id: IDS.teamBeta, group_assignment: 'Beta' },
    { _id: IDS.di, student_id: '1004', name: 'Di Diaz', email: 'di@example.edu', course_id: IDS.courseAda, team_id: IDS.teamBeta, group_assignment: 'Beta' },
    { _id: IDS.eve, student_id: '2001', name: 'Eve Evans', email: 'eve@example.edu', course_id: IDS.courseBo },
  ]);
  return { IDS, PASSWORDS };
}

module.exports = { seed, IDS, PASSWORDS };
