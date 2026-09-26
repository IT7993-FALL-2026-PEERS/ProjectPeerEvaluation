function toCsv(rows) {
  return rows.map(row => row.map(value => {
    if (value === null || value === undefined) return '';
    let field = String(value);
    if (typeof value === 'string' && /^[=+@\-\t\r]/.test(value)) {
      field = "'" + field;
    }
    if (/[,"\r\n]/.test(field)) {
      field = '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
  }).join(',')).join('\n');
}

module.exports = { toCsv };
