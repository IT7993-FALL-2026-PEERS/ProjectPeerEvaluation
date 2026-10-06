import { useState, useEffect, useCallback, useRef } from 'react';
import api, { getCourseById } from '../services/api';
import { nextSortConfig } from '../services/courseSort';
import { buildCourseQuery } from '../services/courseQuery';

export const DEFAULT_COURSE_FILTERS = {
  course_name: '',
  course_number: '',
  course_section: '',
  semester: '',
  course_status: 'Active',
};

// The course list's data, moved out of CourseManagement.js (CICD-57, step 6b): the courses, the
// search filters that narrow them, and the column they are sorted by. `onError` gets
// { severity, message } when the list cannot be loaded.
//
// As on the page before, any change to the filters loads the list again.
export default function useCourses({ onError }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchFilters, setSearchFilters] = useState({ ...DEFAULT_COURSE_FILTERS });
  const [showSearchFilters, setShowSearchFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'course_name', direction: 'asc' });

  // The newest callback, read when an error happens, so a new one each render does not reload the list.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Fetch all courses, then update each with the latest student_count
  const fetchCoursesWithCounts = useCallback(async (filters = null) => {
    setLoading(true);
    try {
      // Use provided filters or current search filters
      const activeFilters = filters || searchFilters;

      const response = await api.get(`/courses?${buildCourseQuery(activeFilters)}`);
      let coursesList = response.data;

      // Fetch the latest course object for each course in parallel
      const updatedCourses = await Promise.all(
        coursesList.map(async (course) => {
          try {
            const fresh = await getCourseById(course._id || course.id);
            // Use all fields from the fresh course object
            return { ...fresh };
          } catch (e) {
            // fallback to original if error
            return course;
          }
        })
      );

      setCourses(updatedCourses);
    } catch (error) {
      onErrorRef.current({ severity: 'error', message: 'Failed to fetch courses' });
    } finally {
      setLoading(false);
    }
  }, [searchFilters]);

  useEffect(() => {
    fetchCoursesWithCounts();
  }, [fetchCoursesWithCounts]); // Re-fetch when fetchCoursesWithCounts changes

  // Search handlers
  const handleSearch = () => {
    fetchCoursesWithCounts(searchFilters);
  };

  const handleClearSearch = () => {
    const clearedFilters = { ...DEFAULT_COURSE_FILTERS };
    setSearchFilters(clearedFilters);
    fetchCoursesWithCounts(clearedFilters);
  };

  const toggleSearchFilters = () => setShowSearchFilters((show) => !show);

  const sortBy = (key) => setSortConfig((prev) => nextSortConfig(prev, key));

  return {
    courses, loading, searchFilters, setSearchFilters, showSearchFilters, toggleSearchFilters,
    sortConfig, sortBy, fetchCoursesWithCounts, handleSearch, handleClearSearch,
  };
}
