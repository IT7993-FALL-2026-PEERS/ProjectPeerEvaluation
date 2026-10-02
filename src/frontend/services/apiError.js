// The message to show when an API call fails. The backend answers errors as
// { error: { code, message } }; when that is there it says what went wrong (for example why a
// roster file was rejected). With no response body, such as a network failure or a timeout, the
// generic fallback is shown instead.
export function getErrorMessage(error, fallback) {
  const message = error && error.response && error.response.data && error.response.data.error
    ? error.response.data.error.message
    : undefined;
  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
}
