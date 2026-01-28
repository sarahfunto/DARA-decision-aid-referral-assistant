// app.js  auto-detect flags + physician confirms via checkboxes
const IS_VERCEL = window.location.hostname.includes("vercel.app");
const API_BASE = IS_VERCEL ? "" : "http://localhost:3001";

// -------------------------
// DEMO helpers (Vercel)
// -------------------------
function demoStep1(pathway) {
  const base = {
    pathway,
    triage: "pending_confirmation",
    priority_score: null,
    disclaimer: "Demo mode (Vercel): backend not deployed. Educational only.",
    llm_explanation:
      "GenAI explanation (demo): This result is generated locally for presentation purposes because the backend is not deployed on Vercel.",
  };

  if (pathway === "prenatal") {
    return {
      ...base,
      suggested_flags: [
        "Increased nuchal translucency (NT)",
        "Previous pregnancy with trisomy 21",
        "Multiple concerning prenatal markers",
      ],
    };
  }

  if (pathway === "pediatric") {
    return {
      ...base,
      suggested_flags: [
        "Global developmental delay / intellectual disability",
        "Seizures or regression",
        "Multiple congenital anomalies / dysmorphic features",
      ],
    };
  }

  // oncogenetics default
  return {
    ...base,
    suggested_flags: [
      "Early-onset cancer (<50 years)",
      "Multiple related cancers in the family",
      "Ovarian cancer in family",
    ],
  };
}

function demoStep2(pathway, confirmedFlags) {
  const base = {
    pathway,
    triage: "refer_high",
    priority_score: Math.min(95, 60 + (confirmedFlags?.length || 0) * 10),
    reasons: (confirmedFlags || []).map((f) => `Confirmed red flag: ${f}`),
    missing_info: ["Demo: add more clinical details if available."],
    next_steps: ["Refer to genetic counseling / genetics clinic."],
    disclaimer: "Demo mode (Vercel). Educational only — not medical advice.",
    llm_explanation:
      "GenAI explanation (demo): Based on the confirmed red flags, DARA recommends referral. This explanation is generated locally for the demo because the backend/LLM is not deployed.",
    suggested_flags: confirmedFlags || [],
    used_flags: confirmedFlags || [],
  };

  if (pathway === "prenatal") {
    return {
      ...base,
      triage: "refer_urgent",
      next_steps: [
        "Urgent genetics referral (time-sensitive prenatal case).",
        "Prepare ultrasound report + screening results (NIPT / serum).",
        "Discuss diagnostic testing options (CVS / amniocentesis) as appropriate.",
      ],
    };
  }

  if (pathway === "pediatric") {
    return {
      ...base,
      next_steps: [
        "Genetics referral (consider CMA / gene panel / exome as appropriate).",
        "Collect growth parameters + detailed physical exam findings.",
        "Review previous workup (EEG/MRI/metabolic) if done.",
      ],
    };
  }

  // oncogenetics
  return {
    ...base,
    next_steps: [
      "Oncogenetics referral.",
      "Collect a 3-generation family history with ages of diagnosis.",
      "Consider guideline-based genetic testing strategy.",
    ],
  };
}
// -------------------------
const pathwayEl = document.getElementById("pathway");
const prenatalSection = document.getElementById("prenatal_section");
const pediatricSection = document.getElementById("pediatric_section");

// these might not exist in your HTML — we use ?. to be safe
const pregnancyStatusEl = document.getElementById("pregnancy_status");
const gestWeeksLabel = document.querySelector('label[for="gestational_weeks"]');
const gestWeeksInput = document.getElementById("gestational_weeks");

let lastPayload = null;
let lastResponse = null;

function show(el) { if (el) el.style.display = ""; }
function hide(el) { if (el) el.style.display = "none"; }

const llmSection = document.getElementById("llmSection");
const llmExplanationEl = document.getElementById("llmExplanation");
const copyLlmBtn = document.getElementById("copyLlmBtn");

if (copyLlmBtn) {
  copyLlmBtn.addEventListener("click", async () => {
    const text = llmExplanationEl?.textContent || "";
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      copyLlmBtn.textContent = "Copied!";
      setTimeout(() => (copyLlmBtn.textContent = "Copy explanation"), 1200);
    } catch {
      alert("Copy failed. Please select and copy manually.");
    }
  });
}

// -------------------------
// UI toggles
// -------------------------
function toggleSections() {
  const p = pathwayEl.value;
  prenatalSection?.classList.toggle("hidden", p !== "prenatal");
  pediatricSection?.classList.toggle("hidden", p !== "pediatric");
}

function toggleGestationalWeeks() {
  const isPrenatal = pathwayEl.value === "prenatal";
  const isPregnant = (pregnancyStatusEl?.value || "") === "pregnant";

  const show = isPrenatal && isPregnant;

  // Show/hide label + input together
  if (gestWeeksLabel) gestWeeksLabel.classList.toggle("hidden", !show);
  if (gestWeeksInput) gestWeeksInput.classList.toggle("hidden", !show);

  // If not shown, clear value to avoid confusion
  if (!show && gestWeeksInput) gestWeeksInput.value = "";
}

pathwayEl?.addEventListener("change", () => {
  toggleSections();
  toggleGestationalWeeks();
});

pregnancyStatusEl?.addEventListener("change", toggleGestationalWeeks);

toggleSections();
toggleGestationalWeeks();

// -------------------------
// Utilities
// -------------------------
function csvToList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeSetValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
}

function showError(msg) {
  const el = document.getElementById("form_error");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}

function hideSummary() {
  document.getElementById("summary_card")?.classList.add("hidden");
  const pre = document.getElementById("summaryText");
  if (pre) pre.textContent = "";
}

function showSummary(text) {
  const card = document.getElementById("summary_card");
  const pre = document.getElementById("summaryText");
  if (pre) pre.textContent = text;
  card?.classList.remove("hidden");
}

// -------------------------
// Payload builders
// -------------------------
function buildPayloadFromForm() {
  const payload = {
    pathway: document.getElementById("pathway")?.value || "",

    patient_file_number: document.getElementById("patient_file_number")?.value.trim() || "",

    patient_age: Number(document.getElementById("patient_age")?.value) || null,
    patient_sex: document.getElementById("patient_sex")?.value || "",

    chief_concern: document.getElementById("chief_concern")?.value.trim() || "",
    clinical_notes: document.getElementById("clinical_notes")?.value.trim() || "",
    family_history_summary: document.getElementById("family_history_summary")?.value.trim() || "",

    pregnancy_status: document.getElementById("pregnancy_status")?.value || "",
    gestational_weeks: Number(document.getElementById("gestational_weeks")?.value) || null,

    // If your input is free text, we still pass it as a list by splitting commas
    prenatal_findings: csvToList(document.getElementById("prenatal_findings")?.value || ""),
    prenatal_findings_free: document.getElementById("prenatal_findings_free")?.value.trim() || "",
    pediatric_red_flags: csvToList(document.getElementById("pediatric_red_flags")?.value || ""),
    hpo_terms: csvToList(document.getElementById("hpo_terms")?.value || ""),
  };

  return payload;
}

function validatePayload(payload) {
  // You requested: age and sex mandatory
  if (!payload.pathway) return "Please choose a pathway.";
  if (!payload.patient_age) return "Please fill in Patient age.";
  if (!payload.patient_sex || payload.patient_sex === "unknown") return "Please choose Patient sex.";
  if (!payload.chief_concern) return "Please fill in Chief concern.";

  // Prenatal pregnant => gestational weeks recommended / can be required
  if (payload.pathway === "prenatal" && payload.pregnancy_status === "pregnant") {
    if (!payload.gestational_weeks) return "Please fill in Gestational age (weeks).";
  }

  return null;
}

// -------------------------
// Rendering
// -------------------------
function renderSuggestedFlags(data) {
  if (!data.suggested_flags || data.suggested_flags.length === 0) {
    return "";
  }

  const flags = (data.suggested_flags || [])
    .map(
      (f) => `
      <label class="flagRow">
        <input type="checkbox" class="flagBox" value="${f}" checked />
        <span class="flagLabel">${f}</span>
      </label>
    `
  )
  .join("");

  return `
    <div class="card">
      <h4>Suggested red flags</h4>
      <p class="muted">
        Please confirm the relevant flags before computing the score and triage.
      </p>
      ${flags}

      <button type="button" id="recalcBtn" class="primary">
        Confirm flags & compute score
      </button>
    </div>
  `;
}

function renderResult(data) {
  const empty = document.getElementById("result_empty");
  const result = document.getElementById("result");
  const isProposeOnly = data.priority_score === null;

  if (!result) return;

  empty?.classList.add("hidden");
  result.classList.remove("hidden");
  // STEP 1 ONLY: pending confirmation UI
  if (data.triage === "pending_confirmation") {
    result.className = "card";
    result.innerHTML = `
      <h3>Step 1 – Confirm detected red flags</h3>
      <p class="muted">
        The assistant detected potential genetic red flags from the provided information.
        Please confirm the relevant flags before a score and referral recommendation can be generated.
      </p>
      ${renderSuggestedFlags(data)}
      <p class="muted"><small>${data.disclaimer || ""}</small></p>
    `;

    document.getElementById("summary_actions")?.classList.add("hidden");

// Attach click handler for the injected button
  const recalcBtn = document.getElementById("recalcBtn");
  recalcBtn?.addEventListener("click", async () => {
    showError("");

    if (!lastPayload) {
      showError("No previous case found. Please submit a case first.");
      return;
    }

    const confirmed = Array.from(document.querySelectorAll(".flagBox:checked")).map(cb => cb.value);
    const payload2 = { ...lastPayload, confirmed_flags: confirmed };

  // ✅ Vercel: demo Step 2 (no backend)
    if (IS_VERCEL) {
      const step2 = demoStep2(payload2.pathway, confirmed);
      lastPayload = payload2;
      lastResponse = step2;
      renderResult(step2);
      if (llmExplanationEl) llmExplanationEl.textContent = step2.llm_explanation || "";
      return;
    }

  // ✅ Local: real backend call
    try {
      const res = await fetch(`${API_BASE}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload2),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "API error");
        return;
      }

      const data2 = await res.json();
      lastPayload = payload2;
      lastResponse = data2;
      renderResult(data2);
    } catch (e) {
      console.error(e);
      showError("Cannot reach the API. Make sure the backend is running on port 3001.");
    }
  });

  return;
}
  // STEP 2: full result UI
  const reasons = (data.reasons || []).map((r) => `<li>${r}</li>`).join("");
  const missing = (data.missing_info || []).map((m) => `<li>${m}</li>`).join("");
  const steps = (data.next_steps || []).map((s) => `<li>${s}</li>`).join("");

  const fileNum = lastPayload?.patient_file_number || "";

  result.className = `card triage-${data.triage}`;
  result.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:8px;">
      ${fileNum ? `<span class="pill"><b>File #:</b> ${fileNum}</span>` : ""}
      <span class="pill"><b>Pathway:</b> ${data.pathway}</span>
      ${!isProposeOnly ? `<span class="pill"><b>Triage:</b> ${data.triage}</span>` : ""}
      ${!isProposeOnly ? `<span class="pill"><b>Score:</b> ${data.priority_score}/100</span>` : ""}
      ${
        data.pathway === "prenatal"
          ? `<span class="pill time-sensitive">⏱️ Time-sensitive</span>`
          : ""
      }
    </div>

    ${
      data.pathway === "prenatal"
        ? `<p class="muted" style="margin-top:6px;">
             <b>Discuss urgently:</b> prenatal cases are time-sensitive and should be reviewed promptly.
           </p>`
        : ""
    }

    <h3>Reasons</h3><ul>${reasons || "<li>None</li>"}</ul>
    <h3>Missing information</h3><ul>${missing || "<li>None</li>"}</ul>
    <h3>Next steps</h3><ul>${steps || "<li>None</li>"}</ul>

    ${
      data.pathway === "prenatal"
        ? `
          <h3>⏱️ Prenatal – Information to prepare before genetic counseling</h3>
          <ul>
            <li>Gestational age at the time of referral</li>
            <li>Detailed ultrasound report (date, findings, severity)</li>
            <li>Results of prenatal screening tests (first trimester screening, NIPT, serum screening)</li>
            <li>Any invasive testing already performed (CVS, amniocentesis)</li>
            <li>Family history of genetic conditions or congenital anomalies</li>
            <li>Previous affected pregnancies or children</li>
            <li>Consanguinity (if applicable)</li>
          </ul>
          <p class="muted">
            Preparing this information early helps avoid delays in time-sensitive prenatal situations.
          </p>
        `
        : ""
    }

    <p class="muted"><small>${data.disclaimer || ""}</small></p>
  `;

  // If you have a "summary_actions" container that you want to show after a result:
  if (!isProposeOnly) {
  document.getElementById("summary_actions")?.classList.remove("hidden");
} else {
  document.getElementById("summary_actions")?.classList.add("hidden");
}

}

// -------------------------
// Referral summary (text)
// -------------------------
function buildReferralSummary(payload, data) {
  const fileNum = payload?.patient_file_number || "";

  const createdAt = data.created_at
    ? new Date(data.created_at).toLocaleString()
    : new Date().toLocaleString();

  const lines = [];
  lines.push("Genetic Referral Summary (Educational)");
  lines.push("=====================================");
  if (fileNum) lines.push(`Patient file number: ${fileNum}`);
  lines.push(`Created at: ${createdAt}`);
  lines.push(`Pathway: ${data.pathway || payload?.pathway || "unknown"}`);
  lines.push(`Triage: ${data.triage || "unknown"} (score: ${data.priority_score ?? "N/A"}/100)`);
  lines.push("");

  lines.push("Clinical context");
  lines.push(`- Chief concern: ${payload?.chief_concern || "N/A"}`);
  if (payload?.patient_age) lines.push(`- Age: ${payload.patient_age}`);
  if (payload?.patient_sex) lines.push(`- Sex: ${payload.patient_sex}`);
  if (payload?.gestational_weeks) lines.push(`- Gestational age: ${payload.gestational_weeks} weeks`);
  if (payload?.family_history_summary) lines.push(`- Family history: ${payload.family_history_summary}`);
  if (payload?.clinical_notes) lines.push(`- Clinical notes: ${payload.clinical_notes}`);
  lines.push("");

  lines.push("Key reasons");
  (data.reasons || []).forEach((r) => lines.push(`- ${r}`));
  if (!data.reasons || data.reasons.length === 0) lines.push("- None");
  lines.push("");

  lines.push("Suggested red flags (auto-detected)");
  (data.suggested_flags || []).forEach((f) => lines.push(`- ${f}`));
  if (!data.suggested_flags || data.suggested_flags.length === 0) lines.push("- None");
  lines.push("");

  lines.push("Flags used for scoring");
  (data.used_flags || []).forEach((f) => lines.push(`- ${f}`));
  if (!data.used_flags || data.used_flags.length === 0) lines.push("- None");
  lines.push("");

  lines.push("Missing information to collect");
  (data.missing_info || []).forEach((m) => lines.push(`- ${m}`));
  if (!data.missing_info || data.missing_info.length === 0) lines.push("- None");
  lines.push("");

  lines.push("Suggested next steps");
  (data.next_steps || []).forEach((s) => lines.push(`- ${s}`));
  if (!data.next_steps || data.next_steps.length === 0) lines.push("- None");
  lines.push("");

  if ((data.pathway || payload?.pathway) === "prenatal") {
    lines.push("Prenatal note (time-sensitive)");
    lines.push("- Please review promptly and prepare ultrasound + screening results before counseling.");
    lines.push("");
  }

  lines.push("Disclaimer");
  lines.push(data.disclaimer || "Educational triage tool only. Not medical advice.");

  return lines.join("\n");
}

// -------------------------
// PDF export (jsPDF)
// -------------------------
function downloadSummaryAsPDF(text) {
  if (!text.trim()) return;

  if (!window.jspdf || !window.jspdf.jsPDF) {
    showError("jsPDF not found. Make sure you added the jsPDF script in index.html.");
    return;
  }

  const { jsPDF } = window.jspdf;

  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const fileNum = lastPayload?.patient_file_number || "";
  const label = fileNum ? `file_${fileNum}` : (lastResponse?.case_id || "unknown_case");

  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;

  doc.setFont("Times", "Normal");
  doc.setFontSize(11);

  const lines = doc.splitTextToSize(text, maxWidth);

  let y = margin;

  // Title once per page
  function drawHeader() {
    doc.setFontSize(14);
    doc.text(`Genetic Referral Summary — ${label}`, margin, 30);
    doc.setFontSize(11);
    y = 55;
  }

  drawHeader();

  const lineHeight = 14;

  lines.forEach((line) => {
    if (y > pageHeight - margin) {
      doc.addPage();
      drawHeader();
    }
    doc.text(line, margin, y);
    y += lineHeight;
  });

  doc.save(`referral_summary_${label}.pdf`);
}

function demoStep1(pathway) {
  const p = String(pathway || "").toLowerCase();

  if (p === "oncogenetics") {
    return {
      pathway: "oncogenetics",
      triage: "pending_confirmation",
      priority_score: null,
      suggested_flags: [
        "Early-onset cancer (<50 years)",
        "Multiple related cancers in the family",
        "Ovarian cancer in family",
      ],
      disclaimer: "Demo: physician confirms detected flags before scoring.",
      llm_explanation:
        "DEMO GenAI: DARA extracted possible hereditary cancer indicators from the provided history. Please confirm the relevant red flags to compute the final score and referral recommendation.",
    };
  }

  if (p === "prenatal") {
    return {
      pathway: "prenatal",
      triage: "pending_confirmation",
      priority_score: null,
      suggested_flags: [
        "Increased nuchal translucency (NT)",
        "Previous pregnancy with trisomy 21",
        "Multiple concerning prenatal markers",
      ],
      disclaimer: "Demo: physician confirms detected flags before scoring.",
      llm_explanation:
        "DEMO GenAI: DARA detected time-sensitive prenatal red flags. Please confirm the relevant flags to compute the final score and next steps.",
    };
  }

  return {
    pathway: "pediatric",
    triage: "pending_confirmation",
    priority_score: null,
    suggested_flags: [
      "Developmental delay",
      "Seizures",
      "Regression or multisystem involvement",
    ],
    disclaimer: "Demo: physician confirms detected flags before scoring.",
    llm_explanation:
      "DEMO GenAI: DARA detected pediatric red flags compatible with a possible genetic condition. Please confirm the relevant flags to compute the final recommendation.",
  };
}

function demoStep2FromConfirmed(pathway, confirmedFlags) {
  const p = String(pathway || "").toLowerCase();

  // simple scoring demo: 20 points per flag (cap at 100)
  const score = Math.min(100, (confirmedFlags?.length || 0) * 20 + 40);

  const commonDisclaimer =
    "Educational demo only. This does not replace clinical judgment.";

  if (p === "oncogenetics") {
    return {
      pathway: "oncogenetics",
      triage: score >= 80 ? "refer_high" : "refer_moderate",
      priority_score: score,
      reasons: [
        "Confirmed hereditary cancer red flags increase suspicion for a genetic syndrome.",
        "Referral supports testing strategy and prevention planning.",
      ],
      missing_info: [
        "Exact cancer types and ages of diagnosis in relatives",
        "Pathology / tumor characteristics (if available)",
      ],
      next_steps: [
        "Refer to oncogenetics / genetic counseling",
        "Collect a 3-generation pedigree",
        "Review pathology reports and consider guideline-based testing",
      ],
      disclaimer: commonDisclaimer,
      llm_explanation:
        "DEMO GenAI: After confirming key red flags, DARA recommends referral to oncogenetics. Genetic counseling can clarify testing eligibility, interpret results, and guide surveillance for the patient and relatives. " +
        commonDisclaimer,
      used_flags: confirmedFlags || [],
    };
  }

  if (p === "prenatal") {
    return {
      pathway: "prenatal",
      triage: "refer_urgent",
      priority_score: Math.max(score, 85),
      reasons: [
        "Confirmed prenatal red flags indicate increased chromosomal/genetic risk.",
        "Prenatal cases are time-sensitive; referral supports prompt testing decisions.",
      ],
      missing_info: [
        "Exact NT measurement and gestational age at scan",
        "Screening results (NIPT / serum screening)",
        "Detailed ultrasound report",
      ],
      next_steps: [
        "Urgent referral to prenatal genetics",
        "Bring ultrasound + screening results",
        "Discuss diagnostic options (CVS/amniocentesis) when appropriate",
      ],
      disclaimer: commonDisclaimer,
      llm_explanation:
        "DEMO GenAI: With confirmed time-sensitive prenatal red flags, DARA recommends urgent referral. A genetics consult supports shared decision-making on NIPT vs invasive testing and explains benefits/limits. " +
        commonDisclaimer,
      used_flags: confirmedFlags || [],
    };
  }

  return {
    pathway: "pediatric",
    triage: score >= 80 ? "refer_moderate_high" : "refer_moderate",
    priority_score: score,
    reasons: [
      "Confirmed pediatric red flags can indicate an underlying genetic condition.",
      "Genetic evaluation may improve diagnosis and management.",
    ],
    missing_info: [
      "Growth parameters (height/weight/HC percentiles)",
      "Key physical exam findings / dysmorphology",
      "Prior tests (EEG/MRI/metabolic) and results",
    ],
    next_steps: [
      "Refer to pediatric genetics",
      "Consider chromosomal microarray / epilepsy panel / exome as appropriate",
      "Coordinate neurology follow-up and review imaging/EEG",
    ],
    disclaimer: commonDisclaimer,
    llm_explanation:
      "DEMO GenAI: After confirming key red flags, DARA recommends referral. Testing can identify an underlying diagnosis and guide care and recurrence-risk counseling. " +
      commonDisclaimer,
    used_flags: confirmedFlags || [],
  };
}


function renderDemoToExistingUI(data) {
  // Use your existing renderResult UI (STEP 2 format)
  lastPayload = lastPayload || buildPayloadFromForm();
  lastResponse = data;

  // Ensure "result" box shows
  document.getElementById("result_empty")?.classList.add("hidden");
  document.getElementById("result")?.classList.remove("hidden");

  // Render with your existing renderer
  renderResult(data);

  // Fill GenAI area
  if (llmExplanationEl) llmExplanationEl.textContent = data.llm_explanation || "";
  if (llmSection) llmSection.classList.remove("hidden");
}


// -------------------------
// Actions
// -------------------------
document.getElementById("submitBtn")?.addEventListener("click", async () => {
  showError("");
  hideSummary();

  const payload = buildPayloadFromForm();
  const err = validatePayload(payload);
  if (err) {
    showError(err);
    return;
  }

// DEMO MODE on Vercel: do not call localhost API
  if (IS_VERCEL) {
    lastPayload = payload;

    const step1 = demoStep1(payload.pathway); // Step 1 = suggested flags
    lastResponse = step1;
    renderResult(step1);

  // Fill GenAI box
    if (llmExplanationEl) llmExplanationEl.textContent = step1.llm_explanation || "";

    return;
  }
  try {
    const res = await fetch(`${API_BASE}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const apiErr = await res.json().catch(() => ({}));
      showError(apiErr.error || "API error");
      return;
    }

    const data = await res.json();
    lastPayload = payload;
    lastResponse = data;

    renderResult(data);

  // -------------------------
  // Display LLM explanation
  // -------------------------
    const llmText = (data && data.llm_explanation)
      ? String(data.llm_explanation).trim()
      : null;

    if (llmText) {
      llmExplanationEl.textContent = llmText;
      show(llmSection);
    } else {
      llmExplanationEl.textContent =
       "GenAI explanation (optional)\n\n" +
       "The decision above was computed using a deterministic, rule-based engine.\n" +
       "An optional GenAI layer can generate educational explanations when enabled.";
      show(llmSection);
   }

  } catch (e) {
    console.error(e);
    showError("Cannot reach the API. Make sure the backend is running on port 3001.");
  }
});

// Demo: Oncogenetics
document.getElementById("demoOnco")?.addEventListener("click", () => {
  document.getElementById("pathway").value = "oncogenetics";
  toggleSections();
  toggleGestationalWeeks();
  hideSummary();

  document.getElementById("patient_file_number")?.value && (document.getElementById("patient_file_number").value = "ONC-001");
  document.getElementById("patient_age").value = 42;
  document.getElementById("patient_sex").value = "female";

  document.getElementById("chief_concern").value = "Family history of cancer";
  document.getElementById("family_history_summary").value =
    "Mother breast cancer at 45, maternal aunt ovarian cancer at 52";
  document.getElementById("clinical_notes").value = "Patient requests risk assessment and referral guidance.";

  safeSetValue("family_history_red_flags", "");

  document.getElementById("pregnancy_status").value = "not_applicable";
  document.getElementById("gestational_weeks").value = "";
  document.getElementById("prenatal_findings").value = "";

  document.getElementById("pediatric_red_flags").value = "";
  document.getElementById("hpo_terms").value = "";

  showError("");
});

// Demo: Prenatal
document.getElementById("demoPrenatal")?.addEventListener("click", () => {
  document.getElementById("pathway").value = "prenatal";
  toggleSections();
  hideSummary();

  document.getElementById("patient_file_number")?.value && (document.getElementById("patient_file_number").value = "PRE-001");
  document.getElementById("patient_age").value = 30;
  document.getElementById("patient_sex").value = "female";

  document.getElementById("chief_concern").value = "Abnormal ultrasound finding";
  document.getElementById("pregnancy_status").value = "pregnant";
  toggleGestationalWeeks();
  document.getElementById("gestational_weeks").value = 22;

  // Free text is OK — backend will normalize
  document.getElementById("prenatal_findings").value = "abnormal ultrasound, increased NT";
  document.getElementById("clinical_notes").value =
    "Ultrasound anomaly reported. Increased nuchal translucency. Previous pregnancy with trisomy 21.";

  document.getElementById("family_history_summary").value = "Previous pregnancy affected by Down syndrome (T21).";
  safeSetValue("family_history_red_flags", "");

  document.getElementById("pediatric_red_flags").value = "";
  document.getElementById("hpo_terms").value = "";

  showError("");
});

// Demo: Pediatric
document.getElementById("demoPediatric")?.addEventListener("click", () => {
  document.getElementById("pathway").value = "pediatric";
  toggleSections();
  toggleGestationalWeeks();
  hideSummary();

  document.getElementById("patient_file_number")?.value && (document.getElementById("patient_file_number").value = "PED-001");
  document.getElementById("patient_age").value = 4;
  document.getElementById("patient_sex").value = "male";

  document.getElementById("chief_concern").value = "Developmental delay and seizures";
  document.getElementById("clinical_notes").value =
    "Global developmental delay with seizures since age 2.";
  document.getElementById("pediatric_red_flags").value = "developmental delay, seizures";
  document.getElementById("hpo_terms").value = "HP:0001263, HP:0001250";

  document.getElementById("family_history_summary").value = "No similar cases reported.";
  safeSetValue("family_history_red_flags", "");
  document.getElementById("prenatal_findings").value = "";
  document.getElementById("pregnancy_status").value = "not_applicable";
  document.getElementById("gestational_weeks").value = "";

  showError("");
});

// Reset
document.getElementById("resetForm")?.addEventListener("click", () => {
  showError("");
  hideSummary();

  // Reset all fields (inputs/textarea/select)
  document.querySelectorAll("input, textarea, select").forEach((el) => {
    if (el.tagName === "SELECT") el.selectedIndex = 0;
    else el.value = "";
  });

  // Force placeholders (because placeholder options are disabled)
  document.getElementById("pathway").value = "";
  document.getElementById("pregnancy_status").value = "";

  // Hide sections + weeks
  toggleSections();
  toggleGestationalWeeks();

  // Clear result UI
  document.getElementById("result")?.classList.add("hidden");
  document.getElementById("result_empty")?.classList.remove("hidden");
  document.getElementById("summary_actions")?.classList.add("hidden");

  lastPayload = null;
  lastResponse = null;
});

// Generate referral summary
document.getElementById("generateSummaryBtn")?.addEventListener("click", () => {
  showError("");

  if (!lastResponse) {
    showError("Please submit a case first to generate a summary.");
    return;
  }

  const summary = buildReferralSummary(lastPayload, lastResponse);
  showSummary(summary);
});

// Copy summary
document.getElementById("copySummary")?.addEventListener("click", async () => {
  const text = document.getElementById("summaryText")?.textContent || "";
  if (!text.trim()) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    showError("Copy failed. Your browser may block clipboard access.");
  }
});

// Download summary as PDF
document.getElementById("downloadSummary")?.addEventListener("click", () => {
  const text = document.getElementById("summaryText")?.textContent || "";
  if (!text.trim()) return;
  downloadSummaryAsPDF(text);
});

/***********************
 * DEMO MODE (Vercel-friendly)
 * - If API is unreachable, show realistic demo results
 * - Works for 3 pathways + GenAI explanation
 ************************/

