import type { Request, Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { HttpError } from './errors';

export async function sendWorkbook(res: Response, wb: ExcelJS.Workbook, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

/** Tambah sheet dengan header tebal, lebar kolom otomatis, dan baris data. */
export function addSheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: (string | number | Date | null)[][]) {
  const ws = wb.addWorksheet(name);
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((col, i) => {
    const max = Math.max(headers[i].length, ...rows.map((r) => String(r[i] ?? '').length));
    col.width = Math.min(Math.max(max + 2, 10), 50);
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

export interface SheetRow {
  rowNumber: number;
  values: Record<string, string>;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    return '';
  }
  return String(v).trim();
}

/** Baca sheet pertama: baris 1 = header (dibuat huruf besar), baris kosong dilewati. */
export async function readRows(buffer: Buffer): Promise<SheetRow[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(400, 'File bukan Excel (.xlsx) yang valid');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new HttpError(400, 'File Excel kosong');
  const headers: string[] = [];
  ws.getRow(1).eachCell((c, col) => (headers[col] = cellText(c.value).toUpperCase().replace(/\s+/g, '_')));
  const out: SheetRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    let any = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const t = cellText(row.getCell(col).value);
      values[h] = t;
      if (t) any = true;
    });
    if (any) out.push({ rowNumber, values });
  });
  if (out.length > 5000) throw new HttpError(400, 'Maksimal 5000 baris per impor');
  return out;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

/** Middleware menerima satu file Excel pada field "file". */
export function excelUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(400, 'Ukuran file maksimal 5 MB'));
    if (err) return next(err);
    if (!req.file) return next(new HttpError(400, 'File Excel wajib diunggah (field "file")'));
    next();
  });
}

/** Kesalahan impor per baris, dikirim balik ke pengguna sekaligus. */
export class ImportError extends HttpError {
  constructor(errors: { row: number; message: string }[]) {
    super(400, `Impor dibatalkan: ${errors.length} baris bermasalah. Tidak ada data yang disimpan.`, { rows: errors.slice(0, 200) });
  }
}
