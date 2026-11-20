# IT Asset Management System

A full-stack web application for managing an organization’s IT assets, employee assignments, and repair requests. This project was built as a B.Tech final-year project and demonstration.

## Live Demo

https://it-asset-management-system-uwuq.onrender.com/

## Project features

### Asset inventory

- Add assets with a name, type, serial number, and warranty expiry date
- Edit asset details
- Search by asset name or serial number and filter by status
- Retire, restore, and delete assets, with restrictions for assets that are assigned or in maintenance
- View inventory totals, utilization, and asset counts by type
- Export the inventory as a CSV file
- Monitor expired warranties and warranties due within 90 days

### Employee and assignment management

- Admins can add employee accounts with a name, email, and password
- View the employee directory
- Assign available assets to employees
- Record returned assets and view assignment history
- Employees can view assets assigned to them

### Repair management

- Employees can report a problem for an asset assigned to them
- Admins can review repair requests and move them through **Reported → In repair → Fixed**
- The app updates an asset’s status while a repair is open and when it is completed
- Repair requests include an issue description, priority, reporting employee, and date

### Access and interface

- Admin and employee roles have different access and screens
- Login and logout with role-based page access
- Light and dark themes; the selected theme is saved in the browser
- Responsive layout for desktop and mobile screens
- Activity log records asset, employee, assignment, and repair changes

## Technology

- **Frontend:** React, Vite, CSS
- **Backend:** Node.js, Express
- **Database:** SQLite using `better-sqlite3`
- **Tests:** Node.js built-in test runner

## Database tables

- `users` — employee and admin accounts, roles, and password hashes
- `assets` — asset details, serial numbers, status, and warranty dates
- `assignments` — asset assignment and return history
- `repairs` — reported issues, priority, and repair status
- `activity_log` — user, action, record, and timestamp for recent changes

The database schema is created automatically on startup. If the database has no users, the app inserts initial demo accounts and sample assets.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@itam.com` | `admin123` |
| Employee | `rishabh@itam.com` | `emp123` |

The initial seed also includes employee accounts for Ayush Raj, Mayank Bisht, and Neha Sharma. The admin dashboard can be used to create additional employee accounts.

## Run locally

Requirements: Node.js 20 or newer and npm.

Install dependencies:

```bash
npm install
```

Start the frontend and API for development:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite serves the frontend and forwards `/api` requests to the Express server on port 3000.

## Build and run

Create the production frontend and start the Express server:

```bash
npm run build
npm start
```

The server uses the `PORT` environment variable, defaulting to port 3000. The SQLite database path can be changed with `DB_FILE`; otherwise, it uses `itam.db` in the project folder.

## Tests

Run the API tests with:

```bash
npm test
```

## Deploy to Render

This repository includes `render.yaml` for deploying the full-stack app as a
Node.js web service. In the Render dashboard, choose **New → Blueprint** and
select this repository. The Blueprint uses a persistent disk mounted at
`/var/data`, so SQLite data is retained across deployments. Render's persistent
disk requires a paid web service.

## Project structure

```text
frontend/
  index.html
  src/
    main.jsx             React application and page components
    style.css            Application styles and themes
server.js                Express API and static-file server
db.js                    SQLite schema and initial demo data
public/                  Generated production frontend from npm run build
tests/api.test.js        Automated API tests
test-cases.md            Test-case list
vite.config.js           Vite development and build configuration
package.json             Scripts and dependencies
package-lock.json        Locked dependency versions
```
