# NOUFAR CDSS

NOUFAR CDSS is a medical web application designed for doctors to support hyperthyroidism relapse prediction through a polished clinical workflow and an admin management console.

This repository currently contains a frontend prototype with:

- a responsive product landing page
- doctor-facing application screens
- a modern admin dashboard for doctor management
- mock data and UI interactions ready to connect to a backend later

## Product Scope

### Doctor-facing experience

The doctor-facing side of the product includes:

- landing page for the platform
- authentication modals and account settings
- dashboard overview
- new prediction workflow
- dataset upload and patient selection flow
- prediction outcome panels
- history and patient management pages

### Admin experience

The admin dashboard is built for managing doctors who register on the platform.

It includes:

- overview dashboard
- doctors management
- doctor details review
- support center
- admin login page

## Project Structure

### Main application

- `index.html` - landing page
- `dashboard.html` - doctor dashboard
- `new-prediction.html` - prediction workflow
- `dataset-selection.html` - uploaded dataset patient selection
- `history.html` - results history
- `patients.html` - patient directory
- `account-settings.html` - doctor account settings
- `styles.css` - landing page styles
- `dashboard.css` - doctor app shared styles

### Admin dashboard

- `admin-doctor-management/login.html` - admin login
- `admin-doctor-management/index.html` - admin overview
- `admin-doctor-management/doctors.html` - doctors management
- `admin-doctor-management/doctor-details.html` - doctor review details
- `admin-doctor-management/support-center.html` - support inbox
- `admin-doctor-management/admin-styles.css` - shared admin styles
- `admin-doctor-management/admin-app.js` - admin interactions
- `admin-doctor-management/admin-data.js` - admin mock data

## Admin Demo Credentials

Use these credentials on the admin login page:

- Username: `admin`
- Password: `admin`

## Design Direction

The interface follows a polished medical SaaS direction with:

- clean clinical layout logic
- premium dark admin styling
- modern responsive cards and tables
- soft blue accents and glow treatment
- reusable UI patterns for future API integration

## Running The Project

This project is currently static frontend code.

To preview it locally, open the HTML files directly in a browser, starting with:

- `index.html` for the public-facing experience
- `admin-doctor-management/login.html` for the admin dashboard

## Implementation Notes

- Mock data is used across both the doctor and admin interfaces.
- Interactive flows are implemented in plain HTML, CSS, and JavaScript.
- The structure is intentionally kept simple so it can be connected later to a backend or API.

## Next Steps

Suggested next improvements:

- connect doctor and admin flows to a real backend
- store authentication and role-based access securely
- persist uploaded datasets and prediction history
- integrate model inference and real explainability outputs
- add production deployment configuration

## Auto Model Selection (Backend)

The backend now supports two prediction selection policies:

- `manual` (default): use the active model set by admin
- `auto_by_completeness`: choose `LR/RF/DNN` automatically from form completeness buckets

Selection metadata is stored on each prediction:

- `selectionPolicy`
- `selectedModelKey`
- `completenessScore`
- `completenessBucket`
- `selectionReason`

To generate bucket mapping from offline benchmark CSV:

```bash
npm run benchmark:auto-selection
```

Input template: `scripts/benchmark_model_by_completeness.csv`  
Generated config: `backend/src/config/autoModelSelection.config.json`

For a real benchmark on the integrated 500-row dataset:

```bash
python scripts/benchmark_auto_selection_500.py
npm run benchmark:auto-selection
```

Detailed benchmark output: `scripts/benchmark_outputs/auto_selection_detailed.csv`
