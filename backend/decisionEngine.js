/**
 * decisionEngine.js
 * ------------------------------------------------------------
  * Core logic for assessing genetic referral cases.
 * - The physician fills free-text fields (and optional structured fields).
 * - The backend auto-detects "suggested red flags" from ALL fields.
 * - The backend computes a score + reasons from detected flags.
 * - The UI can later let the physician confirm/unconfirm flags (keeping control).
 *
 * Educational triage only — NOT medical advice.
 */

// ------------------------------
// Helpers: text + normalization
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
 * This is the key change for "everything can become a reason if relevant".
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

    // Keep any structured inputs too (they can help matching):
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
 * - We accept either structured findings list OR free text.
 * - We add normalized tags if we detect keywords in text.
 * NOTE: We include family history summary too, because prenatal "history" matters.
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
 * - weight: how much it adds to score
 * - patterns: array of strings to search in the combined text
 * - reason: human explanation shown to the user
 *
 * IMPORTANT: This is a simple v1 approach:
 * - Transparent and explainable
 * - Easy to expand gradually
 */
const RULES = {
  oncogenetics: [
    {
      id: "early_onset_cancer",
      weight: 40,
      patterns: [
        "early onset",
        "before 50",
        "diagnosed at 4",
        "diagnosed at 25",
        "diagnosed at 30",
        "diagnosed at 35",
        "diagnosed at 40",
        "diagnosed at 45",
        "young age",
      ],
      reason: "Early-onset cancer mentioned in the history",
    },
    {
      id: "multiple_relatives_cancer",
      weight: 30,
      patterns: ["multiple relatives", "several relatives", "more than one", "two relatives", "three relatives"],
      reason: "Multiple relatives with cancer mentioned",
    },
    {
      id: "breast_and_ovarian_pattern",
      weight: 30,
      patterns: ["breast cancer", "ovarian cancer"],
      reason: "Breast + ovarian cancer pattern mentioned (possible hereditary syndrome)",
    },
    {
      id: "multiple_primaries",
      weight: 25,
      patterns: ["two primary", "multiple primaries", "second primary", "multiple cancers"],
      reason: "Multiple primary cancers mentioned in the same person",
    },
  ],

  prenatal: [
    {
      id: "abnormal_ultrasound",
      weight: 50,
      patterns: ["abnormal ultrasound", "ultrasound anomaly", "malformation", "anomaly scan", "fetal anomaly"],
      reason: "Abnormal ultrasound finding mentioned",
    },
    {
      id: "increased_nt",
      weight: 40,
      patterns: ["nuchal translucency", "increased nt", "nt increased", "thickened nt"],
      reason: "Increased nuchal translucency mentioned",
    },
    {
      id: "previous_aneuploidy",
      weight: 40,
      patterns: ["trisomy 21", "t21", "down syndrome", "aneuploidy"],
      reason: "History suggesting aneuploidy (e.g., trisomy 21) mentioned",
    },
    {
      id: "positive_screening",
      weight: 35,
      patterns: ["positive nipt", "high risk nipt", "screening high risk", "positive screening"],
      reason: "Positive/high-risk prenatal screening mentioned",
    },
    {
      id: "previous_affected_child",
      weight: 40,
      patterns: ["previous affected child", "previous child affected", "affected pregnancy", "recurrent condition"],
      reason: "Previous affected pregnancy/child mentioned",
    },
  ],

  pediatric: [
    {
      id: "developmental_delay",
      weight: 35,
      patterns: ["developmental delay", "global delay", "gdd", "delayed milestones"],
      reason: "Developmental delay mentioned",
    },
    {
      id: "seizures",
      weight: 35,
      patterns: ["seizure", "seizures", "epilepsy"],
      reason: "Seizures mentioned",
    },
    {
      id: "congenital_anomalies",
      weight: 25,
      patterns: ["congenital", "dysmorphic", "malformation", "anomalies"],
      reason: "Congenital anomalies/dysmorphism mentioned",
    },
  ],
};

/**
 * Detect suggested flags and compute score + reasons from auto-detection.
 */
function detectFlagsAndScore(payload) {
  // Pathway rules
  const pathway = payload.pathway;
  const rules = RULES[pathway] || [];

  // Build unified text
  const text = collectText(payload);

  const suggested_flags = [];
  const reasons = [];
  let score = 0;

  for (const r of rules) {
    const hit = r.patterns.some((p) => text.includes(p));
    if (hit) {
      suggested_flags.push(r.id);
      score += r.weight;
      reasons.push(r.reason);
    }
  }

  // This preserves "doctor keeps control".
  const confirmed = Array.isArray(payload.confirmed_flags) ? payload.confirmed_flags : null;
  if (confirmed && confirmed.length > 0) {
    // Recompute score and reasons using only confirmed flags
    let confirmedScore = 0;
    const confirmedReasons = [];

    for (const r of rules) {
      if (confirmed.includes(r.id)) {
        confirmedScore += r.weight;
        confirmedReasons.push(r.reason);
      }
    }

    return {
      suggested_flags,
      used_flags: confirmed,
      reasons: confirmedReasons,
      score: Math.min(confirmedScore, 100),
      used_mode: "confirmed_flags",
    };
  }

  return {
    suggested_flags,
    used_flags: suggested_flags,
    reasons,
    score: Math.min(score, 100),
    used_mode: "suggested_flags",
  };
}

// ------------------------------
// Main function: assess case
// ------------------------------
function assessCase(payload) {
  // Ensure we always have a pathway
  payload.pathway = payload.pathway || "oncogenetics";

  // Normalize prenatal findings (so text-only entries can be detected)
  if (payload.pathway === "prenatal") {
    payload.prenatal_findings = normalizePrenatalFindings(
      payload.prenatal_findings,
      payload.clinical_notes,
      payload.family_history_summary
    );
  }

  // Detect flags + compute score & reasons (Option A)
  const { suggested_flags, used_flags, reasons, score, used_mode } = detectFlagsAndScore(payload);

  // Missing info (basic)
  const missing_info = [];
  const next_steps = [];

  // Age and sex can be required (if you made them mandatory in UI)
  if (payload.patient_age == null || Number.isNaN(Number(payload.patient_age))) {
    missing_info.push("Patient age");
  }
  if (!payload.patient_sex || payload.patient_sex === "unknown") {
    missing_info.push("Patient sex");
  }

  // Chief concern is important everywhere
  if (!safeStr(payload.chief_concern).trim()) {
    missing_info.push("Chief concern");
  }

  // Family history can be important in all pathways (but keep it light for prenatal)
  if (!safeStr(payload.family_history_summary).trim()) {
    missing_info.push("Family history summary");
  }

  // Prenatal-specific missing info
  if (payload.pathway === "prenatal") {
    if (!payload.pregnancy_status || payload.pregnancy_status === "not_applicable") {
      missing_info.push("Pregnancy status (pregnant or preconception)");
    }
    // If pregnant, gestational weeks can help
    if (payload.pregnancy_status === "pregnant" && (payload.gestational_weeks == null || payload.gestational_weeks === "")) {
      missing_info.push("Gestational age (weeks)");
    }
  }

  // Pediatric-specific missing info
  if (payload.pathway === "pediatric") {
    if (!Array.isArray(payload.hpo_terms) || payload.hpo_terms.length === 0) {
      missing_info.push("HPO terms (or a more detailed phenotype description)");
    }
  }

  // Next steps (simple v1)
  if (payload.pathway === "oncogenetics") {
    next_steps.push("Complete a three-generation family history");
    next_steps.push("Collect pathology reports if available");
    next_steps.push("Consider referral to genetic counseling based on confirmed findings");
  } else if (payload.pathway === "prenatal") {
    next_steps.push("Collect ultrasound report and screening results");
    next_steps.push("Discuss referral to prenatal genetic counseling (time-sensitive)");
  } else if (payload.pathway === "pediatric") {
    next_steps.push("Complete phenotype documentation (clinical exam + notes)");
    next_steps.push("Consider referral to pediatric genetic counseling");
  }

  // Decide triage from score
  let triage = "discuss";
  if (score >= 70) triage = "recommended";
  else if (score <= 20) triage = "not_prioritized";

  // If very low risk, do not overwhelm with missing items (but keep prenatal basics)
  if (triage === "not_prioritized") {
    if (payload.pathway !== "prenatal") {
      missing_info.length = 0;
    }
    next_steps.length = 0;
    next_steps.push("No genetic referral needed based on current information");
    next_steps.push("Reassess if new family history or clinical findings appear");
  }

  return {
    case_id: "case_" + Math.random().toString(16).slice(2, 8),
    created_at: new Date().toISOString(),

    pathway: payload.pathway,

    triage,
    priority_score: score,

    // Reasons now come from ALL fields (because detection uses collectText(payload))
    reasons: reasons.length ? reasons : ["Not enough relevant signals identified from the provided data"],

    // Suggested flags are auto-generated; used_flags tells what was scored
    suggested_flags,
    used_flags,
    used_mode, // "suggested_flags" or "confirmed_flags"

    missing_info,
    next_steps,

    disclaimer:
      "This tool is for educational triage purposes only and does not replace medical decision-making.",
  };
}

module.exports = { assessCase };

