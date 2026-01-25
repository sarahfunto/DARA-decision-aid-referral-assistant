<p align="center">
  <img src="assets/logo_DARA_info.png" alt="DARA logo" width="220"/>
</p>

# DARA – Decision Aid & Referral Assistant

DARA (Decision Aid & Referral Assistant) is an educational clinical decision-support tool designed to help physicians determine whether a patient should be referred for genetic counseling.

DARA does NOT replace clinical judgment. It supports structured reasoning, transparency, and physician-in-the-loop decision-making.

---

## Disclaimer

This tool is for educational and triage purposes only.
It does not provide medical advice and must not be used as a standalone clinical decision system.
Final decisions always remain the responsibility of the physician.

---

## Purpose

Genetic referral decisions are complex, time-sensitive, and highly dependent on clinical context.
DARA helps clinicians by:
- Structuring clinical information
- Detecting potential genetic red flags from structured fields and free text
- Explaining why a referral may be relevant
- Keeping the physician fully in control of the final decision

---

## Supported Clinical Pathways

DARA currently supports three genetic referral pathways:
- Oncogenetics
- Prenatal / Preconception genetics (time-sensitive)
- Pediatric genetics

Each pathway has adapted rules, signals, and recommendations.

---

## Core Design Principle: Physician-in-the-loop

DARA follows a strict physician-in-the-loop approach.
The tool never computes a score or recommendation without physician validation.

---

## Two-Step Workflow

### Step 0 – Clinical form

The physician completes a structured clinical form adapted to the selected pathway.
The form includes:
- Patient demographics
- Chief concern
- Free-text clinical notes
- Family history summary
- Pathway-specific fields (prenatal or pediatric)

Screenshots available in `assets/`:
- Empty form : `assets/ui_form.png`
- Filled demo form with Suggested red flags for each pathway
- Filled demo form with Assessment Result for each pathway

---

### Step 1 – Suggested red flags (confirmation required)

After submission:
- DARA analyzes ALL provided fields, including free text
- Potential genetic red flags are detected automatically
- Red flags are displayed for physician confirmation

At this stage:
- No score is computed
- No triage is assigned
- Physician confirmation is mandatory

Screenshots available in `assets/`:
- Suggested red flags 
    - oncogenetics : `assets/ui_onco_suggested_red_flag.png`
    - prenatal : `assets/ui_prenatal_suggested_red_flag.png`
    - pediatric : `assets/ui_pediatric_suggested_red_flag.png`

The physician may confirm or uncheck flags, then click:
“Confirm flags & compute score”

---

### Step 2 – Final assessment result

After confirmation:
- A priority score (0–100) is computed
- A triage recommendation is produced:
  - recommended
  - discuss
  - not_prioritized
- Explicit reasons are listed
- Missing information is highlighted
- Suggested next steps are provided

Suggested flags are no longer displayed at this stage.

Screenshots available in `assets/`:
- Final result view for each pathway :
    - oncogenetics : `assets/ui_onco_result.png`
    - prenatal : `assets/ui_prenatal_result.png`
    - pediatric : `assets/ui_pediatric_result.png`

---

## Prenatal Pathway – Time-Sensitive

Prenatal cases are explicitly marked as time-sensitive.
The UI highlights urgency and recommends early preparation of:
- Gestational age
- Ultrasound reports
- Screening and NIPT results
- Previous affected pregnancies
- Relevant family history

---

## Technical Architecture

### Frontend
- HTML
- CSS
- Vanilla JavaScript

### Backend
- Node.js
- Express.js
- REST API
- Rule-based decision engine (explainable, no black box)

### Design Choice: Rule-Based Logic
The rule-based approach was intentionally chosen to ensure explainability, transparency, and clinical safety.  
In a healthcare context, clinicians must understand why a recommendation is made.  
This design avoids black-box behavior and ensures that every suggested red flag, score, and recommendation can be traced back to explicit clinical rules.


### Key Characteristics
- Free-text analysis
- Explainable logic
- No automatic decision
- Mandatory physician confirmation

---

## Running the Project Locally

### Backend

```bash
cd backend
npm install
node server.js
```

Backend runs on:
http://localhost:3001

---

### Frontend

Open the following file in a browser:
frontend/index.html

The backend must be running for demos and submissions to work.

---

## Project Structure

```
DARA-decision-aid-referral-assistant/
├── backend/
│   ├── server.js
│   ├── decisionEngine.js
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── assets/
│   ├── logo_DARA_info.png
│   ├── ui_form.png
│   ├── ui_onco_suggested_red_flag.png
│   ├── ui_onco_result.png
│   ├── ui_prenatal_suggested_red_flag.png
│   ├── ui_prenatal_result.png
│   ├── ui_pediatric_suggested_red_flag.png
│   └── ui_pediatric_result.png
└── README.md
```

---

## Demo & Screenshots

All demo screenshots illustrating:
- Empty forms
- Suggested red flags (step 1)
- Final assessment results (step 2)

are available in the `assets/` folder for all three pathways.

---

## Key Takeaways

- Physician remains in control at all times
- No automatic referral decisions
- Transparent and explainable logic
- Workflow mirrors real clinical reasoning
- Designed for education and structured triage

---

## Scope and Ethics

- Educational tool only  
- No diagnosis  
- No real patient data  
- No database or data persistence  
- Clear disclaimer included in the interface and outputs  

---

## Possible Future Extensions

- Semantic embeddings for richer text analysis  
- Machine learning models if validated datasets become available  
- Authentication and audit trail  
- Database for case persistence  
- Multi-language user interface  


---

## Legal note

DARA is an educational decision-support tool.  
It does not provide medical advice and must not be used as a standalone clinical decision system.

## Author

Developed as a Final Project for the GenAI & Machine Learning Bootcamp
