# Software Requirements Specification (SRS)

**Project Title:** Time Tracker System  
**Version:** 1.0  
**Date:** November 2025  
**Prepared by:** [Your Name / Company Name]

## 1. Introduction

### 1.1 Purpose
The purpose of this document is to define the functional and non-functional requirements for the Time Tracker System, a productivity monitoring platform that enables organizations to track employee work time, capture periodic screenshots, and monitor performance via both a web application and a desktop client.

### 1.2 Scope
The Time Tracker System will provide:
- A web-based admin/manager portal for managing employees, viewing reports, and monitoring productivity.
- A desktop application (Python-based) for employees to log work time and automatically capture screenshots.
- A backend service (Node.js) with APIs for data exchange between the web app and the desktop client.
- A frontend web interface built in React.js for intuitive management and real-time reporting.

## 2. System Overview
The system will consist of three major components:
1. Web Application (React + Node.js)
2. Desktop Application (Python)
3. Backend API Server (Node.js + Database)

## 3. User Roles and Permissions

| Role | Description | Permissions |
|------|-------------|-------------|
| Super Admin | System owner who manages all organizations. | Full access: manage all users, view all reports, system configurations. |
| Manager/Employer | Manages a specific team or company. | Create/assign employees, monitor reports/screenshots, manage tasks. |
| Employee | End-user who installs and runs the desktop client. | Can log in, start/stop tracking, and view personal work logs. |

## 4. Functional Requirements

### 4.1 Authentication & User Management
- System must support user registration and login (Admin, Manager, Employee).
- Email-based verification and password reset functionality.
- Super Admin can create or delete organizations.
- Managers can invite employees via email to join the system.

### 4.2 Employee Desktop Application (Python)
- Employees can download the desktop app from the web portal.
- Log in, start/stop tracking manually.
- Automatically capture desktop screenshots every 3 or 5 minutes.
- Upload screenshots securely to the backend API.
- Detect idle time and sync data in real-time.

### 4.3 Web Application (React)
- Admin/Manager can view dashboards, screenshots, and reports.
- Manage employee accounts.
- Generate daily/weekly/monthly productivity reports.
- Adjust screenshot frequency and idle time settings.

### 4.4 Backend (Node.js)
- RESTful APIs for authentication, data upload, and reports.
- Integration with MongoDB or PostgreSQL.
- Secure storage for image files.

## 5. Non-Functional Requirements

| Requirement | Description |
|-------------|-------------|
| Performance | System should handle 100+ concurrent employee uploads. |
| Security | All API communications must use HTTPS. Screenshots must be encrypted. |
| Scalability | Backend should support scaling across multiple servers. |
| Usability | Intuitive web UI, responsive on mobile and desktop. |
| Reliability | Desktop app should queue data during offline mode and sync later. |
| Maintainability | Modular architecture for easy updates (React, Node, Python). |

## 6. Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React.js, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB or PostgreSQL |
| Desktop App | Python (PyQt or Tkinter) |
| Storage | AWS S3 or Local File System |
| Authentication | JWT Tokens, bcrypt |

## 7. System Flow Summary
1. Manager/Super Admin creates organization and employees.
2. Employee downloads and installs desktop tracker.
3. Employee logs in and starts tracking.
4. Tracker records time, captures screenshots, and uploads data.
5. Web portal displays reports, screenshots, and logs.
6. Manager/Admin reviews productivity data.

## 8. Future Enhancements
- Webcam capture for attendance verification.
- Task/project tracking modules.
- Invoice generation for freelancers.
- Integration with Slack, Trello, or Asana.
- Mobile app for managers.

## 9. Deliverables
- Fully functional web app (React + Node.js)
- Python desktop client
- Database schema and API documentation
- Deployment setup instructions
- Admin/Manager dashboard

## 4.5 Live View of Employee
The system shall provide a real-time 'Live View' feature that allows managers or administrators to monitor an employee’s current screen activity while they are online. This enables live productivity tracking and immediate feedback when necessary.

**Key Features:**
- Real-time streaming of the employee's desktop screen (with necessary permissions).
- Manager/Admin can initiate or end a live view session from the web dashboard.
- The system should ensure encrypted and secure transmission of the live view stream.
- The live view session automatically ends when the employee stops tracking or goes offline.
- A visual indicator should be displayed on the employee’s desktop app during live view to maintain transparency.