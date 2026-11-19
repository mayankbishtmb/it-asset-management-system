# Test Cases: IT Asset Management System

| ID  | Scenario | Steps | Expected result | Type | Status |
|-----|----------|-------|-----------------|------|--------|
| TC1 | Login with wrong password | Enter admin@itam.com with a wrong password | Error "Invalid email or password", no login | Auto | Pass |
| TC2 | Duplicate serial number | Add an asset with serial DL-48213 | Rejected (409), "Serial number already exists" | Auto | Pass |
| TC3 | Assign an already-assigned asset | POST /assign with asset 1 | Rejected (400), asset not available | Auto | Pass |
| TC4 | Return makes asset Available | Add, assign, return an asset | Asset status becomes Available | Auto | Pass |
| TC5 | Employee blocked from admin API | Call GET /assets as employee | 403 Admin access only | Auto | Pass |
| TC6 | Repair workflow | Report issue, In repair, Fixed | Asset goes Maintenance, then Assigned; steps cannot be skipped | Auto | Pass |
| TC7 | Report on someone else's asset | Rishabh reports asset 3 | 403 Forbidden | Auto | Pass |
| TC8 | Admin login redirect | Log in as admin | Admin dashboard opens | Manual | Pass |
| TC9 | Employee login redirect | Log in as employee | "My Assets" page opens | Manual | Pass |
| TC10 | Search and filter | Type "Dell", choose status Assigned | Only matching assets listed | Manual | Pass |
| TC11 | Add asset with empty name | Submit form without name | Validation message, asset not saved | Manual | Pass |
| TC12 | Delete assigned asset | Delete an Assigned asset | Blocked with an error message | Manual | Pass |
| TC13 | Unauthenticated page access | Open admin.html without login | Redirected to login | Manual | Pass |