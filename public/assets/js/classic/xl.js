// Download a list as an Excel file (SheetJS is loaded only when asked).

export async function exportSheet(fileName, headers, rows, sheetName = 'Sheet1') {
  const mod = await import('/assets/vendor/xlsx.mjs');
  const X = mod.default || mod;
  const ws = X.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map((hd, i) => ({ wch: Math.min(60, Math.max(String(hd).length, ...rows.slice(0, 200).map((r) => String(r[i] ?? '').length)) + 2) }));
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, sheetName);
  X.writeFile(wb, fileName);
}
