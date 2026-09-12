// ============================================================
// DATA AWAL APLIKASI
// File ini hanya berisi data default/demo.
// Jika ingin mengganti data awal, ubah file ini tanpa menyentuh UI.
// ============================================================

export const equipmentOptions = [
  'Excavator PC 300',
  'Excavator PC 500',
  'Excavator PC 400',
  'Support Excavator PC 200',
  'Excavator PC 200',
  'Support Excavator PC 300',
  'Tanpa Support',
];

export const areaPitOptions = [
  'Pit BETA',
  'Pit Rantepao Barat',
  'Rantepao Timur',
  'Rantapao Extend',
  'Pit A1M',
  'Pit A3M',
  'Pit IRG',
  'Pit AKP 6',
  'Pit AKP 1',
  'Alorindah',
];

export const initialLogs = [];

export const initialPending = [
  {
    id: 101,
    title: 'Re-Assay Moisture Loading Dome A & Sample Checking',
    location: 'Dome Stockpile A',
    priority: 'Tinggi',
    assignedStaff: 'Analis QC Lab A',
    targetDate: '2026-09-10',
    status: 'Open',
    description: 'MC >35% akibat hujan. Perlu re-assay moisture dan pengecekan sample sebelum material diproses.',
    notes: 'Foto kondisi cuaca dan sampling area dome A untuk dokumentasi QC.',
  },
  {
    id: 102,
    title: 'Pit Wall Scaling & Slope Stabilization Bench 42',
    location: 'Pit Alpha Block 1',
    priority: 'Sedang',
    assignedStaff: 'Tim Operasional Pit',
    targetDate: '2026-09-11',
    status: 'In Progress',
    description: 'Pekerjaan scaling dan stabilisasi slope pada Bench 42 untuk menjaga keselamatan operasional.',
    notes: 'Perlu pengecekan kondisi batuan dan area akses alat berat.',
  },
];

export const emptyDaily = {
  reporterName: '',
  date: '2026-09-09',
  shift: 'Shift 1 (Siang)',
  pit: areaPitOptions[0],
  equipment: [],
  dumpingArea: 'Stockpile Dome A',
  blockModel: '',
  sampleRef: '',
  drillHole: '',
  elevation: '',
  loadingMethod: 'Direct',
  material: 'Saprolite',
  sublot: '',
  startTime: '07:00',
  stopTime: '17:00',
  ritPrevious: 0,
  ritToday: 0,
  tonnage: 0,
  niGrade: 0,
  feGrade: 0,
  mc: 0,
};

export const emptyPending = {
  title: '',
  location: '',
  priority: 'Sedang',
  assignedStaff: '',
  targetDate: '2026-09-10',
  description: '',
  notes: '',
};

export const attendanceLocations = ['Pit Beta', 'A1M', 'A3M', 'RANTEPAO', 'INFRAS', 'Office'];

export const attendanceNames = [
  'A. GAETZA SAHIRA PASIORI', 'ADAM RAMZIL FAWWAZ', 'ADE REZA FADILLAH', 'ADITYA RAMANDHITO',
  'ADITYA RAMDANI', 'AHLUN', 'AHMAD FAUZI', 'AKBAR. NP', 'ALDIN ALFIANSYA', 'AMELIA SOMBO ARRANG',
  'AMOS RIADI HUTABARAT', 'ANDI RAHMAN', 'ANWAR PRATAMA', 'ARDI RINALDI', 'ARDIANSYAH RAHMAN',
  'ARIS MALUE', 'ARJUN JAYA', 'ARVID RAMADHAN A', 'ASRIN', 'BAYU DWIKA SEPTYAWAN', 'BENYAMIN YOPIANUS',
  'BISMAR', 'FIKRI SALIM', 'GALANG', 'HAIKAL A. ARSAD', 'HAIRAT', 'HALIK MUFANDI', 'HALIM',
  'HARIANTO', 'HARMUL JUFANDI', 'HERMANTO', 'HERY SUPRIYADI', 'IBRAHIN', 'IDRIS DUWILA', 'IKBAL',
  'ILHAM SOBRI', 'INDRA', 'M HADI KURNIAWAN', 'MOCH AGIL RIDHA', 'MOCH FADLY RAMDANI',
  'MUHAMAD ANDIKA CHANDRA', 'MUHAMAD HAIKAL', 'MUHAMMAD IDHAM FARID', 'MUHAMMAD PRIHADI',
  'MUHAMMAD RIFKI SAPUTRA', 'MUHAMMAD RIZAL', 'NUR HADI RUSLI', 'PERDINAND ROLAND LOPANG',
  'RANGGA JUNIANTO T', 'RISKAL WAHYU', 'RISKY GLORIANUS GALUNTU', 'RISMAN RUMBIA', 'ROYAN FIRANSYAH',
  'SABARUDIN', 'SAHRIN YANI', 'SAMSUL SATRIO AFRIANSYAH', 'SILVERIUS YUNRI SEABANI', 'SOFYAN',
  'SULISTIAN', 'SULTAN', 'SURKHAN S. GARUSU', 'WISBAL JAYA KUSUMA', 'YUSWAN SARANANI',
  'ZAHWA AFRIZA GANSI', 'ZULFIKAR USMAN',
];

export const emptyAttendance = {
  reporterName: '',
  date: new Date().toISOString().slice(0, 10),
  shift: 'Shift 1',
  location: attendanceLocations[0],
  name: attendanceNames[0],
};

export const weekly = [];

export const monthly = [];
