import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './frontend/App';
import { AuthProvider } from './frontend/contexts/AuthContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
	<React.StrictMode>
		<AuthProvider>
			<App />
		</AuthProvider>
	</React.StrictMode>
);

