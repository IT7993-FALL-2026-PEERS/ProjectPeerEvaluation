import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '../../services/api';
import Reports from '../Reports';

vi.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

// The professor's report page (CW-08, CW-09): pick a course, generate the grades, read the comments,
// download the CSV. The page is opened from the course list with ?course=<id>, or directly.
const COURSES = [
  { _id: 'c1', course_code: 'CS 4850', course_name: 'Capstone', course_section: '01', course_status: 'Active' },
  { _id: 'c2', course_code: 'CS 1000', course_name: 'Intro', course_section: '02', course_status: 'Inactive' },
];

const RATINGS = { professionalism: 5, communication: 5, work_ethic: 5, content_knowledge_skills: 5, overall_contribution: 5, participation: 4 };

const REPORT = {
  summary: { totalStudents: 4, studentsWithEvaluations: 3, averageScore: 81.88, gradeDistribution: { A: 2, B: 0, C: 1, F: 1 } },
  gradingSettings: { targetMean: 85, targetStandardDeviation: 20, curveApplied: true,
    classStats: { mean: 81.88, standardDeviation: 15.3, targetMean: 85, targetStandardDeviation: 20 } },
  students: [
    {
      _id: 's1', student_id: '1001', name: 'Ann Archer', team_id: { team_name: 'Team 1' }, evaluationsReceived: 1,
      originalScore: 100, finalScore: 100, letterGrade: 'A', improvement: 0,
      evaluationDetails: [{
        overall_feedback: 'Carried the project.', submitted_at: '2026-10-01T12:00:00Z', ratings: RATINGS,
        aiFlags: { flagged: true, allFive: true, concerning: true },
      }],
    },
    {
      _id: 's4', student_id: '1004', name: 'Di Diaz', team_id: null, evaluationsReceived: 0,
      originalScore: 50, finalScore: 55, letterGrade: 'F', improvement: 5, evaluationDetails: [],
    },
    {
      _id: 's5', student_id: '1005', name: 'Eli Estes', team_id: null, evaluationsReceived: 1,
      originalScore: 96, finalScore: 93, letterGrade: 'A', improvement: -3, evaluationDetails: [],
    },
  ],
};

// CICD-81: the same report made with the Contribution Multiplier: a team grade for each team, and per student a score,
// the team grade and the multiplier.
const MULTIPLIER_REPORT = {
  course: { _id: 'c1' },
  gradingMethod: 'multiplier',
  gradingSettings: { cap: 1, flagBelow: 70 },
  summary: { totalStudents: 4, studentsWithEvaluations: 3, averageScore: 77.78, gradeDistribution: { A: 1, B: 0, C: 1, F: 1 }, flaggedStudents: 1 },
  teams: [{ _id: 't1', team_name: 'Team 1', teamGrade: 100, teamGradeSource: 'automatic', automaticTeamGrade: 100 }],
  students: [
    {
      _id: 's1', student_id: '1001', name: 'Ann Archer', team_id: { team_name: 'Team 1' }, evaluationsReceived: 1,
      originalScore: 100, finalScore: 100, letterGrade: 'A', improvement: 0, evaluationDetails: [],
      contributionScore: 100, multiplier: 1, teamGrade: 100, teamGradeSource: 'automatic', calculatedScore: 100, finalScoreSource: 'calculated',
    },
    {
      _id: 's2', student_id: '1002', name: 'Ben Baker', team_id: { team_name: 'Team 1' }, evaluationsReceived: 1,
      originalScore: 76.67, finalScore: 75, letterGrade: 'C', improvement: 0, evaluationDetails: [],
      contributionScore: 76.67, multiplier: 0.7667, teamGrade: 100, teamGradeSource: 'automatic', calculatedScore: 75, finalScoreSource: 'calculated',
    },
    {
      _id: 's3', student_id: '1003', name: 'Cy Cole', team_id: { team_name: 'Team 1' }, evaluationsReceived: 0,
      originalScore: 0, finalScore: 0, letterGrade: 'No evaluations', improvement: 0, evaluationDetails: [],
      contributionScore: null, multiplier: null, teamGrade: 100, teamGradeSource: 'automatic', calculatedScore: null, finalScoreSource: null,
    },
    {
      // No floor: the multiplier took this student to 55 (rounded to a step of 5), so the report flags them for the instructor.
      _id: 's4', student_id: '1004', name: 'Di Diaz', team_id: { team_name: 'Team 1' }, evaluationsReceived: 1,
      originalScore: 56.67, finalScore: 55, letterGrade: 'F', improvement: 0, evaluationDetails: [],
      contributionScore: 56.67, multiplier: 0.5667, flagged: true, teamGrade: 100, teamGradeSource: 'automatic', calculatedScore: 55, finalScoreSource: 'calculated',
    },
  ],
};

const user = userEvent.setup({ delay: null });

// What axios rejects with when the server answers an error.
const serverError = (data) => Object.assign(new Error('Request failed'), { response: { data } });

// The API answers by address, like the real one.
function serve({ courses = COURSES, report = REPORT, course = COURSES[0] } = {}) {
  api.get.mockImplementation(async (url) => {
    if (url === '/courses') return { data: courses };
    if (url.startsWith('/courses/') && url.includes('/reports/download')) return { data: 'Student ID,Name\n' };
    if (url.startsWith('/courses/') && url.includes('/reports?')) return { data: report };
    if (/^\/courses\/[^/]+$/.test(url)) return { data: course };
    throw new Error(`unexpected request ${url}`);
  });
}

function renderReports(path = '/reports') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reports" element={<Reports />} />
        <Route path="/course-management" element={<h1>Course list</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

const reportRequest = () => api.get.mock.calls.map(([url]) => url).find((url) => url.includes('/reports?'));

async function chooseCourse(label) {
  await user.click(screen.getAllByRole('combobox')[0]);
  await user.click(await screen.findByRole('option', { name: label }));
}

describe('Reports', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    serve();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  test('offers only active courses, and Generate Report waits for a choice', async () => {
    renderReports();
    expect(screen.getByRole('button', { name: 'Generate Report' })).toBeDisabled();

    await user.click(screen.getAllByRole('combobox')[0]);
    expect(await screen.findByRole('option', { name: /CS 4850 - Capstone/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /CS 1000/ })).not.toBeInTheDocument();
  });

  test('generates the curved report by default and shows totals, grades, the original score and the change', async () => {
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));

    expect(await screen.findByText('Report generated successfully')).toBeInTheDocument();
    expect(reportRequest()).toBe('/courses/c1/reports?gradingMethod=curved');
    // The summary cards show their figure in a level-6 heading, above the label.
    const figures = screen.getAllByRole('heading', { level: 6 }).map((heading) => heading.textContent);
    expect(figures).toEqual(expect.arrayContaining(['4', '3', '81.88%']));
    ['Total Students', 'With Evaluations', 'Class Average'].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
    expect(screen.getByText('A: 2')).toBeInTheDocument();
    expect(screen.getByText('F: 1')).toBeInTheDocument();

    const ann = screen.getByRole('row', { name: /Ann Archer/ });
    expect(within(ann).getByText('Team 1')).toBeInTheDocument();
    expect(within(ann).getAllByText('100%').length).toBeGreaterThan(0);
    expect(screen.getByRole('row', { name: /Di Diaz/ })).toHaveTextContent('No Team');
    expect(screen.getByText('Original Score')).toBeInTheDocument();
    expect(screen.getByText('Change')).toBeInTheDocument();
  });

  test('curved grading has fixed settings: nothing to set, its formula and its statistics are shown', async () => {
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);

    expect(screen.queryByLabelText('Boost Factor (k)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Protection Threshold')).not.toBeInTheDocument();
    expect(screen.getByText(/the class is set to a mean of 85 and a standard deviation of 20/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByText('Report generated successfully');

    expect(screen.getByText('Curved Grading Statistics')).toBeInTheDocument();
    ['Class Mean', 'Standard Deviation', 'Target Mean', 'Target Standard Deviation'].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
    // 81.88% is also the class average card above, so it appears twice
    expect(screen.getAllByText('81.88%')).toHaveLength(2);
    expect(screen.getByText('15.3')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('+5%')).toBeInTheDocument();
    expect(screen.getByText('-3%')).toBeInTheDocument();
    expect(screen.getAllByText('No change').length).toBeGreaterThan(0);
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  test('says so when there are too few scored students to curve', async () => {
    serve({ report: { ...REPORT, gradingSettings: { targetMean: 85, targetStandardDeviation: 20, curveApplied: false } } });
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByText('Report generated successfully');

    expect(screen.getByText(/Fewer than two students have evaluations/)).toBeInTheDocument();
    expect(screen.queryByText('Curved Grading Statistics')).not.toBeInTheDocument();
  });

  test('the regular method is still a choice: it asks for the mean of the ratings and hides the curve columns', async () => {
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByText(/^Curved \(mean 85/));
    await user.click(await screen.findByRole('option', { name: 'Regular (mean of the ratings)' }));
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByText('Report generated successfully');

    expect(reportRequest()).toBe('/courses/c1/reports?gradingMethod=mean');
    expect(screen.queryByText('Original Score')).not.toBeInTheDocument();
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
    expect(screen.queryByText('Curved Grading Statistics')).not.toBeInTheDocument();
  });

  test('the Contribution Multiplier is a choice: it asks for it, explains it, and shows the score, team grade and multiplier', async () => {
    serve({ report: MULTIPLIER_REPORT });
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByText(/^Curved \(mean 85/));
    await user.click(await screen.findByRole('option', { name: 'Contribution Multiplier (proposal)' }));
    expect(screen.getByText(/the team's proposal, not yet decided by the sponsor/)).toBeInTheDocument();
    expect(screen.queryByText(/Curved grading \(the sponsor/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByText('Report generated successfully');

    expect(reportRequest()).toBe('/courses/c1/reports?gradingMethod=multiplier');
    expect(screen.getByText('Student Results (Contribution Multiplier Grading)')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Multiplier' })).toBeInTheDocument();
    // The team grades panel and the student table both have a Team Grade column.
    expect(screen.getAllByRole('columnheader', { name: 'Team Grade' })).toHaveLength(2);
    expect(screen.queryByText('Original Score')).not.toBeInTheDocument();
    const ben = screen.getByRole('row', { name: /Ben Baker/ });
    expect(ben).toHaveTextContent('76.67%');
    expect(ben).toHaveTextContent('75%');
    expect(ben).toHaveTextContent('100%');
    expect(ben).toHaveTextContent('0.77');
    // A student nobody rated has no score, multiplier or grade: dashes, not zeros.
    const cy = screen.getByRole('row', { name: /Cy Cole/ });
    expect(cy).toHaveTextContent('No evaluations');
    expect(cy.textContent.match(/–/g)).toHaveLength(2);
    // The team grades are listed.
    expect(screen.getByRole('heading', { name: 'Team Grades' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit the grade of Team 1' })).toBeInTheDocument();
  });

  test('a student the multiplier took below 70 is flagged for the instructor, with a notice above the table', async () => {
    serve({ report: MULTIPLIER_REPORT });
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByText(/^Curved \(mean 85/));
    await user.click(await screen.findByRole('option', { name: 'Contribution Multiplier (proposal)' }));
    // The explanation says there is no floor.
    expect(screen.getByText(/There is no floor/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByText('Report generated successfully');

    expect(screen.getByText(/1 student is flagged for review/)).toBeInTheDocument();
    const di = screen.getByRole('row', { name: /Di Diaz/ });
    expect(di).toHaveTextContent('55%');
    expect(within(di).getByText('Review')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Ben Baker/ })).queryByText('Review')).not.toBeInTheDocument();
  });

  test('no notice and no flag when the multiplier took nobody below 70', async () => {
    const calm = {
      ...MULTIPLIER_REPORT,
      summary: { ...MULTIPLIER_REPORT.summary, flaggedStudents: 0 },
      students: MULTIPLIER_REPORT.students.filter((student) => !student.flagged),
    };
    serve({ report: calm });
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByText(/^Curved \(mean 85/));
    await user.click(await screen.findByRole('option', { name: 'Contribution Multiplier (proposal)' }));
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByText('Report generated successfully');
    expect(screen.queryByText(/flagged for review/)).not.toBeInTheDocument();
    expect(screen.queryByText('Review')).not.toBeInTheDocument();
  });

  // The instructor can set the final score of any student (CICD-81): the Edit button of a row, or the Review mark.
  async function openMultiplierReport(report) {
    serve({ report });
    api.put.mockResolvedValue({ data: {} });
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByText(/^Curved \(mean 85/));
    await user.click(await screen.findByRole('option', { name: 'Contribution Multiplier (proposal)' }));
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByRole('heading', { name: 'Team Grades' });
  }

  test('the Review mark opens the final score of that student; saving sets it and makes the report again', async () => {
    await openMultiplierReport(MULTIPLIER_REPORT);
    await user.click(screen.getByRole('button', { name: 'Review Di Diaz' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Final Score: Di Diaz')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Calculated final score: 55%');
    expect(dialog).toHaveTextContent('0.57');
    expect(within(dialog).queryByRole('button', { name: 'Use calculated grade' })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Final score (0 to 100)'), '62.5');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/courses/c1/students/s4/grade', { final_score: 62.5 }));
    await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/courses/c1/reports?gradingMethod=multiplier').length).toBe(2));
  });

  test('every student has an Edit button, also one nobody rated', async () => {
    await openMultiplierReport(MULTIPLIER_REPORT);
    for (const name of ['Ann Archer', 'Ben Baker', 'Cy Cole', 'Di Diaz']) {
      expect(screen.getByRole('button', { name: `Edit the final score of ${name}` })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'Edit the final score of Cy Cole' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Nobody has rated this student, so there is no calculated grade.');
    await user.type(within(dialog).getByLabelText('Final score (0 to 100)'), '85');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/courses/c1/students/s3/grade', { final_score: 85 }));
  });

  test('a grade the instructor set is marked Adjusted, is not flagged, and can go back to the calculated grade', async () => {
    const adjusted = {
      ...MULTIPLIER_REPORT,
      summary: { ...MULTIPLIER_REPORT.summary, flaggedStudents: 0 },
      students: MULTIPLIER_REPORT.students.map((student) => (student._id === 's4'
        ? { ...student, finalScore: 65, letterGrade: 'D', flagged: false, finalScoreSource: 'instructor', final_grade_override: 65 }
        : student)),
    };
    await openMultiplierReport(adjusted);
    const di = screen.getByRole('row', { name: /Di Diaz/ });
    expect(di).toHaveTextContent('65%');
    expect(within(di).getByText('Adjusted')).toBeInTheDocument();
    expect(within(di).queryByText('Review')).not.toBeInTheDocument();
    expect(screen.queryByText(/flagged for review/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit the final score of Di Diaz' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Final score (0 to 100)')).toHaveValue(65);
    await user.click(within(dialog).getByRole('button', { name: 'Use calculated grade' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/courses/c1/students/s4/grade', { final_score: null }));
  });

  test('the final score must be a number from 0 to 100 before Save works', async () => {
    await openMultiplierReport(MULTIPLIER_REPORT);
    await user.click(screen.getByRole('button', { name: 'Edit the final score of Ben Baker' }));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Final score (0 to 100)'), '101');
    expect(dialog).toHaveTextContent('The grade must be a number from 0 to 100.');
    expect(save).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('Final score (0 to 100)'));
    await user.type(within(dialog).getByLabelText('Final score (0 to 100)'), '100');
    expect(save).toBeEnabled();
  });

  test('a failed save keeps the dialog open and shows the server message', async () => {
    await openMultiplierReport(MULTIPLIER_REPORT);
    api.put.mockRejectedValue(serverError({ error: { message: 'Student not found.' } }));
    await user.click(screen.getByRole('button', { name: 'Edit the final score of Ben Baker' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Final score (0 to 100)'), '80');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Student not found.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('the other methods have no Edit button for the final score', async () => {
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByText('Report generated successfully');
    expect(screen.queryByRole('button', { name: /Edit the final score of/ })).not.toBeInTheDocument();
  });

  test('the other methods do not show the team grades', async () => {
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByText('Report generated successfully');
    expect(screen.queryByRole('heading', { name: 'Team Grades' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Multiplier' })).not.toBeInTheDocument();
  });

  test('saving a team grade asks the server for it and makes the report again', async () => {
    serve({ report: MULTIPLIER_REPORT });
    api.put.mockResolvedValue({ data: {} });
    renderReports('/reports?course=c1');
    await user.click(await screen.findByText(/^Curved \(mean 85/));
    await user.click(await screen.findByRole('option', { name: 'Contribution Multiplier (proposal)' }));
    await user.click(await screen.findByRole('button', { name: /Regenerate Report/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit the grade of Team 1' }));
    await user.type(screen.getByLabelText('Team grade (0 to 100)'), '90');
    const before = api.get.mock.calls.filter(([url]) => url.includes('/reports?')).length;
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/courses/c1/teams/t1/grade', { team_grade: 90 }));
    await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url.includes('/reports?')).length).toBeGreaterThan(before));
  });

  test('a team grade is saved for the course of the report on the screen, not for the course chosen since', async () => {
    const other = { _id: 'c3', course_code: 'CS 2000', course_name: 'Other', course_section: '03', course_status: 'Active' };
    serve({ courses: [...COURSES, other], report: MULTIPLIER_REPORT });
    api.put.mockResolvedValue({ data: {} });
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByText(/^Curved \(mean 85/));
    await user.click(await screen.findByRole('option', { name: 'Contribution Multiplier (proposal)' }));
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByRole('heading', { name: 'Team Grades' });

    // Another course is chosen, but its report has not been made: the one on the screen is still the first course's.
    await chooseCourse(/CS 2000 - Other/);
    await user.click(screen.getByRole('button', { name: 'Edit the grade of Team 1' }));
    await user.type(screen.getByLabelText('Team grade (0 to 100)'), '90');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/courses/c1/teams/t1/grade', { team_grade: 90 }));
    expect(api.put).not.toHaveBeenCalledWith(expect.stringContaining('/courses/c3/'), expect.anything());
    // The report that is made again afterwards is the first course's too.
    await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/courses/c1/reports?gradingMethod=multiplier').length).toBe(2));
  });

  test('saving a team grade shows the multiplier report again, even if another grading method was chosen in the box since', async () => {
    serve({ report: MULTIPLIER_REPORT });
    api.put.mockResolvedValue({ data: {} });
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByText(/^Curved \(mean 85/));
    await user.click(await screen.findByRole('option', { name: 'Contribution Multiplier (proposal)' }));
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByRole('heading', { name: 'Team Grades' });

    // The box is changed to the regular method but the report is not made again: the screen still shows the multiplier report.
    await user.click(screen.getByText(/^Contribution Multiplier \(proposal\)/));
    await user.click(await screen.findByRole('option', { name: 'Regular (mean of the ratings)' }));
    await user.click(screen.getByRole('button', { name: 'Edit the grade of Team 1' }));
    await user.type(screen.getByLabelText('Team grade (0 to 100)'), '90');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/courses/c1/teams/t1/grade', { team_grade: 90 }));
    await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/courses/c1/reports?gradingMethod=multiplier').length).toBe(2));
    expect(api.get.mock.calls.some(([url]) => url === '/courses/c1/reports?gradingMethod=mean')).toBe(false);
    // The dialog hides the page while it closes, so wait for the heading.
    expect(await screen.findByRole('heading', { name: 'Team Grades' })).toBeInTheDocument();
  });

  test('Download CSV is for the report on the screen: its course and its method, not the ones chosen in the boxes since', async () => {
    const other = { _id: 'c3', course_code: 'CS 2000', course_name: 'Other', course_section: '03', course_status: 'Active' };
    serve({ courses: [...COURSES, other], report: MULTIPLIER_REPORT });
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByText(/^Curved \(mean 85/));
    await user.click(await screen.findByRole('option', { name: 'Contribution Multiplier (proposal)' }));
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByRole('heading', { name: 'Team Grades' });

    // Another method and another course are chosen, but no new report is made.
    await user.click(screen.getByText(/^Contribution Multiplier \(proposal\)/));
    await user.click(await screen.findByRole('option', { name: 'Regular (mean of the ratings)' }));
    await chooseCourse(/CS 2000 - Other/);
    window.URL.createObjectURL = vi.fn(() => 'blob:report');
    window.URL.revokeObjectURL = vi.fn();
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(await screen.findByText('Report downloaded successfully')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/courses/c1/reports/download?gradingMethod=multiplier', { responseType: 'blob' });
    expect(api.get.mock.calls.some(([url]) => url.includes('/courses/c3/reports/download'))).toBe(false);
  });

  test('a multiplier report on the screen does not get the curve columns when the box is set back to Curved without generating', async () => {
    serve({ report: MULTIPLIER_REPORT });
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByText(/^Curved \(mean 85/));
    await user.click(await screen.findByRole('option', { name: 'Contribution Multiplier (proposal)' }));
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    await screen.findByRole('heading', { name: 'Team Grades' });

    await user.click(screen.getByText(/^Contribution Multiplier \(proposal\)/));
    await user.click(await screen.findByRole('option', { name: /^Curved \(mean 85/ }));
    expect(screen.getByRole('columnheader', { name: 'Multiplier' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Original Score' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Change' })).not.toBeInTheDocument();
  });

  test('says why a report could not be made: the server\'s message, or a plain one', async () => {
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);

    api.get.mockImplementation(async (url) => {
      if (url.includes('/reports?')) throw serverError({ message: 'This course has no students.' });
      return { data: COURSES };
    });
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    expect(await screen.findByText('This course has no students.')).toBeInTheDocument();

    api.get.mockImplementation(async (url) => {
      if (url.includes('/reports?')) throw new Error('boom');
      return { data: COURSES };
    });
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));
    expect(await screen.findByText('Failed to generate report')).toBeInTheDocument();
  });

  test('says so when the course list cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('down'));
    renderReports();
    expect(await screen.findByText('Failed to load courses')).toBeInTheDocument();
  });

  test('opened from a course, it names the course and makes the report straight away', async () => {
    renderReports('/reports?course=c1');

    expect(await screen.findByText('Capstone 01')).toBeInTheDocument();
    expect(await screen.findByText('Report generated successfully')).toBeInTheDocument();
    expect(reportRequest()).toBe('/courses/c1/reports?gradingMethod=curved');
    expect(screen.getByRole('button', { name: 'Regenerate Report' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /back to courses/i }));
    expect(await screen.findByRole('heading', { name: 'Course list' })).toBeInTheDocument();
  });

  test('a course that is not active is explained, and nothing is generated', async () => {
    serve({ course: COURSES[1] });
    renderReports('/reports?course=c2');

    expect(await screen.findByText('Course "Intro" is inactive. Only active courses can generate reports.')).toBeInTheDocument();
    expect(reportRequest()).toBeUndefined();
  });

  test('a course that does not exist is reported', async () => {
    renderReports('/reports?course=gone');
    expect(await screen.findByText('Course not found. It may have been deleted.')).toBeInTheDocument();
  });

  test('shows an empty-state message when there are no students or no grade distribution', async () => {
    serve({ report: { summary: { totalStudents: 0, studentsWithEvaluations: 0, averageScore: 0 }, students: [] } });
    renderReports();
    await chooseCourse(/CS 4850 - Capstone/);
    await user.click(screen.getByRole('button', { name: 'Generate Report' }));

    expect(await screen.findByText('No student data available')).toBeInTheDocument();
    expect(screen.getByText('No grade distribution available')).toBeInTheDocument();
  });

  describe('Download CSV', () => {
    beforeEach(() => {
      window.URL.createObjectURL = vi.fn(() => 'blob:report');
      window.URL.revokeObjectURL = vi.fn();
    });

    async function generated() {
      renderReports();
      await chooseCourse(/CS 4850 - Capstone/);
      await user.click(screen.getByRole('button', { name: 'Generate Report' }));
      await screen.findByText('Report generated successfully');
    }

    test('asks for the file with the same grading method and says it downloaded', async () => {
      await generated();
      await user.click(screen.getByRole('button', { name: 'Download CSV' }));

      expect(await screen.findByText('Report downloaded successfully')).toBeInTheDocument();
      expect(api.get).toHaveBeenCalledWith(
        '/courses/c1/reports/download?gradingMethod=curved',
        { responseType: 'blob' }
      );
      expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:report');
    });

    test('says so when the download fails', async () => {
      await generated();
      api.get.mockRejectedValue(new Error('down'));
      await user.click(screen.getByRole('button', { name: 'Download CSV' }));
      expect(await screen.findByText('Failed to download report')).toBeInTheDocument();
    });
  });

  describe('peer comments', () => {
    async function generated() {
      renderReports();
      await chooseCourse(/CS 4850 - Capstone/);
      await user.click(screen.getByRole('button', { name: 'Generate Report' }));
      await screen.findByText('Report generated successfully');
    }

    test('shows what peers wrote and the ratings they gave, with the flag reasons', async () => {
      await generated();
      // Only Ann has a flagged evaluation.
      expect(within(screen.getByRole('row', { name: /Ann Archer/ })).getByRole('img', { name: 'flag' })).toBeInTheDocument();
      expect(within(screen.getByRole('row', { name: /Di Diaz/ })).queryByRole('img', { name: 'flag' })).not.toBeInTheDocument();

      await user.click(within(screen.getByRole('row', { name: /Ann Archer/ })).getByRole('button', { name: 'View Comments' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Feedback from Peer #1')).toBeInTheDocument();
      expect(within(dialog).getByText('Carried the project.')).toBeInTheDocument();
      expect(within(dialog).getByText('AI Flagged Evaluation')).toBeInTheDocument();
      expect(within(dialog).getByText('All 5s & Concerning Word')).toBeInTheDocument();
      expect(within(dialog).getByText('Professionalism: 5/5')).toBeInTheDocument();
      expect(within(dialog).getByText('Participation: 4/5')).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    test('says when a student has received no peer evaluations', async () => {
      await generated();
      await user.click(within(screen.getByRole('row', { name: /Di Diaz/ })).getByRole('button', { name: 'View Comments' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('No peer evaluations available')).toBeInTheDocument();
      expect(within(dialog).getByText('Di Diaz has not received any peer evaluations yet.')).toBeInTheDocument();
    });
  });
});
