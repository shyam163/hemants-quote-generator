// State
let lineItems = [];
let hourlyRate = 200;
let currentQuoteId = null;
let userProfile = null;  // Loaded from /api/profile
let savedCompanies = [];  // User's saved companies
let equipmentItems = [];  // Equipment/materials items

// Invoice Number Generation
// Format: ###-XXXX-MMM-DD (e.g., 001-MICR-DEC-26)
const MONTH_ABBREV = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function generateInvoiceNumber(companyName, date, sequenceNumber) {
    // Sequence: 3 digits padded with zeros
    const seq = String(sequenceNumber).padStart(3, '0');

    // Company: first 4 letters uppercase
    const company = companyName.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase().padEnd(4, 'X');

    // Parse date
    const dateObj = new Date(date);
    const month = MONTH_ABBREV[dateObj.getMonth()];
    const day = String(dateObj.getDate()).padStart(2, '0');

    return `${seq}-${company}-${month}-${day}`;
}

async function getNextSequenceForCompany(companyName) {
    try {
        const response = await fetch(`/api/companies/${encodeURIComponent(companyName)}/next-sequence`);
        if (response.ok) {
            const data = await response.json();
            return data.next_sequence;
        }
    } catch (error) {
        console.error('Error getting next sequence:', error);
    }
    return 1; // Default to 1 if error
}

// Theme Management
function toggleTheme() {
    const body = document.body;
    const themeIcon = document.getElementById('themeIcon');
    const isLightMode = body.classList.toggle('light-mode');

    // Update icon
    themeIcon.textContent = isLightMode ? '☀️' : '🌙';

    // Save preference to localStorage
    localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const themeIcon = document.getElementById('themeIcon');

    // Default to light mode (only use dark if explicitly saved as 'dark')
    if (savedTheme === 'dark') {
        document.body.classList.remove('light-mode');
        if (themeIcon) themeIcon.textContent = '🌙';
    } else {
        document.body.classList.add('light-mode');
        if (themeIcon) themeIcon.textContent = '☀️';
    }
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', initTheme);

// Load and manage companies
async function loadCompanies() {
    try {
        const response = await fetch('/api/companies');
        if (response.ok) {
            savedCompanies = await response.json();
            populateCompanyDropdown();
        }
    } catch (error) {
        console.error('Error loading companies:', error);
    }
}

function populateCompanyDropdown(selectedName = '') {
    const select = document.getElementById('clientCompany');
    // Keep the first option (placeholder)
    select.innerHTML = '<option value="">-- Select Company --</option>';

    savedCompanies.forEach(company => {
        const option = document.createElement('option');
        option.value = company.name;
        option.textContent = company.name;
        // Store all company details as data attributes
        option.dataset.address = company.address || '';
        option.dataset.poc = company.poc || '';
        option.dataset.pocPhone = company.poc_phone || '';
        option.dataset.pocEmail = company.poc_email || '';
        option.dataset.venue = company.venue || '';
        if (company.name === selectedName) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function onCompanySelect() {
    const select = document.getElementById('clientCompany');
    const selectedOption = select.options[select.selectedIndex];

    if (selectedOption && selectedOption.value) {
        // Auto-fill all saved company details
        if (selectedOption.dataset.address) {
            document.getElementById('clientAddress').value = selectedOption.dataset.address;
        }
        if (selectedOption.dataset.poc) {
            document.getElementById('poc').value = selectedOption.dataset.poc;
        }
        if (selectedOption.dataset.pocPhone) {
            document.getElementById('pocPhone').value = selectedOption.dataset.pocPhone;
        }
        if (selectedOption.dataset.pocEmail) {
            document.getElementById('pocEmail').value = selectedOption.dataset.pocEmail;
        }
        if (selectedOption.dataset.venue) {
            document.getElementById('venue').value = selectedOption.dataset.venue;
        }
    }

    updatePreview();
    updateInvoicePreview();
}

function showAddCompanyModal() {
    document.getElementById('newCompanyName').value = '';
    document.getElementById('newCompanyAddress').value = '';
    document.getElementById('addCompanyModal').style.display = 'flex';
    document.getElementById('newCompanyName').focus();
}

function closeAddCompanyModal() {
    document.getElementById('addCompanyModal').style.display = 'none';
}

// Overwrite confirmation modal
let pendingOverwriteAction = null;
let existingQuoteId = null;

function showOverwriteModal(invoiceNumber, quoteId, action) {
    document.getElementById('overwriteQuoteNumber').textContent = invoiceNumber;
    document.getElementById('overwriteModal').style.display = 'flex';
    pendingOverwriteAction = action;
    existingQuoteId = quoteId;
}

function closeOverwriteModal() {
    document.getElementById('overwriteModal').style.display = 'none';
    pendingOverwriteAction = null;
    existingQuoteId = null;
}

async function confirmOverwrite() {
    closeOverwriteModal();
    if (pendingOverwriteAction === 'save') {
        // Set the existing quote ID so we update instead of create
        currentQuoteId = existingQuoteId;
        await performSaveQuote();
    } else if (pendingOverwriteAction === 'pdf') {
        currentQuoteId = existingQuoteId;
        await performSaveQuote();
        window.location.href = `/api/quotes/${currentQuoteId}/pdf`;
    }
}

// Check if a quote with the same invoice number exists
function findExistingQuoteByNumber(invoiceNumber) {
    const select = document.getElementById('savedQuotes');
    for (let i = 0; i < select.options.length; i++) {
        const option = select.options[i];
        if (option.value && option.text.includes(`#${invoiceNumber} `)) {
            return { id: option.value, text: option.text };
        }
    }
    return null;
}

async function saveNewCompany() {
    const name = document.getElementById('newCompanyName').value.trim();
    const address = document.getElementById('newCompanyAddress').value.trim();

    if (!name) {
        alert('Please enter a company name');
        return;
    }

    try {
        const response = await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, address })
        });

        if (response.ok) {
            const company = await response.json();
            savedCompanies.push(company);
            populateCompanyDropdown(company.name);

            // Auto-fill address
            if (address) {
                document.getElementById('clientAddress').value = address;
            }

            closeAddCompanyModal();
            updatePreview();
        } else {
            const error = await response.json();
            alert(error.error || 'Error adding company');
        }
    } catch (error) {
        console.error('Error saving company:', error);
        alert('Error saving company');
    }
}

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

// Toggle background section
function toggleBackground() {
    const content = document.getElementById('bgContent');
    const icon = document.getElementById('bgToggleIcon');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
    }
}

// Current selected background
let selectedBackground = 'none';
let isDarkBackground = false;

// Track current palette
let currentPaletteName = 'teal';

// Select background image
function selectBackground(bg, isDark = false) {
    selectedBackground = bg;
    const wasDarkBackground = isDarkBackground;
    isDarkBackground = isDark;

    // Update selected state in UI
    document.querySelectorAll('.bg-thumb').forEach(thumb => {
        thumb.classList.remove('selected');
        if (thumb.dataset.bg === bg) {
            thumb.classList.add('selected');
        }
    });

    // Apply to invoice preview (apply to .invoice which is the full page in preview)
    const invoice = document.querySelector('.invoice');
    if (bg === 'none') {
        invoice.style.backgroundImage = 'none';
        invoice.style.backgroundColor = '#fafafa';
        // Reset to default palette when selecting "none"
        applyPalette('teal');
    } else {
        invoice.style.backgroundImage = `url('/static/images/backgrounds/${bg}.jpg')`;
        invoice.style.backgroundSize = 'cover';
        invoice.style.backgroundPosition = 'center';
        invoice.style.backgroundRepeat = 'no-repeat';

        // Auto-apply dark palette for dark backgrounds
        if (isDark) {
            applyPalette('dark');
        } else if (currentPaletteName === 'dark') {
            // Switching from dark to light background - apply light palette
            applyPalette('teal');
        }
    }
}

// Color palettes
const palettes = {
    teal: { primary: '#1a5f5a', accent: '#e8f5f3' },
    navy: { primary: '#1a3a5f', accent: '#e8f0f5' },
    maroon: { primary: '#5f1a1a', accent: '#f5e8e8' },
    purple: { primary: '#4a1a5f', accent: '#f0e8f5' },
    forest: { primary: '#2d5f1a', accent: '#ecf5e8' },
    dark: { primary: '#00d4aa', accent: '#1a1a2e', isDark: true, bgColor: '#16213e', textColor: '#ffffff', tableHeader: '#0f3460', tableBg: '#1a1a2e' }
};

// Apply preset palette
function applyPalette(name) {
    const palette = palettes[name];
    if (palette) {
        currentPaletteName = name;
        document.getElementById('primaryColor').value = palette.primary;
        document.getElementById('accentColor').value = palette.accent;
        applyColors(palette.primary, palette.accent, palette);
    }
}

// Apply custom colors
function applyCustomColor() {
    const primary = document.getElementById('primaryColor').value;
    const accent = document.getElementById('accentColor').value;
    applyColors(primary, accent);
}

// Apply colors to invoice
function applyColors(primary, accent, palette = null) {
    const invoice = document.querySelector('.invoice');
    const isDark = palette && palette.isDark;

    invoice.style.setProperty('--primary-color', primary);
    invoice.style.setProperty('--accent-color', accent);

    // Dark theme: apply background and text colors
    if (isDark) {
        invoice.style.backgroundColor = palette.bgColor;
        invoice.style.color = '#ffffff';
        invoice.classList.add('dark-theme');
    } else {
        invoice.style.backgroundColor = '';
        invoice.style.color = '';
        invoice.classList.remove('dark-theme');
    }

    // Update elements that use primary color
    document.querySelectorAll('.invoice-header h1').forEach(el => {
        el.style.color = isDark ? '#ffffff' : primary;
    });
    document.querySelector('.invoice-label').style.color = isDark ? '#ffffff' : primary;

    // Contact bar - all text white in dark mode, no background
    const contactBar = document.querySelector('.contact-bar');
    if (contactBar) {
        contactBar.style.backgroundColor = isDark ? 'transparent' : '';
        contactBar.style.color = isDark ? '#ffffff' : '';
    }
    document.querySelectorAll('.contact-bar span').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });

    // Details section (DATE, QUOTE#, JOB ID, TO)
    document.querySelectorAll('.details-section, .detail-label, .detail-value, .details-left, .details-right').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });

    // POC wrapper
    const pocWrapper = document.querySelector('.poc-wrapper');
    if (pocWrapper) {
        pocWrapper.style.backgroundColor = isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.05)';
    }

    // POC headers
    document.querySelectorAll('.poc-item.header').forEach(el => {
        el.style.backgroundColor = isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.15)';
        el.style.color = isDark ? '#ffffff' : '#333';
    });

    // POC values
    document.querySelectorAll('.poc-item.value').forEach(el => {
        el.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.3)';
        el.style.color = isDark ? '#ffffff' : '#333';
    });

    // Job description
    const jobDesc = document.querySelector('.job-description-display');
    if (jobDesc) {
        jobDesc.style.borderLeftColor = primary;
        jobDesc.style.color = isDark ? '#ffffff' : '';
    }

    // Table header - transparent for both themes
    document.querySelectorAll('.items-table th').forEach(el => {
        el.style.backgroundColor = isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.1)';
        el.style.color = isDark ? '#ffffff' : '';
    });

    // Table cells
    document.querySelectorAll('.items-table td').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });

    // Table body rows
    document.querySelectorAll('.items-table tbody tr').forEach(el => {
        el.style.backgroundColor = isDark ? palette.tableBg : '';
    });

    // Per diem row
    document.querySelectorAll('.per-diem-row, .per-diem-label, .per-diem-value').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });

    // Totals section
    document.querySelectorAll('.totals-section').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });
    document.querySelectorAll('.total-row.final').forEach(el => {
        el.style.color = primary;
    });
    document.querySelectorAll('.total-value').forEach(el => {
        el.style.color = primary;
    });
    document.querySelectorAll('.total-row').forEach(el => {
        if (!el.classList.contains('final')) {
            el.style.color = isDark ? '#ffffff' : '';
        }
    });
    document.querySelectorAll('.total-label').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });

    // Footer - payable note
    const payableNote = document.querySelector('.payable-note');
    if (payableNote) {
        payableNote.style.color = isDark ? '#ffffff' : primary;
    }

    // Bank details section
    const bankDetails = document.querySelector('.bank-details');
    if (bankDetails) {
        bankDetails.style.color = isDark ? '#ffffff' : '';
    }
    document.querySelectorAll('.bank-details h4, .bank-details p, .bank-details span').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });

    // Terms & Conditions section (tos-section)
    const tosSection = document.querySelector('.tos-section');
    if (tosSection) {
        if (isDark) {
            tosSection.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
            tosSection.style.backdropFilter = 'blur(10px)';
            tosSection.style.WebkitBackdropFilter = 'blur(10px)';
            tosSection.style.padding = '15px';
            tosSection.style.borderRadius = '8px';
            tosSection.style.marginTop = '20px';
        } else {
            tosSection.style.backgroundColor = '';
            tosSection.style.backdropFilter = '';
            tosSection.style.WebkitBackdropFilter = '';
            tosSection.style.padding = '';
            tosSection.style.borderRadius = '';
            tosSection.style.marginTop = '';
        }
    }
    document.querySelectorAll('.tos-section, .tos-section h4, .tos-section li, .tos-section strong, .tos-section span').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });

    // Labor wrapper (like POC wrapper)
    const laborWrapper = document.querySelector('.labor-wrapper');
    if (laborWrapper) {
        laborWrapper.style.backgroundColor = isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.05)';
    }

    // Equipments wrapper (like POC wrapper)
    const equipmentsWrapper = document.querySelector('.equipments-wrapper');
    if (equipmentsWrapper) {
        equipmentsWrapper.style.backgroundColor = isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.05)';
    }

    // Equipments table styling
    document.querySelectorAll('.equipments-table th').forEach(el => {
        el.style.backgroundColor = isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.1)';
        el.style.color = isDark ? '#ffffff' : '';
    });
    document.querySelectorAll('.equipments-table td').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });
    document.querySelectorAll('.equipments-table tbody tr').forEach(el => {
        el.style.backgroundColor = isDark ? palette.tableBg : '';
    });

    // Equipments title and total
    document.querySelectorAll('.equipments-title').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });
    document.querySelectorAll('.equipments-total-label').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });
    document.querySelectorAll('.equipments-total-value').forEach(el => {
        el.style.color = primary;
    });

    // Labor total row - match main total styling
    document.querySelectorAll('.labor-total-label').forEach(el => {
        el.style.color = isDark ? '#ffffff' : '';
    });
    document.querySelectorAll('.labor-total-value').forEach(el => {
        el.style.color = primary;
    });
}

// Toggle between Hourly and Daily billing modes
function toggleBillingType() {
    const isDaily = document.getElementById('billingType').checked;

    // Show/hide rate panels
    document.getElementById('hourlyRateGroup').style.display = isDaily ? 'none' : 'flex';
    document.getElementById('dailyRateGroup').style.display = isDaily ? 'flex' : 'none';

    // Show/hide OT percentage dropdown (only used in hourly mode)
    document.getElementById('otPercentageGroup').style.display = isDaily ? 'none' : 'block';

    // Update Terms & Conditions based on billing type
    const tosDailyRate = document.getElementById('tosDailyRate');
    const tosOvertimeText = document.getElementById('tosOvertimeText');
    const tosAdditionalDay = document.getElementById('tosAdditionalDay');
    const tosDailyRateValue = document.getElementById('tosDailyRateValue');

    if (isDaily) {
        const dailyRate = document.getElementById('dailyRate').value || 1600;
        const otHourlyRate = document.getElementById('otHourlyRate').value || 220;

        // Show daily rate line
        if (tosDailyRate) tosDailyRate.style.display = 'list-item';
        if (tosDailyRateValue) tosDailyRateValue.textContent = dailyRate;

        // Update overtime text for daily mode
        if (tosOvertimeText) {
            tosOvertimeText.innerHTML = `Hours exceeding regular call time are charged at the hourly OT rate of <span class="highlight">AED ${otHourlyRate}</span>.`;
        }

        // Hide additional day line (not applicable for daily mode)
        if (tosAdditionalDay) tosAdditionalDay.style.display = 'none';
    } else {
        const otPercentage = document.getElementById('overtimePercentage').value || 10;

        // Hide daily rate line
        if (tosDailyRate) tosDailyRate.style.display = 'none';

        // Update overtime text for hourly mode
        if (tosOvertimeText) {
            tosOvertimeText.innerHTML = `Hours exceeding regular call time are charged at <span id="tosOtRate">${otPercentage}</span>% above the standard hourly rate.`;
        }

        // Show additional day line
        if (tosAdditionalDay) tosAdditionalDay.style.display = 'list-item';
    }

    // Update line items and preview
    renderLineItems();
    updatePreview();
}

// Format day total display with breakdown for daily mode
function formatDayTotal(calc) {
    if (calc.billingType === 'daily') {
        if (calc.overtimeHours > 0) {
            return `AED ${formatNumber(calc.dailyRate)} + ${formatNumber(calc.overtimePay)} OT = ${formatNumber(calc.lineTotal)}`;
        } else {
            return `AED ${formatNumber(calc.lineTotal)}`;
        }
    } else {
        return `AED ${formatNumber(calc.lineTotal)}`;
    }
}

// Time parsing functions
function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + (minutes || 0);
}

function formatMinutesToTime(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Calculate hours and overtime for a line item
function calculateLineItem(item) {
    const isDaily = document.getElementById('billingType').checked;
    const regularCallHours = parseInt(document.getElementById('regularCallHours').value) || 8;

    // Calculate hours from time in/out
    const timeIn = parseTimeToMinutes(item.timeIn);
    const timeOut = parseTimeToMinutes(item.timeOut);
    let totalMinutes = timeOut - timeIn;
    if (totalMinutes < 0) totalMinutes += 24 * 60; // Handle overnight shifts
    const totalHours = totalMinutes / 60;

    // Split into regular and overtime
    const regularHours = Math.min(totalHours, regularCallHours);
    const overtimeHours = Math.max(0, totalHours - regularCallHours);

    if (isDaily) {
        // Daily billing mode
        const dailyRate = parseFloat(document.getElementById('dailyRate').value) || 1600;
        const otHourlyRate = parseFloat(document.getElementById('otHourlyRate').value) || 220;
        const overtimePay = overtimeHours * otHourlyRate;
        const lineTotal = dailyRate + overtimePay;

        return {
            totalHours,
            regularHours,
            overtimeHours,
            dailyRate,
            otHourlyRate,
            overtimePay,
            lineTotal,
            billingType: 'daily'
        };
    } else {
        // Hourly billing mode (original logic)
        const rate = parseFloat(document.getElementById('hourlyRate').value) || 200;
        const overtimePercentage = parseInt(document.getElementById('overtimePercentage').value) || 10;
        const overtimeRate = rate * (1 + overtimePercentage / 100);

        const regularPay = regularHours * rate;
        const overtimePay = overtimeHours * overtimeRate;
        let lineTotal = regularPay + overtimePay;

        // Check for additional day (16+ hours)
        let additionalDayCharge = 0;
        if (totalHours > 16) {
            additionalDayCharge = regularCallHours * rate;
            lineTotal += additionalDayCharge;
        }

        return {
            totalHours,
            regularHours,
            overtimeHours,
            rate,
            overtimeRate,
            lineTotal,
            additionalDayCharge,
            billingType: 'hourly'
        };
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('invoiceDate').value = today;
    document.getElementById('dateFrom').value = today;
    document.getElementById('dateTo').value = today;

    // Load user profile (includes defaults)
    await loadUserProfile();

    // Load saved companies for dropdown
    await loadCompanies();

    // Load saved quotes list
    await loadQuotesList();

    // Apply default background (7.jpg)
    selectBackground('7');

    // Initial preview update
    updatePreview();
    updateInvoicePreview();

    // Check for quote ID in URL parameter (from history page)
    const urlParams = new URLSearchParams(window.location.search);
    const quoteId = urlParams.get('quote');
    if (quoteId) {
        // Load the specified quote
        document.getElementById('savedQuotes').value = quoteId;
        await loadQuote(quoteId);
        // Clean up URL (remove query param) without reloading page
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

// Load user profile from API
async function loadUserProfile() {
    try {
        const response = await fetch('/api/profile');
        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }
        userProfile = await response.json();

        // Apply user defaults
        hourlyRate = userProfile.default_hourly_rate || 200;
        document.getElementById('hourlyRate').value = hourlyRate;

        if (userProfile.default_job_description) {
            document.getElementById('jobDescription').value = userProfile.default_job_description;
        }

        // Apply user's default bank details
        if (userProfile.bank_account_holder) {
            document.getElementById('bankAccountHolder').value = userProfile.bank_account_holder;
        }
        if (userProfile.bank_name) {
            document.getElementById('bankName').value = userProfile.bank_name;
        }
        if (userProfile.bank_account_number) {
            document.getElementById('bankAccountNumber').value = userProfile.bank_account_number;
        }
        if (userProfile.bank_iban) {
            document.getElementById('bankIban').value = userProfile.bank_iban;
        }

        // Update profile picture in preview
        const profilePicEl = document.getElementById('displayProfilePic');
        if (profilePicEl && userProfile.profilepic) {
            profilePicEl.src = userProfile.profilepic;
        }
    } catch (error) {
        console.error('Error loading profile:', error);
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
        const defaultJob = document.getElementById('jobDescription').value || 'Sound Operator';
        lineItems.push({
            id: currentDate.getTime(),
            date: new Date(currentDate),
            timeIn: '08:00',  // Default time in
            timeOut: '18:00', // Default time out (10 hours)
            rate: hourlyRate,
            enabled: true,    // Can be toggled off for holidays
            jobDescription: defaultJob  // Can be customized per day
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }

    renderLineItems();
    updatePreview();
}

// Render line items (time in/out per day)
function renderLineItems() {
    const container = document.getElementById('lineItemsContainer');

    if (lineItems.length === 0) {
        container.innerHTML = '<p class="hint">Select date range and click "Generate Days"</p>';
        return;
    }

    container.innerHTML = '';
    hourlyRate = parseFloat(document.getElementById('hourlyRate').value) || 200;

    const defaultJob = document.getElementById('jobDescription').value || 'Sound Operator';

    lineItems.forEach((item, index) => {
        const calc = calculateLineItem(item);
        const dateStr = formatDateDisplay(item.date);
        const isEnabled = item.enabled !== false;
        const jobDesc = item.jobDescription || defaultJob;
        const isCustomJob = jobDesc !== defaultJob;

        // Format hours display - compact version
        const hoursDisplay = calc.overtimeHours > 0
            ? `${calc.totalHours.toFixed(1)}h (${calc.regularHours}+${calc.overtimeHours.toFixed(1)} OT)`
            : `${calc.totalHours.toFixed(1)}h`;

        const dayHtml = `
            <div class="day-item ${isEnabled ? '' : 'day-disabled'}" data-id="${item.id}">
                <div class="day-header">
                    <label class="day-toggle" title="${isEnabled ? 'Click to mark as holiday' : 'Click to enable'}">
                        <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleDay(${item.id}, this.checked)">
                        <span class="day-date">${dateStr}</span>
                    </label>
                    <div class="day-header-right">
                        <span class="day-total">${isEnabled ? formatDayTotal(calc) : 'OFF'}</span>
                        ${isEnabled ? `<button class="day-menu-btn" onclick="editDayJob(${item.id})" title="Edit job description">⋮</button>` : ''}
                    </div>
                </div>
                ${isEnabled ? `
                ${isCustomJob ? `<span class="day-custom-job">${jobDesc}</span>` : ''}
                <div class="time-inputs">
                    <label>In:</label>
                    <input type="time" value="${item.timeIn}" onchange="updateTimeIn(${item.id}, this.value)">
                    <label>Out:</label>
                    <input type="time" value="${item.timeOut}" onchange="updateTimeOut(${item.id}, this.value)">
                </div>
                <span class="day-hours">${hoursDisplay}</span>
                ` : `<span class="day-off-label">Holiday / Day Off</span>`}
            </div>
        `;
        container.innerHTML += dayHtml;
    });
}

// Update time in for a specific day
function updateTimeIn(id, time) {
    const item = lineItems.find(i => i.id === id);
    if (item) {
        item.timeIn = time;
    }
    renderLineItems();
    updatePreview();
}

// Update time out for a specific day
function updateTimeOut(id, time) {
    const item = lineItems.find(i => i.id === id);
    if (item) {
        item.timeOut = time;
    }
    renderLineItems();
    updatePreview();
}

// Toggle day enabled/disabled (for holidays)
function toggleDay(id, enabled) {
    const item = lineItems.find(i => i.id === id);
    if (item) {
        item.enabled = enabled;
    }
    renderLineItems();
    updatePreview();
}

// Edit job description for a specific day - using modal
let editingDayId = null;

function editDayJob(id) {
    const item = lineItems.find(i => i.id === id);
    if (!item) return;

    editingDayId = id;
    const defaultJob = document.getElementById('jobDescription').value || 'Sound Operator';
    const currentJob = item.jobDescription || defaultJob;
    const dateStr = formatDateDisplay(item.date);

    document.getElementById('modalDate').textContent = dateStr;
    document.getElementById('modalJobInput').value = currentJob;
    document.getElementById('jobModal').style.display = 'flex';
    document.getElementById('modalJobInput').focus();
}

function closeJobModal() {
    document.getElementById('jobModal').style.display = 'none';
    editingDayId = null;
}

function saveJobModal() {
    if (editingDayId === null) return;

    const item = lineItems.find(i => i.id === editingDayId);
    if (!item) return;

    const defaultJob = document.getElementById('jobDescription').value || 'Sound Operator';
    const newJob = document.getElementById('modalJobInput').value.trim();
    item.jobDescription = newJob || defaultJob;

    closeJobModal();
    renderLineItems();
    updatePreview();
}

// Close modal on Escape key or clicking outside
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeJobModal();
        closeSavePdfModal();
    }
});

document.addEventListener('click', (e) => {
    if (e.target.id === 'jobModal') closeJobModal();
    if (e.target.id === 'savePdfModal') closeSavePdfModal();
});

// Load quotes list
async function loadQuotesList() {
    try {
        const response = await fetch('/api/quotes');
        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }
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
        // Select company in dropdown (handles companies that might not be in the list)
        const savedCompany = quote.client_company || '';
        if (savedCompany && !savedCompanies.find(c => c.name === savedCompany)) {
            // Add the company name as a temporary option if not in list
            const select = document.getElementById('clientCompany');
            const option = document.createElement('option');
            option.value = savedCompany;
            option.textContent = savedCompany;
            select.appendChild(option);
        }
        document.getElementById('clientCompany').value = savedCompany;
        document.getElementById('clientAddress').value = quote.client_address || 'PO Box 00000\nLocation - City\nUnited Arab Emirates';
        document.getElementById('poc').value = quote.poc || 'Contact Name';
        document.getElementById('pocPhone').value = quote.poc_phone || '+971 50 000 0000';
        document.getElementById('pocEmail').value = quote.poc_email || 'contact@company.com';
        document.getElementById('venue').value = quote.venue || 'Venue Name';
        document.getElementById('jobDescription').value = quote.job_description || 'Sound Operator';
        document.getElementById('hourlyRate').value = quote.hourly_rate || 200;
        document.getElementById('dateFrom').value = quote.date_from || '';
        document.getElementById('dateTo').value = quote.date_to || '';
        document.getElementById('taxRate').value = quote.tax_rate || 0;

        // Overtime settings
        document.getElementById('regularCallHours').value = quote.regular_call_hours || 8;
        document.getElementById('overtimePercentage').value = quote.overtime_percentage || 10;
        document.getElementById('perDiemEnabled').checked = quote.outside_dubai || false;
        document.getElementById('perDiemRate').value = quote.per_diem_rate || 150;

        // Billing type and rates
        const isDaily = quote.billing_type === 'daily';
        document.getElementById('billingType').checked = isDaily;
        document.getElementById('dailyRate').value = quote.daily_rate || 1600;
        document.getElementById('otHourlyRate').value = quote.ot_hourly_rate || 220;
        // Update UI visibility for billing type
        document.getElementById('hourlyRateGroup').style.display = isDaily ? 'none' : 'flex';
        document.getElementById('dailyRateGroup').style.display = isDaily ? 'flex' : 'none';
        document.getElementById('otPercentageGroup').style.display = isDaily ? 'none' : 'block';

        // Bank details (use quote values, fall back to user profile defaults)
        document.getElementById('bankAccountHolder').value = quote.bank_account_holder || (userProfile ? userProfile.bank_account_holder : '') || '';
        document.getElementById('bankName').value = quote.bank_name || (userProfile ? userProfile.bank_name : '') || '';
        document.getElementById('bankAccountNumber').value = quote.bank_account_number || (userProfile ? userProfile.bank_account_number : '') || '';
        document.getElementById('bankIban').value = quote.bank_iban || (userProfile ? userProfile.bank_iban : '') || '';

        // Load line items with time in/out
        hourlyRate = quote.hourly_rate || 200;
        lineItems = quote.line_items.map(item => ({
            id: new Date(item.date).getTime(),
            date: new Date(item.date),
            timeIn: item.time_in || '08:00',
            timeOut: item.time_out || '18:00',
            rate: item.rate || hourlyRate
        }));

        // Load equipment items
        const equipmentsEnabled = quote.equipments_enabled || false;
        document.getElementById('equipmentsEnabled').checked = equipmentsEnabled;
        document.getElementById('equipmentsEditor').style.display = equipmentsEnabled ? 'block' : 'none';
        document.getElementById('equipmentsPreview').style.display = equipmentsEnabled ? 'block' : 'none';

        // Load hide labor setting
        const hideLabor = quote.hide_labor || false;
        document.getElementById('hideLabor').checked = hideLabor;
        document.getElementById('laborSection').style.display = hideLabor ? 'none' : 'block';
        document.getElementById('laborPreview').style.display = hideLabor ? 'none' : 'block';

        // Load equipment headers
        if (quote.equipment_headers) {
            document.getElementById('eqHeader1').value = quote.equipment_headers.header1 || 'Work/Item Description';
            document.getElementById('eqHeader2').value = quote.equipment_headers.header2 || 'Qty/Days';
            document.getElementById('eqHeader3').value = quote.equipment_headers.header3 || 'Price';
        }

        // Load equipment items
        if (quote.equipment_items && quote.equipment_items.length > 0) {
            equipmentItems = quote.equipment_items.map((item, index) => ({
                id: Date.now() + index,
                description: item.description || '',
                qty: item.qty || '',
                price: item.price || 0,
                total: item.total || 0
            }));
            renderEquipmentRows();
            updateEquipmentsPreview();
        } else {
            equipmentItems = [];
            document.getElementById('equipmentRows').innerHTML = '';
        }

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
    document.getElementById('invoiceNumber').value = 'Auto';
    document.getElementById('poNumber').value = 'PO000000';
    document.getElementById('jobId').value = 'EVS 00-00000';
    document.getElementById('clientCompany').value = '';  // Reset to placeholder
    document.getElementById('clientAddress').value = 'PO Box 00000\nLocation - City\nUnited Arab Emirates';
    document.getElementById('poc').value = 'Contact Name';
    document.getElementById('pocPhone').value = '+971 50 000 0000';
    document.getElementById('pocEmail').value = 'contact@company.com';
    document.getElementById('venue').value = 'Venue Name';
    document.getElementById('dateFrom').value = today;
    document.getElementById('dateTo').value = today;
    document.getElementById('taxRate').value = '0';

    // Reset overtime settings
    document.getElementById('regularCallHours').value = '8';
    document.getElementById('overtimePercentage').value = '10';
    document.getElementById('perDiemEnabled').checked = false;
    document.getElementById('perDiemRate').value = 150;

    // Reset billing type to hourly (default)
    document.getElementById('billingType').checked = false;
    document.getElementById('dailyRate').value = '1600';
    document.getElementById('otHourlyRate').value = '220';
    document.getElementById('hourlyRateGroup').style.display = 'flex';
    document.getElementById('dailyRateGroup').style.display = 'none';
    document.getElementById('otPercentageGroup').style.display = 'block';

    // Reset to user profile defaults
    if (userProfile) {
        hourlyRate = userProfile.default_hourly_rate || 200;
        document.getElementById('hourlyRate').value = hourlyRate;
        document.getElementById('jobDescription').value = userProfile.default_job_description || 'Sound Operator';
        document.getElementById('bankAccountHolder').value = userProfile.bank_account_holder || '';
        document.getElementById('bankName').value = userProfile.bank_name || '';
        document.getElementById('bankAccountNumber').value = userProfile.bank_account_number || '';
        document.getElementById('bankIban').value = userProfile.bank_iban || '';
    } else {
        document.getElementById('hourlyRate').value = '200';
        document.getElementById('jobDescription').value = 'Sound Operator';
        document.getElementById('bankAccountHolder').value = '';
        document.getElementById('bankName').value = '';
        document.getElementById('bankAccountNumber').value = '';
        document.getElementById('bankIban').value = '';
    }

    lineItems = [];
    renderLineItems();

    // Reset equipment items
    equipmentItems = [];
    document.getElementById('equipmentsEnabled').checked = false;
    document.getElementById('equipmentsEditor').style.display = 'none';
    document.getElementById('equipmentsPreview').style.display = 'none';
    document.getElementById('eqHeader1').value = 'Work/Item Description';
    document.getElementById('eqHeader2').value = 'Qty/Days';
    document.getElementById('eqHeader3').value = 'Price';
    document.getElementById('equipmentRows').innerHTML = '';

    // Reset hide labor
    document.getElementById('hideLabor').checked = false;
    document.getElementById('laborSection').style.display = 'block';
    document.getElementById('laborPreview').style.display = 'block';

    updatePreview();
}

// Save quote
async function saveQuote() {
    // Validate company is selected
    if (!isCompanySelected()) {
        showSelectCompanyModal();
        return;
    }

    // Check for duplicate invoice number (only for new quotes)
    if (!currentQuoteId) {
        const invoiceNumber = document.getElementById('invoiceNumber').value;
        const existingQuote = findExistingQuoteByNumber(invoiceNumber);
        if (existingQuote) {
            showOverwriteModal(invoiceNumber, existingQuote.id, 'save');
            return;
        }
    }

    await performSaveQuote();
}

async function performSaveQuote() {
    const regularCallHours = parseInt(document.getElementById('regularCallHours').value) || 8;
    const overtimePercentage = parseInt(document.getElementById('overtimePercentage').value) || 10;
    const rate = parseFloat(document.getElementById('hourlyRate').value) || 200;
    const overtimeRate = rate * (1 + overtimePercentage / 100);
    const isDaily = document.getElementById('billingType').checked;
    const dailyRate = parseFloat(document.getElementById('dailyRate').value) || 1600;
    const otHourlyRate = parseFloat(document.getElementById('otHourlyRate').value) || 220;

    // Auto-generate invoice number for new quotes
    const companyName = document.getElementById('clientCompany').value;
    const invoiceDate = document.getElementById('invoiceDate').value;
    let invoiceNumber = document.getElementById('invoiceNumber').value;

    // Only auto-generate for new quotes (not updating existing ones)
    if (!currentQuoteId) {
        const nextSeq = await getNextSequenceForCompany(companyName);
        invoiceNumber = generateInvoiceNumber(companyName, invoiceDate, nextSeq);
        document.getElementById('invoiceNumber').value = invoiceNumber;
        updatePreview();
    }

    const quoteData = {
        doc_type: document.getElementById('docType').checked ? 'INVOICE' : 'QUOTE',
        date: invoiceDate,
        invoice_number: invoiceNumber,
        po_number: document.getElementById('poNumber').value,
        job_id: document.getElementById('jobId').value,
        client_company: document.getElementById('clientCompany').value,
        client_address: document.getElementById('clientAddress').value,
        poc: document.getElementById('poc').value,
        poc_phone: document.getElementById('pocPhone').value,
        poc_email: document.getElementById('pocEmail').value,
        venue: document.getElementById('venue').value,
        job_description: document.getElementById('jobDescription').value,
        hourly_rate: rate,
        date_from: document.getElementById('dateFrom').value,
        date_to: document.getElementById('dateTo').value,
        billing_type: isDaily ? 'daily' : 'hourly',
        daily_rate: dailyRate,
        ot_hourly_rate: otHourlyRate,
        regular_call_hours: regularCallHours,
        overtime_percentage: overtimePercentage,
        outside_dubai: document.getElementById('perDiemEnabled').checked,
        per_diem_rate: parseFloat(document.getElementById('perDiemRate').value) || 150,
        bank_account_holder: document.getElementById('bankAccountHolder').value,
        bank_name: document.getElementById('bankName').value,
        bank_account_number: document.getElementById('bankAccountNumber').value,
        bank_iban: document.getElementById('bankIban').value,
        tax_rate: parseFloat(document.getElementById('taxRate').value) || 0,
        subtotal: calculateSubtotal(),
        total: calculateTotal(),
        line_items: lineItems.map(item => {
            const calc = calculateLineItem(item);
            return {
                date: item.date.toISOString().split('T')[0],
                time_in: item.timeIn,
                time_out: item.timeOut,
                total_hours: calc.totalHours,
                regular_hours: calc.regularHours,
                overtime_hours: calc.overtimeHours,
                rate: calc.rate || rate,
                overtime_rate: calc.overtimeRate || overtimeRate,
                line_total: calc.lineTotal,
                daily_rate: calc.dailyRate || dailyRate,
                ot_hourly_rate: calc.otHourlyRate || otHourlyRate
            };
        }),
        // Equipment data
        equipments_enabled: document.getElementById('equipmentsEnabled').checked,
        hide_labor: document.getElementById('hideLabor').checked,
        equipment_headers: {
            header1: document.getElementById('eqHeader1').value || 'Work/Item Description',
            header2: document.getElementById('eqHeader2').value || 'Qty/Days',
            header3: document.getElementById('eqHeader3').value || 'Price'
        },
        equipment_items: equipmentItems.map(item => ({
            description: item.description,
            qty: item.qty,
            price: item.price,
            total: item.total
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
        } else {
            const errorData = await response.json();
            alert(errorData.error || 'Error saving quote');
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
    const hideLabor = document.getElementById('hideLabor')?.checked || false;
    let subtotal = 0;

    // Only include labor costs if not hidden
    if (!hideLabor) {
        // Only count enabled days
        const enabledItems = lineItems.filter(item => item.enabled !== false);

        subtotal = enabledItems.reduce((sum, item) => {
            const calc = calculateLineItem(item);
            return sum + calc.lineTotal;
        }, 0);

        // Add per diem (only for enabled days)
        const perDiemEnabled = document.getElementById('perDiemEnabled').checked;
        if (perDiemEnabled) {
            const perDiemRate = parseFloat(document.getElementById('perDiemRate').value) || 150;
            subtotal += enabledItems.length * perDiemRate;
        }
    }

    // Add equipment total if enabled
    const equipmentsEnabled = document.getElementById('equipmentsEnabled').checked;
    if (equipmentsEnabled) {
        subtotal += calculateEquipmentTotal();
    }

    // Add additional expenses if enabled
    const additionalExpenseEnabled = document.getElementById('additionalExpenseEnabled')?.checked || false;
    if (additionalExpenseEnabled) {
        const additionalExpense = parseFloat(document.getElementById('additionalExpenseAmount').value) || 0;
        subtotal += additionalExpense;
    }

    return subtotal;
}

function calculateTotal() {
    const subtotal = calculateSubtotal();
    const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;
    return subtotal + (subtotal * taxRate / 100);
}

// Calculate labor-only total (line items + per diem, excluding equipment)
function calculateLaborTotal() {
    // Only count enabled days
    const enabledItems = lineItems.filter(item => item.enabled !== false);

    let laborTotal = enabledItems.reduce((sum, item) => {
        const calc = calculateLineItem(item);
        return sum + calc.lineTotal;
    }, 0);

    // Add per diem (only for enabled days)
    const perDiemEnabled = document.getElementById('perDiemEnabled').checked;
    if (perDiemEnabled) {
        const perDiemRate = parseFloat(document.getElementById('perDiemRate').value) || 150;
        laborTotal += enabledItems.length * perDiemRate;
    }

    return laborTotal;
}

// Update labor total display (shown when equipment is also enabled)
function updateLaborTotalDisplay() {
    const equipmentsEnabled = document.getElementById('equipmentsEnabled').checked;
    const hideLabor = document.getElementById('hideLabor')?.checked || false;
    const laborTotalRow = document.getElementById('laborTotalRow');

    // Show labor total only when equipment is enabled AND labor is not hidden
    if (laborTotalRow) {
        if (equipmentsEnabled && !hideLabor) {
            laborTotalRow.style.display = 'flex';
            const laborTotal = calculateLaborTotal();
            document.getElementById('laborTotalDisplay').textContent = formatCurrency(laborTotal);
        } else {
            laborTotalRow.style.display = 'none';
        }
    }
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

    return `${dayName}, ${dayNum} ${month}`;
}

function formatNumber(num) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatCurrency(amount) {
    return 'AED ' + formatNumber(amount);
}

// Update invoice number preview (shows full format like -ACME-DEC-2025)
function updateInvoicePreview() {
    const previewEl = document.getElementById('invoiceNumberPreview');
    if (!previewEl) return;

    // Get company code (first 4 letters, uppercase)
    const companySelect = document.getElementById('clientCompany');
    const company = companySelect ? companySelect.options[companySelect.selectedIndex]?.text : '';
    const companyCode = company && company !== '-- Select Company --'
        ? company.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase()
        : 'NONE';

    // Get month and year from date
    const dateInput = document.getElementById('invoiceDate');
    let suffix = `-${companyCode}`;

    if (dateInput && dateInput.value) {
        const date = new Date(dateInput.value);
        const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        const year = date.getFullYear();
        suffix = `-${companyCode}-${month}-${year}`;
    }

    previewEl.textContent = suffix;
}

// Update preview
function updatePreview() {
    // Update document type
    const isInvoice = document.getElementById('docType').checked;
    const label = isInvoice ? 'INVOICE' : 'QUOTE';
    document.getElementById('docTypeLabel').textContent = label;
    document.getElementById('docNumberLabel').textContent = label + '#:';

    // Show/hide PO # based on document type (only show for INVOICE)
    document.getElementById('poRow').style.display = isInvoice ? 'block' : 'none';

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

    // Update POC info
    document.getElementById('displayPOC').textContent = document.getElementById('poc').value || 'Contact Name';
    document.getElementById('displayPOCPhone').textContent = document.getElementById('pocPhone').value || '+971 50 000 0000';
    document.getElementById('displayPOCEmail').textContent = document.getElementById('pocEmail').value || 'contact@company.com';
    document.getElementById('displayVenue').textContent = document.getElementById('venue').value || 'Venue Name';

    // Update bank details (use input values, fall back to user profile defaults, or "Set in Profile")
    const bankHolder = document.getElementById('bankAccountHolder').value || (userProfile ? userProfile.bank_account_holder : '') || 'Set in Profile';
    document.getElementById('displayPayableTo').textContent = bankHolder.toUpperCase();
    document.getElementById('displayBankHolder').textContent = bankHolder;
    document.getElementById('displayBankName').textContent = document.getElementById('bankName').value || (userProfile ? userProfile.bank_name : '') || 'Set in Profile';
    document.getElementById('displayAccountNumber').textContent = document.getElementById('bankAccountNumber').value || (userProfile ? userProfile.bank_account_number : '') || 'Set in Profile';
    document.getElementById('displayIban').textContent = document.getElementById('bankIban').value || (userProfile ? userProfile.bank_iban : '') || 'Set in Profile';

    // Update TOS with dynamic values
    const regularCallHours = document.getElementById('regularCallHours').value || '8';
    const overtimePercentage = document.getElementById('overtimePercentage').value || '10';
    document.getElementById('tosCallTime').textContent = regularCallHours;
    const tosOtRateEl = document.getElementById('tosOtRate');
    if (tosOtRateEl) tosOtRateEl.textContent = overtimePercentage;

    // Update items table with time in/out columns (only enabled days)
    const tbody = document.getElementById('itemsTableBody');
    tbody.innerHTML = '';

    const defaultJob = document.getElementById('jobDescription').value || 'Sound Operator';
    const enabledItems = lineItems.filter(item => item.enabled !== false);
    enabledItems.forEach(item => {
        const calc = calculateLineItem(item);
        const jobDesc = item.jobDescription || defaultJob;
        const row = `
            <tr>
                <td>${formatDateDisplay(item.date)}</td>
                <td>${jobDesc}</td>
                <td>${item.timeIn}</td>
                <td>${item.timeOut}</td>
                <td>${calc.totalHours.toFixed(1)}</td>
                <td>${calc.regularHours.toFixed(1)}</td>
                <td>${calc.overtimeHours.toFixed(1)}</td>
                <td>${formatCurrency(calc.lineTotal)}</td>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    // Handle per diem row (only count enabled days)
    const perDiemEnabled = document.getElementById('perDiemEnabled').checked;
    const perDiemRate = parseFloat(document.getElementById('perDiemRate').value) || 150;
    const perDiemRow = document.getElementById('perDiemRow');

    // Update per diem rate displays
    const perDiemRateDisplay = document.getElementById('perDiemRateDisplay');
    if (perDiemRateDisplay) perDiemRateDisplay.textContent = perDiemRate;
    const tosPerDiemRate = document.getElementById('tosPerDiemRate');
    if (tosPerDiemRate) tosPerDiemRate.textContent = perDiemRate;

    if (perDiemEnabled && enabledItems.length > 0) {
        const perDiemTotal = enabledItems.length * perDiemRate;
        document.getElementById('perDiemDays').textContent = enabledItems.length;
        document.getElementById('perDiemTotal').textContent = formatCurrency(perDiemTotal);
        perDiemRow.style.display = 'flex';
    } else {
        perDiemRow.style.display = 'none';
    }

    // Handle additional expense row
    const additionalExpenseEnabled = document.getElementById('additionalExpenseEnabled')?.checked || false;
    const additionalExpenseRow = document.getElementById('additionalExpenseRow');
    if (additionalExpenseEnabled) {
        const additionalExpense = parseFloat(document.getElementById('additionalExpenseAmount').value) || 0;
        document.getElementById('additionalExpenseDisplay').textContent = formatCurrency(additionalExpense);
        additionalExpenseRow.style.display = 'flex';
    } else {
        additionalExpenseRow.style.display = 'none';
    }

    // Update totals
    const subtotal = calculateSubtotal();
    const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;
    const total = calculateTotal();

    document.getElementById('displaySubtotal').textContent = formatCurrency(subtotal);
    document.getElementById('displayTax').textContent = taxRate + '%';
    document.getElementById('displayTotal').textContent = formatCurrency(total);

    // Update editor total
    document.getElementById('editorTotal').textContent = formatCurrency(total);

    // Update labor total display (when equipment is also enabled)
    updateLaborTotalDisplay();
}

// Download PDF - server-side generation using WeasyPrint
async function downloadPDF() {
    // Validate company is selected
    if (!isCompanySelected()) {
        showSelectCompanyModal();
        return;
    }

    const quoteId = document.getElementById('savedQuotes').value;

    if (!quoteId) {
        // Check for duplicate invoice number before showing save modal
        const invoiceNumber = document.getElementById('invoiceNumber').value;
        const existingQuote = findExistingQuoteByNumber(invoiceNumber);
        if (existingQuote) {
            showOverwriteModal(invoiceNumber, existingQuote.id, 'pdf');
            return;
        }
        // Unsaved quote - show modal asking to save first
        document.getElementById('savePdfModal').style.display = 'flex';
        return;
    }

    // Existing saved quote - generate PDF directly (include background and dark mode)
    window.location.href = `/api/quotes/${quoteId}/pdf?bg=${selectedBackground}&isDark=${isDarkBackground}`;
}

// Close save PDF modal
function closeSavePdfModal() {
    document.getElementById('savePdfModal').style.display = 'none';
}

// Check if company is selected
function isCompanySelected() {
    const company = document.getElementById('clientCompany').value;
    return company && company.trim() !== '';
}

// Show select company modal
function showSelectCompanyModal() {
    document.getElementById('selectCompanyModal').style.display = 'flex';
}

// Close select company modal
function closeSelectCompanyModal() {
    document.getElementById('selectCompanyModal').style.display = 'none';
    // Focus on the company dropdown to help the user
    document.getElementById('clientCompany').focus();
}

// Save and then download PDF (called from modal)
async function saveAndDownloadPDF() {
    closeSavePdfModal();
    await saveQuoteForPDF();
}

// Save quote and trigger PDF download (helper for downloadPDF)
async function saveQuoteForPDF() {
    // Validate company is selected
    if (!isCompanySelected()) {
        showSelectCompanyModal();
        return;
    }

    const regularCallHours = parseInt(document.getElementById('regularCallHours').value) || 8;
    const overtimePercentage = parseInt(document.getElementById('overtimePercentage').value) || 10;
    const rate = parseFloat(document.getElementById('hourlyRate').value) || 200;
    const overtimeRate = rate * (1 + overtimePercentage / 100);
    const isDaily = document.getElementById('billingType').checked;
    const dailyRate = parseFloat(document.getElementById('dailyRate').value) || 1600;
    const otHourlyRate = parseFloat(document.getElementById('otHourlyRate').value) || 220;

    // Auto-generate invoice number for new quotes
    const companyName = document.getElementById('clientCompany').value;
    const invoiceDate = document.getElementById('invoiceDate').value;
    let invoiceNumber = document.getElementById('invoiceNumber').value;

    // Always generate for saveQuoteForPDF (this is called for unsaved quotes)
    const nextSeq = await getNextSequenceForCompany(companyName);
    invoiceNumber = generateInvoiceNumber(companyName, invoiceDate, nextSeq);
    document.getElementById('invoiceNumber').value = invoiceNumber;
    updatePreview();

    const quoteData = {
        doc_type: document.getElementById('docType').checked ? 'INVOICE' : 'QUOTE',
        date: invoiceDate,
        invoice_number: invoiceNumber,
        po_number: document.getElementById('poNumber').value,
        job_id: document.getElementById('jobId').value,
        client_company: document.getElementById('clientCompany').value,
        client_address: document.getElementById('clientAddress').value,
        poc: document.getElementById('poc').value,
        poc_phone: document.getElementById('pocPhone').value,
        poc_email: document.getElementById('pocEmail').value,
        venue: document.getElementById('venue').value,
        job_description: document.getElementById('jobDescription').value,
        hourly_rate: rate,
        date_from: document.getElementById('dateFrom').value,
        date_to: document.getElementById('dateTo').value,
        billing_type: isDaily ? 'daily' : 'hourly',
        daily_rate: dailyRate,
        ot_hourly_rate: otHourlyRate,
        regular_call_hours: regularCallHours,
        overtime_percentage: overtimePercentage,
        outside_dubai: document.getElementById('perDiemEnabled').checked,
        per_diem_rate: parseFloat(document.getElementById('perDiemRate').value) || 150,
        bank_account_holder: document.getElementById('bankAccountHolder').value,
        bank_name: document.getElementById('bankName').value,
        bank_account_number: document.getElementById('bankAccountNumber').value,
        bank_iban: document.getElementById('bankIban').value,
        tax_rate: parseFloat(document.getElementById('taxRate').value) || 0,
        subtotal: calculateSubtotal(),
        total: calculateTotal(),
        line_items: lineItems.filter(item => item.enabled !== false).map(item => {
            const calc = calculateLineItem(item);
            return {
                date: item.date.toISOString().split('T')[0],
                time_in: item.timeIn,
                time_out: item.timeOut,
                total_hours: calc.totalHours,
                regular_hours: calc.regularHours,
                overtime_hours: calc.overtimeHours,
                rate: calc.rate || rate,
                overtime_rate: calc.overtimeRate || overtimeRate,
                line_total: calc.lineTotal,
                job_description: item.jobDescription,
                daily_rate: calc.dailyRate || dailyRate,
                ot_hourly_rate: calc.otHourlyRate || otHourlyRate
            };
        }),
        // Equipment data
        equipments_enabled: document.getElementById('equipmentsEnabled').checked,
        hide_labor: document.getElementById('hideLabor').checked,
        equipment_headers: {
            header1: document.getElementById('eqHeader1').value || 'Work/Item Description',
            header2: document.getElementById('eqHeader2').value || 'Qty/Days',
            header3: document.getElementById('eqHeader3').value || 'Price'
        },
        equipment_items: equipmentItems.map(item => ({
            description: item.description,
            qty: item.qty,
            price: item.price,
            total: item.total
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

            // Now generate PDF (include background and dark mode)
            window.location.href = `/api/quotes/${currentQuoteId}/pdf?bg=${selectedBackground}&isDark=${isDarkBackground}`;
        } else {
            alert('Error saving quote. Please try again.');
        }
    } catch (error) {
        console.error('Error saving quote:', error);
        alert('Error saving quote');
    }
}

// ============================================
// EQUIPMENTS SECTION
// ============================================

// Toggle equipments section visibility
function toggleEquipments() {
    const enabled = document.getElementById('equipmentsEnabled').checked;
    const editor = document.getElementById('equipmentsEditor');
    const preview = document.getElementById('equipmentsPreview');

    editor.style.display = enabled ? 'block' : 'none';
    preview.style.display = enabled ? 'block' : 'none';

    // Add first row if empty and enabled
    if (enabled && equipmentItems.length === 0) {
        addEquipmentRow();
    }

    updatePreview();
}

// Toggle hide labor section (for equipment-only quotes)
function toggleHideLabor() {
    const hideLabor = document.getElementById('hideLabor').checked;
    const laborSection = document.getElementById('laborSection');
    const laborPreview = document.getElementById('laborPreview');

    laborSection.style.display = hideLabor ? 'none' : 'block';
    laborPreview.style.display = hideLabor ? 'none' : 'block';

    updatePreview();
}

// Toggle additional expense input
function toggleAdditionalExpense() {
    const enabled = document.getElementById('additionalExpenseEnabled').checked;
    const editor = document.getElementById('additionalExpenseEditor');
    const expenseRow = document.getElementById('additionalExpenseRow');

    editor.style.display = enabled ? 'block' : 'none';
    expenseRow.style.display = enabled ? 'flex' : 'none';

    if (!enabled) {
        document.getElementById('additionalExpenseAmount').value = 0;
    }

    updatePreview();
}

// Add a new equipment row
function addEquipmentRow() {
    const newItem = {
        id: Date.now(),
        description: '',
        qty: '',
        price: 0,
        total: 0
    };
    equipmentItems.push(newItem);
    renderEquipmentRows();
    updateEquipmentsPreview();
}

// Remove an equipment row
function removeEquipmentRow(id) {
    equipmentItems = equipmentItems.filter(item => item.id !== id);
    if (equipmentItems.length === 0) {
        // Add back an empty row
        addEquipmentRow();
    } else {
        renderEquipmentRows();
        updateEquipmentsPreview();
    }
}

// Update equipment row data
function updateEquipmentRow(id, field, value) {
    const item = equipmentItems.find(item => item.id === id);
    if (item) {
        item[field] = value;

        // Recalculate total for this row
        // Parse qty - extract numeric value (e.g., "260m" -> 260, "set" -> 1)
        let qtyNum = parseFloat(item.qty) || 0;
        if (item.qty && isNaN(parseFloat(item.qty))) {
            // If qty is non-numeric like "set", treat as 1
            qtyNum = 1;
        }

        const price = parseFloat(item.price) || 0;
        item.total = qtyNum * price;

        renderEquipmentRows();
        updateEquipmentsPreview();
    }
}

// Render all equipment rows in editor
function renderEquipmentRows() {
    const container = document.getElementById('equipmentRows');
    container.innerHTML = '';

    equipmentItems.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'equipment-row';
        row.innerHTML = `
            <span class="eq-col eq-sl">${index + 1}</span>
            <input type="text" class="eq-col eq-desc" placeholder="Item description"
                   value="${item.description}"
                   onchange="updateEquipmentRow(${item.id}, 'description', this.value)">
            <input type="text" class="eq-col eq-qty" placeholder="e.g., 260m, 4, set"
                   value="${item.qty}"
                   onchange="updateEquipmentRow(${item.id}, 'qty', this.value)">
            <input type="number" class="eq-col eq-price" placeholder="0"
                   value="${item.price || ''}"
                   onchange="updateEquipmentRow(${item.id}, 'price', this.value)">
            <span class="eq-col eq-total">${item.total.toFixed(0)}</span>
            <button class="eq-col eq-actions eq-remove-btn" onclick="removeEquipmentRow(${item.id})" title="Remove">×</button>
        `;
        container.appendChild(row);
    });
}

// Calculate total of all equipment items
function calculateEquipmentTotal() {
    return equipmentItems.reduce((sum, item) => sum + (item.total || 0), 0);
}

// Update equipments preview table
function updateEquipmentsPreview() {
    const tbody = document.getElementById('equipmentsTableBody');
    const preview = document.getElementById('equipmentsPreview');
    const enabled = document.getElementById('equipmentsEnabled').checked;

    if (!enabled || equipmentItems.length === 0) {
        preview.style.display = 'none';
        return;
    }

    preview.style.display = 'block';

    // Update headers
    document.getElementById('eqPreviewHeader1').textContent = document.getElementById('eqHeader1').value || 'Work/Item Description';
    document.getElementById('eqPreviewHeader2').textContent = document.getElementById('eqHeader2').value || 'Qty/Days';
    document.getElementById('eqPreviewHeader3').textContent = document.getElementById('eqHeader3').value || 'Price';

    // Render rows
    tbody.innerHTML = '';
    equipmentItems.forEach((item, index) => {
        if (item.description || item.qty || item.price) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${item.description || ''}</td>
                <td>${item.qty || ''}</td>
                <td>${item.price ? item.price.toLocaleString() : ''}</td>
                <td>${item.total.toLocaleString()}</td>
            `;
            tbody.appendChild(row);
        }
    });

    // Update equipment total
    const total = calculateEquipmentTotal();
    document.getElementById('equipmentsTotalDisplay').textContent = formatCurrency(total);
}
