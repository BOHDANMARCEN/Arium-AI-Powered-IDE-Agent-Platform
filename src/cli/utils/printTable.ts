/**
 * Arium CLI - Table Printer Utility
 * Pretty prints tabular data to console
 *
 * Author: Bogdan Marcen & ChatGPT 5.1
 */

export function printTable(headers: string[], rows: string[][]): void {
  if (rows.length === 0) {
    console.log("No data to display");
    return;
  }

  // Calculate column widths
  const allRows = [headers, ...rows];
  const colWidths = headers.map((_, colIndex) => {
    return Math.max(...allRows.map(row => stripAnsi(row[colIndex] || "").length));
  });

  // Print header
  const headerLine = headers
    .map((header, i) => header.padEnd(colWidths[i]))
    .join(" │ ");
  console.log(headerLine);

  // Print separator
  const separator = colWidths
    .map(width => "─".repeat(width))
    .join("─┼─");
  console.log(separator);

  // Print rows
  rows.forEach(row => {
    const rowLine = row
      .map((cell, i) => (cell || "").padEnd(colWidths[i]))
      .join(" │ ");
    console.log(rowLine);
  });
}

/**
 * Strip ANSI escape codes from string for length calculation
 */
function stripAnsi(str: string): string {
  // Basic ANSI escape code removal
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}
