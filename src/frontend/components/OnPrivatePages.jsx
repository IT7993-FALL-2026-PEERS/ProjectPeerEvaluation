import { useLocation } from 'react-router-dom';

// Pages a visitor can open without a login. The login page is "/"; the others are opened from an email link.
const PUBLIC_PREFIXES = ['/reset-password/', '/verify-email/', '/evaluate/'];

const isPublicPath = (pathname) => pathname === '/' || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

// Shows its children only on the pages a professor reaches after logging in. The 'session timed out' banner is
// wrapped in it (CICD-76): on a page with no login there is no work to keep, so a banner or a 'Log in again' dialog
// there is wrong, and it covers the form the visitor came to use.
function OnPrivatePages({ children }) {
  const { pathname } = useLocation();
  return isPublicPath(pathname) ? null : children;
}

export default OnPrivatePages;
