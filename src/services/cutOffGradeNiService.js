import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

export const CUT_OFF_GRADE_NI_PATH = Object.freeze({
  collection: 'appSettings',
  document: 'cutOffGradeNi',
});

export const DEFAULT_CUT_OFF_GRADE_NI = Object.freeze({
  saprolitHGMin: 1.60,
  saprolitLGMin: 1.30,
  saprolitLGMax: 1.59,
  limonitOreMin: 1.00,
  limonitOreMax: 1.29,
  wasteOBMax: 1.00,
});

const cutoffFields = Object.keys(DEFAULT_CUT_OFF_GRADE_NI);

export function canEditCutOffGradeNi(role) {
  return role === 'OWNER' || role === 'APP_ADMIN';
}

export function normalizeCutOffGradeNi(values) {
  const normalized = {};

  for (const field of cutoffFields) {
    const value = values?.[field];
    if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) {
      throw new Error('Semua nilai Cut-Off Grade Ni wajib diisi dengan angka.');
    }

    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new Error('Nilai Cut-Off Grade Ni harus berupa angka nol atau lebih.');
    }

    normalized[field] = number;
  }

  if (
    normalized.limonitOreMin > normalized.limonitOreMax
    || normalized.saprolitLGMin > normalized.saprolitLGMax
    || normalized.saprolitLGMax >= normalized.saprolitHGMin
  ) {
    throw new Error('Batas Cut-Off Grade Ni tidak konsisten.');
  }

  return normalized;
}

export function createCutOffGradeNiState() {
  const defaults = { ...DEFAULT_CUT_OFF_GRADE_NI };
  return {
    saved: defaults,
    draft: { ...defaults },
    editing: false,
    saving: false,
    error: '',
    notice: '',
  };
}

export function cutOffGradeNiReducer(state, action) {
  switch (action.type) {
    case 'loaded': {
      const saved = normalizeCutOffGradeNi(action.value);
      return { ...state, saved, draft: { ...saved }, error: '', notice: '' };
    }
    case 'edit':
      return { ...state, draft: { ...state.saved }, editing: true, error: '', notice: '' };
    case 'change':
      if (!state.editing || state.saving) return state;
      return {
        ...state,
        draft: { ...state.draft, [action.field]: action.value },
        error: '',
        notice: '',
      };
    case 'cancel':
      return { ...state, draft: { ...state.saved }, editing: false, saving: false, error: '', notice: '' };
    case 'save-start':
      return { ...state, saving: true, error: '', notice: '' };
    case 'save-success': {
      const saved = normalizeCutOffGradeNi(action.value);
      return {
        ...state,
        saved,
        draft: { ...saved },
        editing: false,
        saving: false,
        error: '',
        notice: 'Cut-Off Grade Ni berhasil disimpan.',
      };
    }
    case 'save-error':
      return { ...state, editing: true, saving: false, error: action.message, notice: '' };
    default:
      return state;
  }
}

export function createCutOffGradeNiStore({
  createDocumentRef = doc,
  readDocument = getDoc,
  writeDocument = setDoc,
  makeServerTimestamp = serverTimestamp,
} = {}) {
  const reference = (database) => createDocumentRef(
    database,
    CUT_OFF_GRADE_NI_PATH.collection,
    CUT_OFF_GRADE_NI_PATH.document
  );

  return {
    async load(database) {
      const snapshot = await readDocument(reference(database));
      if (!snapshot.exists()) return { ...DEFAULT_CUT_OFF_GRADE_NI };
      return normalizeCutOffGradeNi(snapshot.data());
    },

    async save(database, values, uid) {
      if (typeof uid !== 'string' || !uid.trim()) {
        throw new Error('Sesi pengguna tidak tersedia.');
      }

      const normalized = normalizeCutOffGradeNi(values);
      await writeDocument(reference(database), {
        ...normalized,
        updatedAt: makeServerTimestamp(),
        updatedBy: uid,
      });
      return normalized;
    },
  };
}

export const cutOffGradeNiStore = createCutOffGradeNiStore();