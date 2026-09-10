// ============================================================
// HALAMAN JOB PENDING
// Mengelola backlog operasional: selesai, mulai dikerjakan, dan hapus.
// ============================================================

import { Check, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { dateFmt } from '../utils/formatters';

export default function Pending({ jobs, setJobs, onOpenModal, notify }) {
  const updateStatus = (id, status) => {
    setJobs((items) => items.map((item) => (
      item.id === id ? { ...item, status } : item
    )));
    notify(`Status job pending diubah menjadi: ${status}`);
  };

  const removeJob = (id) => {
    setJobs((items) => items.filter((item) => item.id !== id));
    notify('Job pending berhasil dihapus.');
  };

  return (
    <section className="pageStack">
      <div className="panel pendingHead">
        <div>
          <h2>Planning Job Pending & Operational Backlog</h2>
          <p>Manajemen tugas tertunda seperti Re-Assay Lab, Scaling Highwall, Sump Pumping, atau Blending Stockpile</p>
        </div>
        <button className="primary" onClick={onOpenModal}>
          <Plus size={14} /> Tambah Planning Job Pending
        </button>
      </div>

      <div className="jobGrid">
        {jobs.map((job) => (
          <div className={`panel job ${job.priority.toLowerCase()}`} key={job.id}>
            <div>
              <div className="jobTop">
                <span className="pill">Prioritas {job.priority}</span>
                <span className="status">{job.status}</span>
              </div>
              <h3>{job.title}</h3>
              <p>{job.description}</p>
              {job.notes && <p className="jobNote">{job.notes}</p>}
              <small>⌖ Lokasi: <b>{job.location}</b></small>
              <small>♙ PIC: <b>{job.assignedStaff || '-'}</b></small>
              <small>▣ Target: <b>{dateFmt(job.targetDate)}</b></small>
            </div>

            <div className="jobBtns">
              {job.status !== 'Selesai' && (
                <button onClick={() => updateStatus(job.id, 'Selesai')}>
                  <Check size={14} /> Selesai
                </button>
              )}
              {job.status === 'Open' && (
                <button onClick={() => updateStatus(job.id, 'In Progress')}>
                  <LoaderCircle size={14} /> Kerjakan
                </button>
              )}
              <button className="iconBtn danger" onClick={() => removeJob(job.id)} aria-label="Hapus job">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
