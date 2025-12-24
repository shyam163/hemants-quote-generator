// State
let lineItems = [];
let hourlyRate = 200;
let currentQuoteId = null;

// Toggle bank details section
function toggleBankDetails() {
    const content = document.getElementById('bankDetailsContent');
    const icon = document.getElementById('bankToggleIcon');
    if (content.style.display === 'none') {
        content.style.display = 'grid';
        icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
    }
}

// Toggle palette section
function togglePalette() {
    const content = document.getElementById('paletteContent');
    const icon = document.getElementById('paletteToggleIcon');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
    }
}

// Color palettes
const palettes = {
    teal: { primary: '#1a5f5a', accent: '#e8f5f3' },
    navy: { primary: '#1a3a5f', accent: '#e8f0f5' },
    maroon: { primary: '#5f1a1a', accent: '#f5e8e8' },
    purple: { primary: '#4a1a5f', accent: '#f0e8f5' },
    forest: { primary: '#2d5f1a', accent: '#ecf5e8' }
};

// Apply preset palette
function applyPalette(name) {
    const palette = palettes[name];
    if (palette) {
        document.getElementById('primaryColor').value = palette.primary;
        document.getElementById('accentColor').value = palette.accent;
        applyColors(palette.primary, palette.accent);
    }
}

// Apply custom colors
function applyCustomColor() {
    const primary = document.getElementById('primaryColor').value;
    const accent = document.getElementById('accentColor').value;
    applyColors(primary, accent);
}

// Apply colors to invoice
function applyColors(primary, accent) {
    const invoice = document.querySelector('.invoice');
    invoice.style.setProperty('--primary-color', primary);
    invoice.style.setProperty('--accent-color', accent);

    // Update elements that use primary color
    document.querySelectorAll('.invoice-header, .invoice-header h1, .header-logo').forEach(el => {
        el.style.borderColor = primary;
        if (el.tagName === 'H1') el.style.color = primary;
    });
    document.querySelector('.invoice-header').style.borderBottomColor = primary;
    document.querySelector('.invoice-label').style.color = primary;

    // POC headers
    document.querySelectorAll('.poc-item.header').forEach(el => {
        el.style.backgroundColor = primary;
    });

    // POC values
    document.querySelectorAll('.poc-item.value').forEach(el => {
        el.style.backgroundColor = accent;
        el.style.color = primary;
        el.style.borderColor = primary;
    });

    // Job description
    const jobDesc = document.querySelector('.job-description-display');
    if (jobDesc) jobDesc.style.borderLeftColor = primary;

    // Table header
    document.querySelectorAll('.items-table th').forEach(el => {
        el.style.borderBottomColor = primary;
    });

    // Totals
    document.querySelectorAll('.total-row.final').forEach(el => {
        el.style.borderBottomColor = primary;
        el.style.color = primary;
    });
    document.querySelectorAll('.total-value').forEach(el => {
        el.style.color = primary;
    });

    // Footer
    document.querySelector('.payable-note').style.color = primary;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('invoiceDate').value = today;
    document.getElementById('dateFrom').value = today;
    document.getElementById('dateTo').value = today;

    // Load settings (hourly rate)
    loadSettings();

    // Load saved quotes list
    loadQuotesList();

    // Initial preview update
    updatePreview();
});

// Load settings from API
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        hourlyRate = settings.hourly_rate;
        document.getElementById('hourlyRate').value = hourlyRate;
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Save hourly rate
async function saveHourlyRate() {
    const newRate = parseFloat(document.getElementById('hourlyRate').value) || 200;
    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hourly_rate: newRate })
        });
        if (response.ok) {
            hourlyRate = newRate;
            // Update all line items with new rate
            lineItems.forEach(item => {
                item.rate = hourlyRate;
            });
            renderLineItems();
            updatePreview();
            alert('Hourly rate saved!');
        }
    } catch (error) {
        console.error('Error saving rate:', error);
    }
}

// Generate days from date range
function generateDays() {
    const fromDateStr = document.getElementById('dateFrom').value;
    const toDateStr = document.getElementById('dateTo').value;

    if (!fromDateStr || !toDateStr) {
        alert('Please select both From and To dates');
        return;
    }

    const fromDate = new Date(fromDateStr);
    const toDate = new Date(toDateStr);

    if (fromDate > toDate) {
        alert('From date must be before To date');
        return;
    }

    hourlyRate = parseFloat(document.getElementById('hourlyRate').value) || 200;
    lineItems = [];

    // Loop through each day in range
    const currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
        lineItems.push({
            id: currentDate.getTime(),
            date: new Date(currentDate),
            hours: 8, // Default 8 hours
            rate: hourlyRate
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }

    renderLineItems();
    updatePreview();
}

// Render line items (hours per day)
function renderLineItems() {
    const container = document.getElementById('lineItemsContainer');

    if (lineItems.length === 0) {
        container.innerHTML = '<p class="hint">Select date range and click "Generate Days"</p>';
        return;
    }

    container.innerHTML = '';
    hourlyRate = parseFloat(document.getElementById('hourlyRate').value) || 200;

    lineItems.forEach((item, index) => {
        const lineTotal = item.hours * item.rate;
        const dateStr = formatDateDisplay(item.date);

        const dayHtml = `
            <div class="day-item" data-id="${item.id}">
                <span class="day-date">${dateStr}</span>
                <div class="hours-input">
                    <label>Hours:</label>
                    <input type="number" value="${item.hours}" min="0" max="24" step="0.5"
                        onchange="updateHours(${item.id}, this.value)">
                </div>
                <span class="day-rate">@ AED ${formatNumber(item.rate)}/hr</span>
                <span class="day-total">= AED ${formatNumber(lineTotal)}</span>
            </div>
        `;
        container.innerHTML += dayHtml;
    });
}

// Update hours for a specific day
function updateHours(id, hours) {
    const item = lineItems.find(i => i.id === id);
    if (item) {
        item.hours = parseFloat(hours) || 0;
    }
    updatePreview();
}

// Load quotes list
async function loadQuotesList() {
    try {
        const response = await fetch('/api/quotes');
        const quotes = await response.json();

        const select = document.getElementById('savedQuotes');
        select.innerHTML = '<option value="">-- New Quote --</option>';

        quotes.forEach(quote => {
            const option = document.createElement('option');
            option.value = quote.id;
            const date = quote.date ? new Date(quote.date).toLocaleDateString() : '';
            option.textContent = `${quote.doc_type} #${quote.invoice_number || '?'} - ${quote.client_company || 'No client'} (${date})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading quotes:', error);
    }
}

// Load a specific quote
async function loadQuote(quoteId) {
    if (!quoteId) {
        clearForm();
        return;
    }

    try {
        const response = await fetch(`/api/quotes/${quoteId}`);
        const quote = await response.json();

        currentQuoteId = quote.id;

        // Fill form fields
        document.getElementById('docType').checked = quote.doc_type === 'INVOICE';
        document.getElementById('invoiceDate').value = quote.date || '';
        document.getElementById('invoiceNumber').value = quote.invoice_number || '01';
        document.getElementById('poNumber').value = quote.po_number || 'PO000000';
        document.getElementById('jobId').value = quote.job_id || 'EVS 00-00000';
        document.getElementById('clientCompany').value = quote.client_company || 'Company Name';
        document.getElementById('clientAddress').value = quote.client_address || 'PO Box 00000\nLocation - City\nUnited Arab Emirates';
        document.getElementById('poc').value = quote.poc || 'Contact Name';
        document.getElementById('venue').value = quote.venue || 'Venue Name';
        document.getElementById('jobDescription').value = quote.job_description || 'Sound Operator';
        document.getElementById('hourlyRate').value = quote.hourly_rate || 200;
        document.getElementById('dateFrom').value = quote.date_from || '';
        document.getElementById('dateTo').value = quote.date_to || '';
        document.getElementById('taxRate').value = quote.tax_rate || 0;

        // Bank details
        document.getElementById('bankAccountHolder').value = quote.bank_account_holder || 'Hemanth Kulamullathil';
        document.getElementById('bankName').value = quote.bank_name || 'Mashreq Bank';
        document.getElementById('bankAccountNumber').value = quote.bank_account_number || '019010238158';
        document.getElementById('bankIban').value = quote.bank_iban || 'AE750330000019010238158';

        // Load line items
        hourlyRate = quote.hourly_rate || 200;
        lineItems = quote.line_items.map(item => ({
            id: new Date(item.date).getTime(),
            date: new Date(item.date),
            hours: item.hours || 0,
            rate: item.rate || hourlyRate
        }));

        renderLineItems();
        updatePreview();
    } catch (error) {
        console.error('Error loading quote:', error);
    }
}

// Clear form for new quote
function clearForm() {
    currentQuoteId = null;
    const today = new Date().toISOString().split('T')[0];

    document.getElementById('docType').checked = false;
    document.getElementById('invoiceDate').value = today;
    document.getElementById('invoiceNumber').value = '01';
    document.getElementById('poNumber').value = 'PO000000';
    document.getElementById('jobId').value = 'EVS 00-00000';
    document.getElementById('clientCompany').value = 'Company Name';
    document.getElementById('clientAddress').value = 'PO Box 00000\nLocation - City\nUnited Arab Emirates';
    document.getElementById('poc').value = 'Contact Name';
    document.getElementById('venue').value = 'Venue Name';
    document.getElementById('jobDescription').value = 'Sound Operator';
    document.getElementById('dateFrom').value = today;
    document.getElementById('dateTo').value = today;
    document.getElementById('taxRate').value = '0';

    // Reset bank details to defaults
    document.getElementById('bankAccountHolder').value = 'Hemanth Kulamullathil';
    document.getElementById('bankName').value = 'Mashreq Bank';
    document.getElementById('bankAccountNumber').value = '019010238158';
    document.getElementById('bankIban').value = 'AE750330000019010238158';

    lineItems = [];
    renderLineItems();
    updatePreview();
}

// Save quote
async function saveQuote() {
    const quoteData = {
        doc_type: document.getElementById('docType').checked ? 'INVOICE' : 'QUOTE',
        date: document.getElementById('invoiceDate').value,
        invoice_number: document.getElementById('invoiceNumber').value,
        po_number: document.getElementById('poNumber').value,
        job_id: document.getElementById('jobId').value,
        client_company: document.getElementById('clientCompany').value,
        client_address: document.getElementById('clientAddress').value,
        poc: document.getElementById('poc').value,
        venue: document.getElementById('venue').value,
        job_description: document.getElementById('jobDescription').value,
        hourly_rate: parseFloat(document.getElementById('hourlyRate').value) || 200,
        date_from: document.getElementById('dateFrom').value,
        date_to: document.getElementById('dateTo').value,
        bank_account_holder: document.getElementById('bankAccountHolder').value,
        bank_name: document.getElementById('bankName').value,
        bank_account_number: document.getElementById('bankAccountNumber').value,
        bank_iban: document.getElementById('bankIban').value,
        tax_rate: parseFloat(document.getElementById('taxRate').value) || 0,
        subtotal: calculateSubtotal(),
        total: calculateTotal(),
        line_items: lineItems.map(item => ({
            date: item.date.toISOString().split('T')[0],
            hours: item.hours,
            rate: item.rate,
            line_total: item.hours * item.rate
        }))
    };

    try {
        let response;
        if (currentQuoteId) {
            response = await fetch(`/api/quotes/${currentQuoteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quoteData)
            });
        } else {
            response = await fetch('/api/quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quoteData)
            });
        }

        if (response.ok) {
            const savedQuote = await response.json();
            currentQuoteId = savedQuote.id;
            await loadQuotesList();
            document.getElementById('savedQuotes').value = currentQuoteId;
            alert('Quote saved successfully!');
        }
    } catch (error) {
        console.error('Error saving quote:', error);
        alert('Error saving quote');
    }
}

// Delete current quote
async function deleteCurrentQuote() {
    const quoteId = document.getElementById('savedQuotes').value;
    if (!quoteId) {
        alert('No quote selected to delete');
        return;
    }

    if (!confirm('Are you sure you want to delete this quote?')) {
        return;
    }

    try {
        const response = await fetch(`/api/quotes/${quoteId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            clearForm();
            await loadQuotesList();
            alert('Quote deleted successfully!');
        }
    } catch (error) {
        console.error('Error deleting quote:', error);
        alert('Error deleting quote');
    }
}

// Calculation functions
function calculateSubtotal() {
    return lineItems.reduce((sum, item) => sum + (item.hours * item.rate), 0);
}

function calculateTotal() {
    const subtotal = calculateSubtotal();
    const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;
    return subtotal + (subtotal * taxRate / 100);
}

// Formatting functions
function formatDate(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatDateDisplay(date) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const dayName = days[date.getDay()];
    const dayNum = date.getDate();
    const month = months[date.getMonth()];

    // Add ordinal suffix
    let suffix = 'th';
    if (dayNum === 1 || dayNum === 21 || dayNum === 31) suffix = 'st';
    else if (dayNum === 2 || dayNum === 22) suffix = 'nd';
    else if (dayNum === 3 || dayNum === 23) suffix = 'rd';

    return `${dayName}, ${dayNum}${suffix} ${month}`;
}

function formatNumber(num) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatCurrency(amount) {
    return 'AED ' + formatNumber(amount);
}

// Update preview
function updatePreview() {
    // Update document type
    const isInvoice = document.getElementById('docType').checked;
    const label = isInvoice ? 'INVOICE' : 'QUOTE';
    document.getElementById('docTypeLabel').textContent = label;
    document.getElementById('docNumberLabel').textContent = label + '#:';

    // Update date
    document.getElementById('displayDate').textContent = formatDate(document.getElementById('invoiceDate').value);

    // Update document number
    document.getElementById('displayNumber').textContent = document.getElementById('invoiceNumber').value || '01';

    // Update PO and Job ID
    document.getElementById('displayPO').textContent = document.getElementById('poNumber').value || 'PO000000';
    document.getElementById('displayJobId').textContent = document.getElementById('jobId').value || 'EVS 00-00000';

    // Update client
    const company = document.getElementById('clientCompany').value;
    const address = document.getElementById('clientAddress').value;
    document.getElementById('displayClient').innerHTML = (company || 'Company Name') + '<br>' + (address ? address.replace(/\n/g, '<br>') : '');

    // Update job info (POC table uses clientCompany for Company column)
    document.getElementById('displayPOC').textContent = document.getElementById('poc').value || 'Contact Name';
    document.getElementById('displayJobCompany').textContent = document.getElementById('clientCompany').value || 'Company Name';
    document.getElementById('displayVenue').textContent = document.getElementById('venue').value || 'Venue Name';

    // Update job description
    document.getElementById('displayJobDescription').textContent = document.getElementById('jobDescription').value || 'Sound Operator';

    // Update bank details
    const bankHolder = document.getElementById('bankAccountHolder').value || 'Hemanth Kulamullathil';
    document.getElementById('displayPayableTo').textContent = bankHolder.toUpperCase();
    document.getElementById('displayBankHolder').textContent = bankHolder;
    document.getElementById('displayBankName').textContent = document.getElementById('bankName').value || 'Mashreq Bank';
    document.getElementById('displayAccountNumber').textContent = document.getElementById('bankAccountNumber').value || '019010238158';
    document.getElementById('displayIban').textContent = document.getElementById('bankIban').value || 'AE750330000019010238158';

    // Update items table
    const tbody = document.getElementById('itemsTableBody');
    tbody.innerHTML = '';

    const currentHourlyRate = parseFloat(document.getElementById('hourlyRate').value) || 200;

    lineItems.forEach(item => {
        const lineTotal = item.hours * item.rate;
        const row = `
            <tr>
                <td>${formatDateDisplay(item.date)}</td>
                <td>${item.hours}</td>
                <td>${formatCurrency(item.rate)}</td>
                <td>${formatCurrency(lineTotal)}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    // Update totals
    const subtotal = calculateSubtotal();
    const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;
    const total = calculateTotal();

    document.getElementById('displaySubtotal').textContent = formatCurrency(subtotal);
    document.getElementById('displayTax').textContent = taxRate + '%';
    document.getElementById('displayTotal').textContent = formatCurrency(total);

    // Update editor totals
    document.getElementById('editorSubtotal').textContent = formatCurrency(subtotal);
    document.getElementById('editorTotal').textContent = formatCurrency(total);
}
