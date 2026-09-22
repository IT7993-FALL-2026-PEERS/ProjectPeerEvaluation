// Runs before every frontend test file (react-scripts wires this in
// automatically because it lives at src/setupTests.js, a sibling of the
// real CRA entrypoint src/index.js -- both relative to src/frontend/
// package.json, per CRA convention).
//
// jest-dom adds the toBeInTheDocument()/toHaveTextContent()/etc. matchers
// used throughout src/tests/.
import '@testing-library/jest-dom';

// react-router-dom v7 needs TextEncoder/TextDecoder (used internally by its
// URL handling), but react-scripts' bundled jsdom test environment (Jest 27)
// predates Node exposing those as browser globals, so jsdom doesn't provide
// them. Polyfill from Node's own 'util' before any test imports react-router.
import { TextEncoder, TextDecoder } from 'util';
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}
