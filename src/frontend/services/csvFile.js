// A roster file counts as CSV when its name ends in .csv. File.type can't be trusted:
// the browser takes it from the operating system, and on Windows with Excel installed
// it is application/vnd.ms-excel for every .csv (empty when the OS has no mapping).
// The backend validates the content.
export function isCsvFile(file) {
  return Boolean(file) && /\.csv$/i.test(file.name || '');
}
