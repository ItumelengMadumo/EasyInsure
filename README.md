# EasyInsure — LLM-Powered Insurance Claims & Underwriting Platform

An AI-assisted insurance platform that processes claims, detects fraud, calculates premiums, determines payouts using depreciation logic, and generates decision support — all with a **human-in-the-loop** approval workflow.

> **Core Principle:** LLMs assist decisions — they do NOT make final financial decisions. All premiums and payouts require human approval.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [System Philosophy](#system-philosophy)
- [Project Structure](#project-structure)
- [Backend](#backend)
  - [Database Models](#database-models)
  - [Risk Engine](#risk-engine)
  - [Depreciation Engine](#depreciation-engine)
  - [Fraud Detection](#fraud-detection)
  - [Decision Pipeline](#decision-pipeline)
  - [LLM Tier Architecture](#llm-tier-architecture)
  - [API Endpoints](#api-endpoints)
  - [Authentication & Roles](#authentication--roles)
- [Frontend](#frontend)
- [Setup & Running](#setup--running)
- [Environment Variables](#environment-variables)
- [Development Phases](#development-phases)

---

## Architecture Overview

```
User / Browser UI
       ↓
FastAPI Backend (Python)
       ↓
┌──────────────────────────┐
│   Processing Pipeline    │
│                          │
│  1. LLM Data Extraction  │
│  2. Tier Assignment       │
│  3. Risk Engine           │
│  4. Depreciation Engine   │
│  5. Fraud Detection       │
│  6. Decision Support      │
│  7. Human Approval Gate   │
└──────────────────────────┘
       ↓
PostgreSQL Database
       ↓
OpenAI API (LLM)
```

---

## System Philosophy

| Component               | Responsibility                                |
| ----------------------- | --------------------------------------------- |
| **LLM**                 | Extraction, summarization, anomaly hints      |
| **Risk Engine**         | Premium calculation (deterministic logic)     |
| **Depreciation Engine** | Asset valuation (current value at claim time) |
| **Fraud Detection**     | Rule-based anomaly flagging                   |
| **Backend**             | Orchestration & control                       |
| **Database**            | Source of truth                               |
| **Human (Officer)**     | Final premium & payout approval               |

### Key Design Principles

1. **LLM ≠ decision maker** — AI supports, humans decide
2. **Pricing is deterministic** — actuarial logic, no randomness
3. **Everything is explainable** — every risk factor has a reason
4. **Full audit trail** — who approved what, when, and any adjustments
5. **Data sanitization** — no PII sent to LLMs
6. **Human-in-the-loop** — no financial transaction without human confirmation

---

## Project Structure

```
EasyInsure/
├── llm_insurance_backend/
│   ├── main.py                          # FastAPI app entry point
│   ├── requirements.txt
│   └── app/
│       ├── schemas.py                   # Pydantic request/response models
│       ├── core/
│       │   └── config.py                # Settings & environment config
│       ├── database/
│       │   ├── session.py               # SQLAlchemy engine & session
│       │   └── __init__.py
│       ├── models/
│       │   ├── models.py                # All SQLAlchemy models
│       │   └── __init__.py
│       ├── services/
│       │   ├── risk_engine.py           # Premium calculation engine
│       │   ├── depreciation_engine.py   # Asset valuation engine
│       │   ├── fraud_detection.py       # Fraud signal detection
│       │   ├── decision_pipeline.py     # Full claim processing pipeline
│       │   ├── auth_service.py          # JWT & password utilities
│       │   ├── security.py              # Auth dependencies
│       │   ├── llm_service.py           # LLM tier router
│       │   ├── tier1_llm.py             # Tier 1 LLM (GPT-3.5)
│       │   ├── tier2_llm.py             # Tier 2 LLM (GPT-4 Turbo)
│       │   └── tier3_llm.py             # Tier 3 LLM (GPT-4)
│       └── api/v1/
│           ├── auth.py                  # Login, register, user management
│           ├── claims.py                # Full claim CRUD + pipeline
│           ├── policies.py              # Policy & asset management
│           ├── tools.py                 # Risk & depreciation calculators
│           ├── tier1.py                 # Tier 1 claim listing
│           ├── tier2.py                 # Tier 2 claim listing
│           └── tier3.py                 # Tier 3 claim listing
├── frontend/
│   ├── index.html                       # Single-page app shell
│   ├── css/styles.css                   # Full UI styling
│   └── js/
│       ├── api.js                       # API client (fetch wrapper)
│       └── app.js                       # UI logic & rendering
└── Docs/
    ├── System Overview Doc.txt
    ├── Database Schema Document.txt
    └── Boilerplate Documentation.txt
```

---

## Backend

### Database Models

All models are defined in `app/models/models.py` using SQLAlchemy:

| Table                | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `users`              | All system users with role-based access      |
| `policies`           | Insurance policies (ACV or Agreed Value)     |
| `insured_assets`     | Assets covered by policies                   |
| `claims`             | Claims with full lifecycle tracking          |
| `depreciation_rates` | Configurable rates by asset type             |
| `reports`            | System-generated analysis reports            |
| `audit_trail`        | Every decision: who, what, when, adjustments |

#### Human-in-the-Loop Fields

Claims have both **suggested** and **approved** values:

```
suggested_payout  → system calculates
approved_payout   → human decides
approved_by       → who approved
approval_timestamp → when
```

Policies similarly track `suggested_premium` vs `approved_premium`.

---

### Risk Engine

**File:** `app/services/risk_engine.py`

Deterministic actuarial logic for premium calculation.

**Formula:**

```
premium = base_rate × (1 + total_risk_score)
```

**Risk Factors (configurable):**

| Factor          | Condition             | Weight |
| --------------- | --------------------- | ------ |
| Young Driver    | Age < 25              | +40%   |
| High-Risk Area  | Location in risk list | +30%   |
| Expensive Asset | Value > R200,000      | +50%   |
| Poor History    | 3+ previous claims    | +35%   |
| Good History    | 0 previous claims     | −20%   |
| New Driver      | < 2 years experience  | +25%   |

**Base Rates:** Vehicle R500, Property R800, Electronics R200, Life R1000.

**Risk Levels:** low (< 0.2), medium (< 0.6), high (< 1.0), critical (≥ 1.0).

---

### Depreciation Engine

**File:** `app/services/depreciation_engine.py`

Calculates current asset value at claim time.

**Depreciation Formula:**

```
value = purchase_price × (1 − rate)^years
```

**Market Value Adjustment:**

```
final_value = min(depreciated_value, market_value)
```

**Condition Adjustments:**

| Condition | Adjustment |
| --------- | ---------- |
| Excellent | +10%       |
| Average   | 0%         |
| Poor      | −20%       |

**Payout Formula:**

```
payout = adjusted_value − excess
```

**Policy Types:**

- **ACV (Actual Cash Value):** Depreciated value payout
- **Agreed Value:** Fixed payout regardless of depreciation

---

### Fraud Detection

**File:** `app/services/fraud_detection.py`

Rule-based anomaly detection signals:

| Signal           | Trigger                               | Severity |
| ---------------- | ------------------------------------- | -------- |
| Repeated Claims  | 3+ claims in 12 months                | High     |
| High-Value Spike | Claim > 80% of asset value            | High     |
| Early Claim      | Incident < 30 days after policy start | Medium   |
| Excessive Amount | Claim > R500,000                      | High     |

**Overall Risk:** Based on count and severity of triggered signals.

---

### Decision Pipeline

**File:** `app/services/decision_pipeline.py`

End-to-end orchestration:

1. **Assign tier** — based on claim amount (< R50K → T1, < R200K → T2, else T3)
2. **Run depreciation** — calculate current asset value
3. **Run risk engine** — evaluate risk score
4. **Run fraud detection** — flag anomalies
5. **Generate report** — store analysis results
6. **Return decision support** — suggested payout, risk breakdown, recommendation
7. **Human reviews** → approves/rejects with optional adjustment
8. **Audit trail stored** — full record of decision

**Decision Flow:**

```
System generates:
  → Suggested payout
  → Risk score & breakdown
  → Fraud assessment
  → Recommendation

Officer reviews:
  → Adjusts payout if needed
  → Approves or rejects

Final decision stored as authoritative outcome
```

---

### LLM Tier Architecture

| Tier | Use Case          | Model         | Routing Condition |
| ---- | ----------------- | ------------- | ----------------- |
| 1    | Simple claims     | GPT-3.5 Turbo | Amount < R50,000  |
| 2    | Moderate claims   | GPT-4 Turbo   | Amount < R200,000 |
| 3    | Complex/high-risk | GPT-4         | Amount ≥ R200,000 |

LLM responsibilities:

- **Data extraction** — unstructured text → structured JSON
- **Decision support** — summaries, risk suggestions, missing info prompts
- **Fraud assistance** — pattern and inconsistency detection

---

### API Endpoints

#### Authentication (`/api/v1/auth`)

| Method | Path        | Description           | Access        |
| ------ | ----------- | --------------------- | ------------- |
| POST   | `/login`    | Login, get JWT token  | Public        |
| POST   | `/register` | Self-registration     | Public        |
| POST   | `/add-user` | Admin adds user       | Superuser     |
| GET    | `/me`       | Get current user info | Authenticated |

#### Claims (`/api/v1/claims`)

| Method | Path            | Description                    | Access        |
| ------ | --------------- | ------------------------------ | ------------- |
| POST   | `/`             | Submit new claim               | Authenticated |
| GET    | `/`             | List claims (filtered by role) | Authenticated |
| GET    | `/{id}`         | Full claim detail + reports    | Authenticated |
| POST   | `/{id}/process` | Run processing pipeline        | Officers      |
| POST   | `/{id}/approve` | Approve with payout amount     | Senior/Super  |
| POST   | `/{id}/reject`  | Reject with reason             | Senior/Super  |

#### Policies (`/api/v1/policies`)

| Method | Path           | Description            | Access        |
| ------ | -------------- | ---------------------- | ------------- |
| POST   | `/`            | Create policy          | Authenticated |
| GET    | `/`            | List policies          | Authenticated |
| GET    | `/{id}`        | Policy detail + assets | Authenticated |
| POST   | `/{id}/assets` | Add asset to policy    | Authenticated |

#### Calculation Tools (`/api/v1/tools`)

| Method | Path                      | Description                | Access        |
| ------ | ------------------------- | -------------------------- | ------------- |
| POST   | `/calculate-risk`         | Risk / premium calculator  | Authenticated |
| POST   | `/calculate-depreciation` | Depreciation / payout calc | Authenticated |

#### Tier Endpoints (`/api/v1/tier{1,2,3}`)

| Method | Path      | Description         | Access          |
| ------ | --------- | ------------------- | --------------- |
| GET    | `/claims` | List claims by tier | Role-restricted |

---

### Authentication & Roles

JWT-based authentication with role-based access control.

| Role                     | Access Level                                 |
| ------------------------ | -------------------------------------------- |
| **Superuser**            | Full control, system config, user management |
| **Senior Officer**       | All claims, approve/reject, assign cases     |
| **Intermediate Officer** | Tier 1 & 2 claims, processing                |
| **Junior Officer**       | Tier 1 claims only, basic processing         |
| **Client**               | Submit claims, view own claims only          |

**Dev Mode:** Set `DEV_MODE=true` in `.env` to bypass authentication (returns superuser context).

---

## Frontend

The frontend is a **zero-dependency single-page app** (vanilla HTML/CSS/JS) located in `frontend/`.

### Pages

| Page             | Features                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| **Dashboard**    | Stats overview, recent claims grid                                                          |
| **Claims**       | Full CRUD, filtering by status/tier, submit new claims                                      |
| **Claim Detail** | Risk breakdown, depreciation details, fraud assessment, approve/reject with editable payout |
| **Policies**     | Create and list policies, add assets                                                        |
| **Calculators**  | Interactive risk premium calculator + depreciation tool                                     |
| **Reports**      | View generated reports from processed claims                                                |
| **Users**        | User management (superuser only)                                                            |

### Key UI Features

- **Decision Gate:** Officers see suggested payout, can edit the amount, and approve/reject
- **Risk Breakdown:** Visual factor-by-factor display showing which risk factors applied
- **Fraud Flags:** Visual indicators for flagged claims
- **Audit Trail:** Full history of every decision on a claim
- **Role-Based Navigation:** Menu items shown based on user role

To serve the frontend during development:

```bash
cd frontend
python -m http.server 3000
```

Then open `http://localhost:3000`.

---

## Setup & Running

### Prerequisites

- Python 3.10+
- PostgreSQL (running on port 5433 or as configured)
- Database named `Insurance_llm`

### Backend Setup

```bash
cd llm_insurance_backend

# Create virtual environment
python -m venv EasyInsure
# Windows:
EasyInsure\Scripts\activate
# Linux/Mac:
# source EasyInsure/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file (see Environment Variables below)

# Run the server
python main.py
# or
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API docs are available at `http://localhost:8000/docs` (Swagger UI).

### Frontend Setup

```bash
cd frontend
python -m http.server 3000
```

Open `http://localhost:3000` in your browser.

---

## Environment Variables

Create a `.env` file in `llm_insurance_backend/`:

```env
# Database
DB_NAME=Insurance_llm
DB_USER=postgres
DB_PASSWORD=admin
DB_HOST=localhost
DB_PORT=5433

# Authentication
SECRET_KEY=your-secure-secret-key-here

# LLM
OPENAI_API_KEY=sk-your-openai-key

# Development
DEV_MODE=true
```

---

## Development Phases

| Phase | Focus                                                                                 | Status      |
| ----- | ------------------------------------------------------------------------------------- | ----------- |
| 1     | Database models, Risk Engine, Depreciation Engine, Fraud Detection, Decision Pipeline | ✅ Complete |
| 2     | OpenAI integration, tier routing, LLM extraction                                      | 🔧 Ready    |
| 3     | Auth + roles, Frontend UI                                                             | ✅ Complete |
| 4     | Advanced pricing, ML models, AWS deployment                                           | 📋 Planned  |

---

## Security Considerations

- JWT tokens for authentication
- Role-based access control on every endpoint
- No PII sent to LLM APIs (only asset type, incident description)
- Passwords hashed with bcrypt
- API keys stored in environment variables, never in code
- CORS configured for frontend origin
- All database queries use parameterized statements (SQLAlchemy ORM)

---

## License

Proprietary — EasyInsure Platform.
