# DARA – Decision Aid & Referral Assistant

DARA (Decision Aid & Referral Assistant) is an educational clinical decision-support tool designed to help physicians decide whether a patient should be referred to genetic counseling.

The system is not a diagnostic tool and does not replace medical judgment.  
It supports clinicians by structuring clinical information, highlighting relevant elements, and providing an explainable triage recommendation.

“Dara” also means “pearl of wisdom” in some cultures, reflecting thoughtful and informed decision-making.

---

## Project Goals

- Support genetic referral decisions in a structured and explainable way  
- Reduce cognitive load for clinicians  
- Preserve full clinical responsibility (physician-in-the-loop)  
- Demonstrate an ethical and realistic AI-assisted decision-support system  

---

## Supported Clinical Pathways

DARA supports three genetic referral pathways:

1. Oncogenetics  
   Personal and family history of cancer  

2. Prenatal / Preconception Genetics  
   Pregnancy-related genetic risk and time-sensitive situations  

3. Pediatric Genetics  
   Developmental delay, seizures, congenital anomalies, rare disease suspicion  

---

## Architecture Overview

Frontend  
- HTML and CSS for the clinical form and results UI  
- Vanilla JavaScript (app.js)  
- Runs in the browser (Chrome recommended)  

Main frontend features include clinical data entry, dynamic fields based on the selected pathway, explainable result rendering, physician confirmation of suggested flags, and referral summary generation with PDF export.

Backend  
- Node.js with Express  
- Rule-based decision engine (decisionEngine.js)  
- REST API  
- No database (runtime only, no data persistence)  

---

## Key Design Choice – Physician-in-the-loop (Option A)

DARA follows a physician-in-the-loop approach.

The system automatically detects and suggests potential red flags based on the information entered. These flags are displayed as checkboxes and can be confirmed or unconfirmed by the physician. The final priority score and triage decision are recalculated using only the confirmed flags.

This design ensures that clinical responsibility remains with the physician, while preserving explainability, transparency, and ethical safety.

---

## Decision Output

For each submitted case, DARA returns:

- A triage decision: recommended, discuss, or not_prioritized  
- A priority score (/100)  
- Clear clinical reasons  
- Missing information  
- Suggested next steps  
- Suggested and confirmed red flags  
- Time-sensitive alerts for prenatal cases  

---

## Referral Summary and PDF Export

After assessment, a referral summary can be generated. The summary includes:

- Patient file number (optional)  
- Date and time  
- Clinical pathway  
- Triage decision and score  
- Clinical context  
- Reasons and flags used  
- Missing information  
- Suggested next steps  

The summary can be copied to the clipboard or downloaded as a PDF using jsPDF.

---

## Project Structure

DARA-decision-aid-referral-assistant/
│
├── frontend/
│ ├── index.html
│ ├── app.js
│ └── assets/
│ └── ui_*.png
│
├── backend/
│ ├── server.js
│ ├── decisionEngine.js
│ ├── package.json
│ └── package-lock.json
│
├── docs/
│ ├── api_payload_oncogenetics.json
│ ├── api_payload_prenatal.json
│ ├── api_payload_pediatric.json
│ ├── api_response_example_oncogenetics.json
│ ├── api_response_example_prenatal.json
│ └── api_response_example_pediatric.json
│
├── README.md
└── .gitignore

---

## How to Run the Project

Backend setup:

cd backend  
npm install  
node server.js  

The backend runs on http://localhost:3001

Frontend usage:

Open frontend/index.html in a web browser (Chrome recommended).

---

## Demo Cases

The frontend includes built-in demo buttons for:

- Oncogenetic cases  
- Prenatal cases  
- Pediatric cases  

These demo cases are provided for testing and demonstration purposes.

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

## Disclaimer

DARA is an educational decision-support tool.  
It does not provide medical advice and must not be used as a standalone clinical decision system.
