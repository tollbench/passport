// Copyright 2026 Steven Ochs and Tollbench. SPDX-License-Identifier: Apache-2.0
// Fixed entry points; neither parent messages nor URL values become module paths.
const mode = new URL(location.href).searchParams.get('view');
if (mode === 'questions') await import('./questions-only.mjs');
else if (mode === null) await import('./hosted.mjs');
else document.body.textContent = 'Passport view unavailable.';
