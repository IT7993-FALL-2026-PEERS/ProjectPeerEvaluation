import { isCsvFile } from '../csvFile';

// The browser takes File.type from the operating system. On Windows with Excel
// installed, .csv maps to application/vnd.ms-excel, and an unknown mapping gives an
// empty type. The roster dialog used to require exactly text/csv, so it rejected
// every CSV on those machines.
const file = (name, type) => new File(['student_id,name,email\n'], name, { type });

describe('isCsvFile', () => {
  test.each([
    ['text/csv', 'the standard type'],
    ['application/vnd.ms-excel', 'the type Windows reports when Excel is installed'],
    ['application/csv', 'a common alternative'],
    ['', 'an empty type, when the OS has no mapping'],
  ])('accepts roster.csv with type "%s" (%s)', (type) => {
    expect(isCsvFile(file('roster.csv', type))).toBe(true);
  });

  test('is not case sensitive about the extension', () => {
    expect(isCsvFile(file('ROSTER.CSV', 'application/vnd.ms-excel'))).toBe(true);
  });

  test.each([
    ['roster.txt', 'text/plain'],
    ['roster.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['roster.xls', 'application/vnd.ms-excel'],
    ['roster.csv.exe', 'application/x-msdownload'],
    ['csv', 'text/csv'],
  ])('rejects %s (%s)', (name, type) => {
    expect(isCsvFile(file(name, type))).toBe(false);
  });

  test('rejects a missing file', () => {
    expect(isCsvFile(undefined)).toBe(false);
    expect(isCsvFile(null)).toBe(false);
  });
});
