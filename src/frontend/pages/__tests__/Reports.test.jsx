import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '../../services/api';
import Reports from '../Reports';

vi.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn() },
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
