import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import CourseManagement from './pages/CourseManagement';
import LoginPage from './pages/LoginPage';
import StudentEvaluation from './pages/StudentEvaluation';
import Reports from './pages/Reports';
import ResetPassword from './pages/ResetPassword';
import Settings from './pages/Settings';

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<LoginPage />} />
                <Route path="/course-management" element={<CourseManagement />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/evaluate/:token" element={<StudentEvaluation />} />
                <Route path="/reset-password/:token" element={<ResetPassword />} />
                <Route path="/settings" element={<Settings />} />
                {/* Catch-all route for debugging */}
                <Route path="*" element={
                    <div style={{padding: '20px'}}>
                        <h1>Route Debug Info</h1>
                        <p>Current URL: {window.location.href}</p>
                        <p>Pathname: {window.location.pathname}</p>
                        <p>Available routes:</p>
                        <ul>
                            <li>/</li>
                            <li>/course-management</li>
                            <li>/reports</li>
                            <li>/evaluate/:token</li>
                            <li>/reset-password/:token</li>
                        <li>/settings</li>
                        </ul>
                    </div>
                } />
            </Routes>
        </Router>
    );
}

export default App;