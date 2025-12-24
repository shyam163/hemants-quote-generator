# Hemant's Quote Generator

A Flask web application for generating professional quotes and invoices with hourly-based billing.

## Features

- Hourly-based billing system
- Auto-generate days from date range
- Live invoice preview
- SQLite database for saving quotes
- Print/PDF export ready
- Collapsible bank details
- Pre-populated default values

## Requirements

- Python 3.8 or higher
- macOS, Linux, or Windows

## Installation (macOS)

### 1. Install Python (if not already installed)

**Option A: Using Homebrew (recommended)**
```bash
brew install python3
```

**Option B: Download from python.org**
- Visit https://www.python.org/downloads/
- Download and install the latest Python 3

### 2. Clone the repository
```bash
git clone https://github.com/shyam163/hemants-quote-generator.git
cd hemants-quote-generator
```

### 3. Run the application
```bash
chmod +x start.sh
./start.sh
```

### 4. Open in browser
Navigate to: **http://localhost:5005**

## Usage

1. **Set Hourly Rate** - Enter your hourly rate (default: AED 200)
2. **Fill Client Details** - Company name, address, POC, venue
3. **Set Work Period** - Select "From Date" and "To Date"
4. **Generate Days** - Click "Generate Days" to create line items
5. **Enter Hours** - Fill in hours worked for each day
6. **Save Quote** - Save to database for future reference
7. **Print/PDF** - Click "Print / PDF" to export

## File Structure

```
hemants-quote-generator/
├── app.py              # Flask backend
├── start.sh            # One-click start script
├── requirements.txt    # Python dependencies
├── templates/
│   └── index.html      # Main page template
├── static/
│   ├── css/
│   │   └── style.css   # Styling
│   └── js/
│       └── app.js      # Frontend logic
└── instance/
    └── quotes.db       # SQLite database (auto-created)
```

## Manual Setup (Alternative)

If you prefer not to use the start script:

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py
```

## Troubleshooting

**Port already in use:**
Edit `app.py` and change the port number on the last line:
```python
app.run(debug=True, port=5005)  # Change 5005 to another port
```

**Permission denied on start.sh:**
```bash
chmod +x start.sh
```

**Python not found:**
Make sure Python 3 is installed and in your PATH:
```bash
which python3
```

## License

MIT License
