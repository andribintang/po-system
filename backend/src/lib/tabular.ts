import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { addSheet, sendWorkbook } from './excel';

export type Cell = string | number | Date | null;
export interface Table {
  title: string;
  filename: string; // tanpa ekstensi
  headers: string[];
  rows: Cell[][];
}

function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(t: Pick<Table, 'headers' | 'rows'>): string {
  // BOM agar Excel membaca UTF-8 dengan benar
  return '﻿' + [t.headers, ...t.rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Kirim tabel sebagai CSV atau XLSX sesuai `format`. */
export async function sendTable(res: Response, t: Table, format: 'csv' | 'xlsx') {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${t.filename}.csv"`);
    res.send(toCsv(t));
    return;
  }
  const wb = new ExcelJS.Workbook();
  addSheet(wb, t.title.slice(0, 31), t.headers, t.rows);
  await sendWorkbook(res, wb, `${t.filename}.xlsx`);
}
