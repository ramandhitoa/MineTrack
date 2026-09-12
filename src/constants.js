// ============================================================
// KONFIGURASI NAVIGASI & JUDUL HALAMAN
// Jika ingin menambah menu, ubah file ini terlebih dahulu.
// ============================================================

import {
  CalendarDays,
  Clock3,
  LayoutDashboard,
  ListChecks,
  Table2,
  UserCheck,
} from 'lucide-react';

export const tabs = [
  ['dashboard', 'Dashboard Hasil Kerja', LayoutDashboard],
  ['harian', 'Progres Kerja Harian', ListChecks],
  ['mingguan', 'Progres Mingguan', CalendarDays],
  ['bulanan', 'Progres Bulanan', CalendarDays],
  ['absensi', 'Daily Absensi', UserCheck],
  ['pending', 'Planning Job Pending', Clock3],
  ['excel', 'Google Sheets & Excel', Table2],
];

export const pageTitles = {
  dashboard: 'Dashboard Hasil Kerja & QC Tambang Nikel',
  harian: 'Progres Pekerjaan Harian (22 Kolom Excel Ready)',
  mingguan: 'Progres & Agregasi Pekerjaan Mingguan',
  bulanan: 'Rekapitulasi Kinerja Bulanan Smelter Spec',
  absensi: 'Dashboard Daily Absensi',
  pending: 'Planning Job Pending & Operational Backlog',
  excel: 'Integrasi Google Spreadsheets & Microsoft Excel',
};

export const STORAGE_KEYS = {
  logs: 'minetrack_nickel_v3_logs',
  pending: 'minetrack_nickel_v3_pending',
  attendance: 'minetrack_nickel_v3_attendance',
  googleSheetsUrl: 'minetrack_gsheets_url',
};
