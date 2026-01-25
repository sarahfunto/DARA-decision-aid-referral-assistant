/**
 * decisionEngine.js
 * ------------------------------------------------------------
 * Core logic for assessing genetic referral cases (MVP).
 *
 * TWO-STEP WORKFLOW (Physician-in-the-loop):
 * Step 1 (Propose flags):
 *  - Physician fills the form (free text + structured fields).
 *  - Backend auto-detects SUGGESTED red flags from ALL fields.
 *  - Backend returns suggested_flags + reasons + missing_info (NO score / NO triage yet).
 *
 * Step 2 (Confirm + score):
 *  - Physician confirms relevant flags (confirmed_flags[]).
 *  - Backend computes score + triage + used_flags + reasons based on confirmed flags.
 *
 * Educational triage only — NOT medical advice.
 */

// ------------------------------
// Helpers: strings / lists / text
// ------------------------------
function safeStr(x) {
  return (x ?? "").toString();
}

function toLowerTrim(x) {
  return safeStr(x).toLowerCase().trim();
}

function csvToList(value) {
  if (!value) return [];
  return safeStr(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Collects ALL relevant payload fields into one searchable text.
 * This supports: "any relevant info entered can become a reason".
 */
function collectText(payload) {
  const parts = [
    payload.pathway,
    payload.patient_sex,
    payload.patient_age != null ? `age ${payload.patient_age}` : "",
    payload.patient_file_number ? `file ${payload.patient_file_number}` : "",
    payload.chief_concern,
    payload.clinical_notes,
    payload.family_history_summary,

    // Structured fields (optional)
    (payload.family_history_red_flags || []).join(" "),
    payload.pregnancy_status,
    payload.gestational_weeks != null ? `${payload.gestational_weeks} weeks` : "",
    (payload.prenatal_findings || []).join(" "),
    (payload.pediatric_red_flags || []).join(" "),
    (payload.hpo_terms || []).join(" "),
  ];

  return parts
    .map(toLowerTrim)
    .filter(Boolean)
    .join(" ");
}

/**
 * Prenatal finding normalization:
 * Accepts either structured list OR free text.
 * Adds normalized tags if keywords are detected.
 */
function normalizePrenatalFindings(findings = [], clinicalNotes = "", familyHistory = "") {
  const f = Array.isArray(findings) ? findings : csvToList(findings);
  const text = `${f.join(" ")} ${clinicalNotes} ${familyHistory}`.toLowerCase();

  const normalized = new Set(f.map((x) => toLowerTrim(x)).filter(Boolean));

  // Aneuploidy / Down syndrome
  if (text.includes("trisomy 21") || text.includes("t21") || text.includes("down syndrome")) {
    normalized.add("previous_aneuploidy");
  }

  // Increased nuchal translucency (NT)
  if (text.includes("nuchal") || text.includes("nt") || text.includes("translucency")) {
    normalized.add("increased_nt");
  }

  // Ultrasound anomalies
  if (text.includes("ultrasound") || text.includes("anomaly") || text.includes("malformation")) {
    normalized.add("abnormal_ultrasound");
  }

  // Screening / NIPT positive
  if (text.includes("nipt") && (text.includes("positive") || text.includes("high risk"))) {
    normalized.add("positive_screening");
  }

  return Array.from(normalized);
}

// ------------------------------------
// Rules: patterns -> suggested flags
// ------------------------------------
/**
 * Each pathway has rules. A rule:
 * - id: flag name
 * - weight: how much it adds to score (used in Step 2 only)
 * - patterns: strings to search in combined text
 * - reason: explanation shown to the user
 *
 * NOTE: Simple transparent v1 approach (keyword matching).
 */
const RULES = {
  oncogenetics: [
    {
      id: "early_onset_cancer",
      weight: 40,
      patterns: [
        "early onset",
        "before 50",
        "diagnosed at 25",
        "diagnosed at 30",
        "diagnosed at 35",
        "diagnosed at 40",
        "diagnosed at 45",
        "young age",
      ],
      reason: "Early-onset cancer mentioned in the history.",
    },
    {
      id: "multiple_relatives_cancer",
      weight: 30,
      patterns: ["multiple relatives", "several relatives", "more than one", "two relatives", "three relatives"],
      reason: "Multiple relatives with cancer mentioned.",
    },
    {
      id: "breast_and_ovarian_pattern",
      weight: 30,
      patterns: ["breast cancer", "ovarian cancer"],
      reason: "Breast + ovarian cancer pattern mentioned (possible hereditary syndrome).",
    },
    {
      id: "multiple_primaries",
      weight: 25,
      patterns: ["two primary", "multiple primaries", "second primary", "multiple cancers"],
      reason: "Multiple primary cancers mentioned in the same person.",
    },
  ],

  prenatal: [
    {
      id: "abnormal_ultrasound",
      weight: 50,
      patterns: ["abnormal ultrasound", "ultrasound anomaly", "malformation", "anomaly scan", "fetal anomaly"],
      reason: "Abnormal ultrasound finding mentioned.",
    },
    {
      id: "increased_nt",
      weight: 40,
      patterns: ["nuchal translucency", "increased nt", "nt increased", "thickened nt"],
      reason: "Increased nuchal translucency mentioned.",
    },
    {
      id: "previous_aneuploidy",
      weight: 40,
      patterns: ["trisomy 21", "t21", "down syndrome", "aneuploidy"],
      reason: "History suggesting aneuploidy (e.g., trisomy 21) mentioned.",
    },
    {
      id: "positive_screening",
      weight: 35,
      patterns: ["positive nipt", "high risk nipt", "screening high risk", "positive screening"],
      reason: "Positive/high-risk prenatal screening mentioned.",
    },
    {
      id: "previous_affected_child",
      weight: 40,
      patterns: ["previous affected child", "previous child affected", "affected pregnancy", "recurrent condition"],
      reason: "Previous affected pregnancy/child mentioned.",
    },
  ],

  pediatric: [
    {
      id: "developmental_delay",
      weight: 35,
      patterns: ["developmental delay", "global delay", "gdd", "delayed milestones"],
      reason: "Developmental delay mentioned.",
    },
    {
      id: "seizures",
      weight: 35,
      patterns: ["seizure", "seizures", "epilepsy"],
      reason: "Seizures mentioned.",
    },
    {
      id: "congenital_anomalies",
      weight: 25,
      patterns: ["congenital", "dysmorphic", "malformation", "anomalies"],
      reason: "Congenital anomalies/dysmorphism mentioned.",
    },
  ],
};

// ------------------------------------
// Extra flags not defined in RULES
// ------------------------------------
// These are "custom quick rules" that we still want to support in scoring.
const EXTRA_FLAGS = {
  pancreatic_cancer: {
    weight: 45,
    reason: "Pancreatic cancer is a high-risk indication for genetic referral.",
  },
  pancreas_melanoma_pattern: {
    weight: 15,
    reason:
      "Pancreatic cancer with melanoma in the family may suggest a hereditary syndrome (e.g., CDKN2A/FAMMM).",
  },
};

// ------------------------------------
// Step logic: propose flags OR score
// ------------------------------------
/**
 * Step 1:
 * - Detect suggested flags from the combined text.
 * - Return suggested_flags + reasons (NO score yet).
 *
 * Step 2:
 * - If payload.confirmed_flags[] exists, compute score from confirmed flags only.
 */
function detectSuggestedFlagsAndMaybeScore(payload) {
  const pathway = toLowerTrim(payload.pathway);
  const rules = RULES[pathway] || [];

  const text = collectText(payload);

  const suggestedSet = new Set();
  const proposeReasons = [];

  // -------------------------
  // Generic: family history entered -> reason (in step 1)
  // -------------------------
  if (safeStr(payload.family_history_summary).trim()) {
    proposeReasons.push("Family history information was provided and should be considered in the genetic assessment.");
  }

  // -------------------------
  // Oncogenetics custom suggestions (Step 1 only: propose flags)
  // -------------------------
  if (pathway === "oncogenetics") {
    const chief = toLowerTrim(payload.chief_concern);
    const notes = toLowerTrim(payload.clinical_notes);
    const fhx = toLowerTrim(payload.family_history_summary);
    const textAll = `${chief} ${notes} ${fhx}`;

    if (textAll.includes("pancreatic") || textAll.includes("pancreas")) {
      suggestedSet.add("pancreatic_cancer");
      proposeReasons.push(EXTRA_FLAGS.pancreatic_cancer.reason);
    }

    if ((textAll.includes("pancreatic") || textAll.includes("pancreas")) && textAll.includes("melanoma")) {
      suggestedSet.add("pancreas_melanoma_pattern");
      proposeReasons.push(EXTRA_FLAGS.pancreas_melanoma_pattern.reason);
    }
  }

  // -------------------------
  // Apply RULES to suggest flags (Step 1)
  // -------------------------
  for (const r of rules) {
    const hit = r.patterns.some((p) => text.includes(p));
    if (hit) {
      suggestedSet.add(r.id);
      proposeReasons.push(r.reason);
    }
  }

  const suggested_flags = Array.from(suggestedSet);

  // -------------------------
  // Step switch
  // -------------------------
  const confirmed = Array.isArray(payload.confirmed_flags) ? payload.confirmed_flags : null;

  // STEP 1: propose flags only (no score)
  if (!confirmed) {
    return {
      suggested_flags,
      used_flags: [],
      reasons: proposeReasons.length ? proposeReasons : ["Suggested red flags were extracted from the provided context."],
      score: null,
      used_mode: "propose_flags",
    };
  }

  // STEP 2: compute score from confirmed flags (RULES + EXTRA)
  let score = 0;
  const scoreReasons = [];

  // Score RULES
  for (const r of rules) {
    if (confirmed.includes(r.id)) {
      score += r.weight;
      scoreReasons.push(r.reason);
    }
  }

  // Score EXTRA flags
  for (const f of confirmed) {
    if (EXTRA_FLAGS[f]) {
      score += EXTRA_FLAGS[f].weight;
      scoreReasons.push(EXTRA_FLAGS[f].reason);
    }
  }

  return {
    suggested_flags,
    used_flags: confirmed,
    reasons: scoreReasons.length ? scoreReasons : ["No confirmed flags were selected."],
    score: Math.min(score, 100),
    used_mode: "confirmed_flags",
  };
}

// ------------------------------
// Main function: assess case
// ------------------------------
function assessCase(payload) {
  // Ensure default pathway
  payload.pathway = payload.pathway || "oncogenetics";

  // Normalize prenatal findings (so text-only entries can be detected)
  if (toLowerTrim(payload.pathway) === "prenatal") {
    payload.prenatal_findings = normalizePrenatalFindings(
      payload.prenatal_findings,
      payload.clinical_notes,
      payload.family_history_summary
    );
  }

  // Step logic: propose flags OR score
  const { suggested_flags, used_flags, reasons, score, used_mode } =
    detectSuggestedFlagsAndMaybeScore(payload);

  // Missing info (simple v1)
  const missing_info = [];
  const next_steps = [];

  if (payload.patient_age == null || Number.isNaN(Number(payload.patient_age))) {
    missing_info.push("Patient age");
  }
  if (!payload.patient_sex || payload.patient_sex === "unknown") {
    missing_info.push("Patient sex");
  }
  if (!safeStr(payload.chief_concern).trim()) {
    missing_info.push("Chief concern");
  }
  if (!safeStr(payload.family_history_summary).trim()) {
    missing_info.push("Family history summary");
  }

  // Prenatal-specific missing info
  if (toLowerTrim(payload.pathway) === "prenatal") {
    if (!payload.pregnancy_status || payload.pregnancy_status === "not_applicable") {
      missing_info.push("Pregnancy status (pregnant or preconception)");
    }
    if (payload.pregnancy_status === "pregnant" && (payload.gestational_weeks == null || payload.gestational_weeks === "")) {
      missing_info.push("Gestational age (weeks)");
    }
  }

  // Pediatric-specific missing info
  if (toLowerTrim(payload.pathway) === "pediatric") {
    if (!Array.isArray(payload.hpo_terms) || payload.hpo_terms.length === 0) {
      missing_info.push("HPO terms (or a more detailed phenotype description)");
    }
  }

  // Next steps (simple v1)
  const pathway = toLowerTrim(payload.pathway);
  if (pathway === "oncogenetics") {
    next_steps.push("Complete a three-generation family history.");
    next_steps.push("Collect pathology reports if available.");
    next_steps.push("Consider referral to genetic counseling based on confirmed findings.");
  } else if (pathway === "prenatal") {
    next_steps.push("Collect ultrasound report and screening results.");
    next_steps.push("Discuss referral to prenatal genetic counseling (time-sensitive).");
  } else if (pathway === "pediatric") {
    next_steps.push("Complete phenotype documentation (clinical exam + notes).");
    next_steps.push("Consider referral to pediatric genetic counseling.");
  }

  // STEP 1: propose flags only (pending physician confirmation)
  if (score === null) {
    return {
      case_id: "case_" + Math.random().toString(16).slice(2, 8),
      created_at: new Date().toISOString(),

      pathway: payload.pathway,

      triage: "pending_confirmation",
      priority_score: null,

      reasons,
      suggested_flags,
      used_flags,
      used_mode, // "propose_flags"

      missing_info,
      next_steps,

      disclaimer:
        "This tool is for educational triage purposes only and does not replace medical decision-making.",
      message: "Please confirm relevant flags to compute a score and triage.",
    };
  }

  // STEP 2: compute triage from score
  let triage = "discuss";
  if (score >= 70) triage = "recommended";
  else if (score <= 20) triage = "not_prioritized";

  // If very low risk, keep output simple (except prenatal basics)
  if (triage === "not_prioritized") {
    if (pathway !== "prenatal") {
      missing_info.length = 0;
    }
    next_steps.length = 0;
    next_steps.push("No genetic referral needed based on current information.");
    next_steps.push("Reassess if new family history or clinical findings appear.");
  }

  return {
    case_id: "case_" + Math.random().toString(16).slice(2, 8),
    created_at: new Date().toISOString(),

    pathway: payload.pathway,

    triage,
    priority_score: score,

    reasons: reasons.length ? reasons : ["Not enough relevant signals identified from the provided data."],

    suggested_flags,
    used_flags,
    used_mode, // "confirmed_flags"

    missing_info,
    next_steps,

    disclaimer:
      "This tool is for educational triage purposes only and does not replace medical decision-making.",
  };
}

module.exports = { assessCase };
