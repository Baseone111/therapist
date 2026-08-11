/**
 * Printable guardian summary.
 * Pulls ONLY the summary_for_guardian field from committed notes.
 * Never shows the clinical_note field.
 * Clearly labels sessions where no guardian summary was written.
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  getPatient, getPatientEpisodes, getNotes,
} from '../../api/endpoints';
import { Spinner, ErrorMsg } from '../../components/common/UI';
import { serviceLabel, formatDate } from '../../utils/helpers';

export default function PrintGuardianSummary() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [notesByEpisode, setNotesByEpisode] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [ptRes, epRes] = await Promise.all([
          getPatient(patientId),
          getPatientEpisodes(patientId),
        ]);
        setPatient(ptRes.data);
        setEpisodes(epRes.data);

        const noteMap = {};
        await Promise.all(
          epRes.data.map(async (ep) => {
            const nRes = await getNotes(ep.id);
            // Only committed notes; exclude drafts
            noteMap[ep.id] = nRes.data.filter((n) => !n.is_draft);
          })
        );
        setNotesByEpisode(noteMap);
      } catch {
        setError('Failed to load summary');
      } finally {
        setLoading(false);
      }
    };
    load().then(() => setTimeout(() => window.print(), 600));
  }, [patientId]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMsg message={error} />;

  const allNotes = Object.values(notesByEpisode).flat();
  const hasAnyGuardianSummary = allNotes.some((n) => n.summary_for_guardian);

  return (
    <div style={{ maxWidth: 680, margin: '40px auto', padding: '0 24px', fontFamily: 'Georgia, serif' }}>
      {/* Header */}
      <div style={{ borderBottom: '2px solid #000', paddingBottom: 20, marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Children's Therapy Center</h1>
        <h2 style={{ fontSize: 15, fontWeight: 400, marginTop: 4, color: '#444' }}>
          Progress Summary for Families
        </h2>
        <div style={{ marginTop: 16, fontSize: 13 }}>
          <strong>Child:</strong> {patient?.child_name} &nbsp;·&nbsp;
          <strong>Date of Birth:</strong> {formatDate(patient?.date_of_birth)}<br />
          <strong>Guardian:</strong> {patient?.guardian_name} ({patient?.guardian_relationship})<br />
          <strong>Summary Date:</strong> {formatDate(new Date().toISOString())}
        </div>
      </div>

      {/* Important disclaimer */}
      <div style={{
        padding: '10px 14px',
        background: '#f0f0f0',
        borderLeft: '3px solid #999',
        fontSize: 12,
        marginBottom: 24,
        lineHeight: 1.6,
      }}>
        This document contains plain-language progress notes prepared specifically for families.
        It does not include detailed clinical observations, which are kept in the internal record.
        Contact the clinic if you have questions about your child's treatment.
      </div>

      {!hasAnyGuardianSummary && (
        <p style={{ fontStyle: 'italic', color: '#666', fontSize: 13 }}>
          No guardian summaries have been written for this patient's sessions yet.
          Your therapist will add plain-language notes as treatment progresses.
        </p>
      )}

      {episodes.map((ep) => {
        const epNotes = (notesByEpisode[ep.id] || []);
        const notesWithSummary = epNotes.filter((n) => n.summary_for_guardian);
        const notesWithoutSummary = epNotes.filter((n) => !n.summary_for_guardian);

        if (epNotes.length === 0) return null;

        return (
          <div key={ep.id} style={{ marginBottom: 32 }}>
            <h3 style={{
              fontSize: 15, fontWeight: 700,
              borderBottom: '1px solid #ccc', paddingBottom: 8, marginBottom: 16
            }}>
              {serviceLabel(ep.service_type)}
              {ep.assigned_therapist && (
                <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 12 }}>
                  Therapist: {ep.assigned_therapist?.full_name}
                </span>
              )}
            </h3>

            {notesWithSummary.map((note) => (
              <div key={note.id} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                  Session: {formatDate(note.created_at)} — {note.authored_by?.full_name}
                </div>
                <p style={{ lineHeight: 1.75, fontSize: 13.5 }}>
                  {note.summary_for_guardian}
                </p>
              </div>
            ))}

            {notesWithoutSummary.length > 0 && (
              <p style={{ fontStyle: 'italic', color: '#888', fontSize: 12 }}>
                {notesWithoutSummary.length} session note{notesWithoutSummary.length > 1 ? 's' : ''} for this
                service period did not have a guardian summary written.
              </p>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 40, borderTop: '1px solid #ccc', paddingTop: 16, fontSize: 12, color: '#777' }}>
        Prepared by: Children's Therapy Center staff &nbsp;·&nbsp; Date: {formatDate(new Date().toISOString())}
      </div>
    </div>
  );
}
