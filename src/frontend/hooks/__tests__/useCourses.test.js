import { renderHook, act, waitFor } from '@testing-library/react';
import api, { getCourseById } from '../../services/api';
import useCourses, { DEFAULT_COURSE_FILTERS } from '../useCourses';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  getCourseById: jest.fn(),
}));

// The course list's data: the courses the professor sees, the search filters that narrow them, and
// the column they are sorted by (CICD-57, step 6b). The page shows them and reports what is pressed.
const LISTED = [
  { _id: 'c1', course_name: 'Capstone', student_count: 0 },
  { _id: 'c2', course_name: 'Databases', student_count: 0 },
];
const FRESH = { c1: { _id: 'c1', course_name: 'Capstone', student_count: 4, team_count: 2 }, c2: { _id: 'c2', course_name: 'Databases', student_count: 9 } };

beforeEach(() => {
  api.get.mockReset();
  getCourseById.mockReset();
  api.get.mockResolvedValue({ data: LISTED });
  getCourseById.mockImplementation(async (id) => FRESH[id]);
});

// Renders the hook and waits for its first load to finish.
async function loaded(onError = jest.fn()) {
  const view = renderHook((props) => useCourses(props), { initialProps: { onError } });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

const lastQuery = () => api.get.mock.calls[api.get.mock.calls.length - 1][0];

describe('useCourses: loading', () => {
  test('starts loading, then lists the courses with their latest counts', async () => {
    const view = renderHook(() => useCourses({ onError: jest.fn() }));
    expect(view.result.current.loading).toBe(true);
    expect(view.result.current.courses).toEqual([]);

    await waitFor(() => expect(view.result.current.loading).toBe(false));

    expect(api.get).toHaveBeenCalledWith('/courses?course_status=Active');
    expect(view.result.current.courses).toEqual([FRESH.c1, FRESH.c2]);
    expect(getCourseById).toHaveBeenCalledWith('c1');
    expect(getCourseById).toHaveBeenCalledWith('c2');
  });

  test('is loading from its very first render, so the page never flashes "No courses found"', async () => {
    const seen = [];
    const view = renderHook(() => {
      const courses = useCourses({ onError: jest.fn() });
      seen.push(courses.loading);
      return courses;
    });

    expect(seen[0]).toBe(true);
    await waitFor(() => expect(view.result.current.loading).toBe(false));
  });

  test('asks for a course by its id when it has no _id', async () => {
    api.get.mockResolvedValue({ data: [{ id: 'plain', course_name: 'Legacy' }] });
    getCourseById.mockResolvedValue({ id: 'plain', course_name: 'Legacy', student_count: 3 });

    const view = await loaded();

    expect(getCourseById).toHaveBeenCalledWith('plain');
    expect(view.result.current.courses).toEqual([{ id: 'plain', course_name: 'Legacy', student_count: 3 }]);
  });

  test('keeps the listed course when its latest copy cannot be fetched', async () => {
    getCourseById.mockImplementation(async (id) => {
      if (id === 'c1') throw new Error('gone');
      return FRESH[id];
    });

    const view = await loaded();

    expect(view.result.current.courses).toEqual([LISTED[0], FRESH.c2]);
  });

  test('reports a failed list, shows no courses and stops loading', async () => {
    api.get.mockRejectedValue(new Error('down'));
    const onError = jest.fn();

    const view = await loaded(onError);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to fetch courses' });
    expect(view.result.current.courses).toEqual([]);
  });

  test('keeps the courses it had when a later load fails', async () => {
    const onError = jest.fn();
    const view = await loaded(onError);
    api.get.mockRejectedValue(new Error('down'));

    await act(() => view.result.current.fetchCoursesWithCounts());

    expect(onError).toHaveBeenCalledWith({ severity: 'error', message: 'Failed to fetch courses' });
    expect(view.result.current.courses).toEqual([FRESH.c1, FRESH.c2]);
    expect(view.result.current.loading).toBe(false);
  });

  test('shows the loading state again while it refreshes', async () => {
    const view = await loaded();
    let release;
    api.get.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    let refresh;
    act(() => { refresh = view.result.current.fetchCoursesWithCounts(); });
    expect(view.result.current.loading).toBe(true);

    await act(async () => { release({ data: [] }); await refresh; });
    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.courses).toEqual([]);
  });

  test('does not load again because the page gave it a new error callback', async () => {
    const view = await loaded(jest.fn());
    const calls = api.get.mock.calls.length;

    view.rerender({ onError: jest.fn() });
    view.rerender({ onError: jest.fn() });

    expect(api.get).toHaveBeenCalledTimes(calls);
  });

  test('reports to the newest error callback', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const view = await loaded(first);
    view.rerender({ onError: second });
    api.get.mockRejectedValue(new Error('down'));

    await act(() => view.result.current.fetchCoursesWithCounts());

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

describe('useCourses: search filters', () => {
  test('start as Active courses only, with the filter panel hidden', async () => {
    const view = await loaded();

    expect(view.result.current.searchFilters).toEqual({
      course_name: '', course_number: '', course_section: '', semester: '', course_status: 'Active',
    });
    expect(view.result.current.searchFilters).toEqual(DEFAULT_COURSE_FILTERS);
    expect(view.result.current.showSearchFilters).toBe(false);
  });

  test('changing a filter loads the courses again with it', async () => {
    const view = await loaded();

    act(() => view.result.current.setSearchFilters({ ...DEFAULT_COURSE_FILTERS, course_name: ' Data ' }));

    await waitFor(() => expect(lastQuery()).toBe('/courses?course_name=Data&course_status=Active'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
  });

  test('Search loads the courses with the filters as they stand', async () => {
    const view = await loaded();
    act(() => view.result.current.setSearchFilters({ ...DEFAULT_COURSE_FILTERS, semester: 'Fall 2026', course_status: '' }));
    await waitFor(() => expect(lastQuery()).toBe('/courses?semester=Fall+2026&course_status='));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    const before = api.get.mock.calls.length;

    await act(async () => { view.result.current.handleSearch(); });

    expect(api.get).toHaveBeenCalledTimes(before + 1);
    expect(lastQuery()).toBe('/courses?semester=Fall+2026&course_status=');
  });

  test('Clear puts the default filters back and loads the courses with them', async () => {
    const view = await loaded();
    act(() => view.result.current.setSearchFilters({ course_name: 'x', course_number: 'y', course_section: 'z', semester: 'w', course_status: 'Inactive' }));
    await waitFor(() => expect(view.result.current.loading).toBe(false));

    const before = api.get.mock.calls.length;
    await act(async () => { view.result.current.handleClearSearch(); });

    expect(view.result.current.searchFilters).toEqual(DEFAULT_COURSE_FILTERS);
    // Every request Clear makes is for the default filters, never the ones it is clearing.
    expect(api.get.mock.calls.slice(before).map(([url]) => url)).not.toHaveLength(0);
    api.get.mock.calls.slice(before).forEach(([url]) => expect(url).toBe('/courses?course_status=Active'));
    await waitFor(() => expect(lastQuery()).toBe('/courses?course_status=Active'));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
  });

  test('a refresh given its own filters uses those, not the ones in the form', async () => {
    const view = await loaded();

    await act(() => view.result.current.fetchCoursesWithCounts({ ...DEFAULT_COURSE_FILTERS, course_status: 'Inactive' }));

    expect(lastQuery()).toBe('/courses?course_status=Inactive');
    expect(view.result.current.searchFilters).toEqual(DEFAULT_COURSE_FILTERS);
  });

  test('toggleSearchFilters shows the filter panel and hides it again', async () => {
    const view = await loaded();

    act(() => view.result.current.toggleSearchFilters());
    expect(view.result.current.showSearchFilters).toBe(true);
    act(() => view.result.current.toggleSearchFilters());
    expect(view.result.current.showSearchFilters).toBe(false);
  });
});

describe('useCourses: sorting', () => {
  test('starts sorted by course name, ascending', async () => {
    const view = await loaded();

    expect(view.result.current.sortConfig).toEqual({ key: 'course_name', direction: 'asc' });
  });

  test('sortBy sorts by a new column ascending and flips the same column', async () => {
    const view = await loaded();

    act(() => view.result.current.sortBy('course_name'));
    expect(view.result.current.sortConfig).toEqual({ key: 'course_name', direction: 'desc' });
    act(() => view.result.current.sortBy('semester'));
    expect(view.result.current.sortConfig).toEqual({ key: 'semester', direction: 'asc' });
    act(() => view.result.current.sortBy('semester'));
    expect(view.result.current.sortConfig).toEqual({ key: 'semester', direction: 'desc' });
  });

  test('sorting does not load the courses again', async () => {
    const view = await loaded();
    const calls = api.get.mock.calls.length;

    act(() => view.result.current.sortBy('semester'));

    expect(api.get).toHaveBeenCalledTimes(calls);
  });
});
