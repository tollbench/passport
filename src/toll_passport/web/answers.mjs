// Copyright 2026 Steven Ochs and Tollbench.
// SPDX-License-Identifier: Apache-2.0
import { validateDocument } from './vault.mjs';

// Deliberately specific keys. Broad categories are never interchangeable answers.
const aliases = new Map([
  ['founder_bio', 'founder_bio'], ['founder bio', 'founder_bio'],
  ['founder biography', 'founder_bio'],
  ['audience', 'audience'], ['target audience', 'audience'],
  ['pitch_angle', 'pitch_angle'], ['pitch angle', 'pitch_angle'],
  ['contact_preference', 'contact_preference'], ['contact preference', 'contact_preference'],
  ['preferred contact method', 'contact_preference'],
  ['project_details', 'project_details'], ['project details', 'project_details']
]);
export function canonicalAnswerLabel(label) {
  return typeof label === 'string' ? aliases.get(label.trim().toLowerCase()) ?? null : null;
}
const identifier = value => typeof value === 'string' && value.trim().length > 0;
const scopes = new Set(['task', 'reusable']);
export const ANSWER_REVIEW_AGE_DAYS = 180;

/** Local suggestions only. No mutations, persistence, permissions, or release selection.
 * Subject/task identifiers are opaque, case-sensitive strings, never display-name guesses.
 * now is injectable so age checks can be tested without real time or provider calls.
 */
export function findAnswerCandidates(document, context, { now = Date.now() } = {}) {
  validateDocument(document);
  const label = canonicalAnswerLabel(context?.label);
  if (!label || !identifier(context?.subject) || !scopes.has(context?.scope) ||
      (context.scope === 'task' && !identifier(context.taskId)) || !Number.isFinite(now)) return [];
  const candidates = [];
  for (const entry of document.entries) {
    // A superseded version can never become a candidate again.
    const latest = entry.versions.at(-1), fields = latest.fields;
    if (latest.kind !== 'answer' || typeof fields.answer !== 'string' || !fields.answer.trim() ||
        fields.subject !== context.subject || !scopes.has(fields.scope)) continue;
    if (fields.scope === 'task' && (context.scope !== 'task' ||
        !identifier(fields.taskId) || fields.taskId !== context.taskId)) continue;
    // Older records used tags. Only an unambiguous specific tag is a usable fallback.
    const labels = Object.hasOwn(fields, 'label') ? [canonicalAnswerLabel(fields.label)] :
      [...new Set(latest.tags.map(canonicalAnswerLabel).filter(Boolean))];
    if (labels.length !== 1 || labels[0] !== label) continue;
    const age = now - Date.parse(latest.createdAt);
    const reviewReasons = [];
    if (age > ANSWER_REVIEW_AGE_DAYS * 86400000) reviewReasons.push('dated');
    if (age < 0) reviewReasons.push('future-date');
    candidates.push({
      answer: fields.answer,
      provenance: {
        entryId: entry.id, version: latest.version, createdAt: latest.createdAt,
        question: typeof fields.question === 'string' ? fields.question : latest.title,
        label, subject: fields.subject, scope: fields.scope,
        ...(fields.scope === 'task' ? { taskId: fields.taskId } : {})
      },
      reviewReasons
    });
  }
  candidates.sort((a, b) => b.provenance.createdAt.localeCompare(a.provenance.createdAt) ||
    a.provenance.entryId.localeCompare(b.provenance.entryId));
  if (candidates.length > 1) candidates.forEach(candidate => candidate.reviewReasons.push('multiple-candidates'));
  return candidates;
}
