# Hemant's Quote Generator

## Project Overview
A Flask web application for generating professional quotes/invoices with hourly-based billing system. Deployed at https://gig.quantumautomata.in

## Tech Stack
- **Backend**: Flask, SQLAlchemy, Flask-Login
- **Database**: SQLite (`instance/quotes.db`)
- **PDF Generation**: WeasyPrint
- **Frontend**: Vanilla JS, CSS with CSS variables for theming

## Server Deployment
- **Server**: 152.67.163.191 (gig.quantumautomata.in)
- **SSH User**: ubuntu
- **SSH Key**: `/home/shyam/Documents/keys/ssh-key-2025-04-13.key`
- **App Path**: `/home/ubuntu/quote-generator/`
- **Service**: `quote-generator.service` (systemd)
- **Process**: Gunicorn on port 5005, behind Nginx

### Deploy Commands
```bash
# Sync files
rsync -avz --exclude '.git' --exclude '__pycache__' --exclude 'venv' --exclude 'instance' -e "ssh -i /home/shyam/Documents/keys/ssh-key-2025-04-13.key" /home/shyam/claudescodes/hemant/ ubuntu@152.67.163.191:/home/ubuntu/quote-generator/

# Fix static file permissions (IMPORTANT - otherwise CSS/JS won't load)
ssh -i /home/shyam/Documents/keys/ssh-key-2025-04-13.key ubuntu@152.67.163.191 "chmod -R 755 /home/ubuntu/quote-generator/static/"

# Restart service
ssh -i /home/shyam/Documents/keys/ssh-key-2025-04-13.key ubuntu@152.67.163.191 "sudo systemctl restart quote-generator"
```

## Database Schema

### User Model
- `username` - Login credential (unique, required)
- `email` - Contact email for invoices (optional, editable in profile)
- `password_hash` - Hashed password
- `role` - 'user' or 'admin'
- `is_active` - Account status
- `must_change_password` - Force password change on login
- `business_name` - Displayed in invoice header (priority)
- `full_name` - Fallback for invoice header
- `address`, `phone` - Contact info for invoices
- `bank_account_holder`, `bank_name`, `bank_account_number`, `bank_iban` - Bank details
- `profilepic` - Path to uploaded logo
- `default_hourly_rate`, `default_job_description` - Defaults for new quotes

### Quote Model
- Associated with user via `user_id`
- Contains client details, job info, bank details (can override user defaults)
- Has many `LineItem` records

### LineItem Model
- Date, time_in, time_out
- Regular hours, overtime hours, line total
- Job description per line

## Key Files

### Templates
- `templates/index.html` - Main quote form and live preview
- `templates/invoice_pdf.html` - PDF generation template (WeasyPrint)
- `templates/login.html` - Login page (uses username, not email)
- `templates/admin.html` - Admin dashboard for user management
- `templates/profile.html` - User profile settings
- `templates/change_password.html` - Password change form

### Static Files
- `static/css/style.css` - Main styles with CSS variables for theming
- `static/js/app.js` - Quote form logic, calculations, preview updates

## Invoice Display Rules

### Header (Business Name)
- **Priority**: `business_name` > `full_name` > 'N/A'
- Font size: 2.1em (30% larger than original)
- Color: Accent color (#1a5f5a)

### "Make All check payable to" & "Account Holder Name"
- Uses ONLY `bank_account_holder` field
- No fallback to business_name or full_name
- Shows 'N/A' or 'Set in Profile' if not set

### Contact Bar
- Shows: Address, Email (user.email), Phone

## Authentication
- Login uses **username** (not email)
- Email is a separate contact field for invoices
- Migration script (`migrate_db.py`) converts old email-based logins to usernames

## PDF Generation
- Endpoint: `GET /api/quotes/<id>/pdf`
- Uses WeasyPrint to render `invoice_pdf.html`
- Returns downloadable PDF file
- Requires saving quote first (prompts user if unsaved)

## Background Images
- 10 background images available in `static/images/backgrounds/` (1.jpg - 10.jpg)
- Users select background via collapsible "Background Image" section in editor
- Selection applies to both live preview and PDF output
- PDF generation accepts `?bg=N` query parameter (e.g., `/api/quotes/1/pdf?bg=3`)
- `bg=none` or omitting parameter = white background

## Responsive Layout
- **< 1350px width**: Stacked layout (editor on top, preview below)
- **≥ 1350px width**: Side-by-side layout (500px editor on left, preview on right)
- Both panels scroll independently on wide screens

## Common Issues

### CSS Not Loading (404 or unstyled page)
File permissions issue. Fix with:
```bash
chmod -R 755 /home/ubuntu/quote-generator/static/
```

### Login Fails After Migration
Users now login with username (part before @ in old email), not full email.
Example: `hemant@example.com` → username: `hemant`

### WeasyPrint Flexbox Issues
WeasyPrint has limited flexbox support. Use HTML tables with inline styles for complex layouts in PDF template.

## Migration Notes
When adding new database columns:
1. SQLite doesn't support adding NOT NULL columns with existing data
2. Add column as nullable first, populate, then enforce at app level
3. Use `migrate_db.py` pattern for schema changes
