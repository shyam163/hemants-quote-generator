#!/bin/bash

# Hemant's Quote Generator - One-Click Start Script
# Run with: ./start.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  Hemant's Quote Generator"
echo "=========================================="

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python3 is not installed!"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "[1/3] Creating virtual environment..."
    python3 -m venv venv
else
    echo "[1/3] Virtual environment already exists"
fi

# Activate virtual environment
echo "[2/3] Activating virtual environment..."
source venv/bin/activate

# Always install/upgrade dependencies
echo "[3/3] Installing dependencies..."
./venv/bin/pip install -r requirements.txt

echo ""
echo "=========================================="
echo "  Starting server on http://localhost:5005"
echo "  Press Ctrl+C to stop"
echo "=========================================="
echo ""

# Run the Flask app
./venv/bin/python app.py
