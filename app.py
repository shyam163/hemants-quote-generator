from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory, Response
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from functools import wraps
from datetime import datetime, date, timedelta
import secrets
import os
import json
from weasyprint import HTML

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///quotes.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = '2f0444c3f8e80c3e0cfe53307281c153da0dfc6c99735a59f30af94a2bdc1cee'  # For sessions

# Upload configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads', 'profilepics')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB max file size

# Create upload folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

db = SQLAlchemy(app)

# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Admin required decorator
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function

# Database Models

class User(db.Model, UserMixin):
    """User model for authentication and profile"""
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)  # Login name
    email = db.Column(db.String(120))  # Contact email (separate from login)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(10), default='user')  # 'user' or 'admin'
    is_active = db.Column(db.Boolean, default=True)
    must_change_password = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Business/Profile info (for invoice header)
    business_name = db.Column(db.String(200))
    full_name = db.Column(db.String(200))
    address = db.Column(db.Text)
    phone = db.Column(db.String(50))

    # Default settings
    default_hourly_rate = db.Column(db.Float, default=200)
    default_job_description = db.Column(db.String(300), default='Sound Operator')

    # Bank details (defaults for new quotes)
    bank_account_holder = db.Column(db.String(200))
    bank_name = db.Column(db.String(200))
    bank_account_number = db.Column(db.String(50))
    bank_iban = db.Column(db.String(50))

    # Profile picture (path to uploaded file)
    profilepic = db.Column(db.String(500))

    quotes = db.relationship('Quote', backref='owner', lazy=True)

    def get_id(self):
        return str(self.id)

    @property
    def is_profile_complete(self):
        """Check if user has completed their profile setup"""
        # Required fields for profile to be considered complete
        required_fields = [
            self.business_name,
            self.full_name,
            self.address,
            self.phone
        ]
        return all(field and field.strip() for field in required_fields)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'is_active': self.is_active,
            'business_name': self.business_name,
            'full_name': self.full_name,
            'address': self.address,
            'phone': self.phone,
            'default_hourly_rate': self.default_hourly_rate,
            'default_job_description': self.default_job_description,
            'bank_account_holder': self.bank_account_holder,
            'bank_name': self.bank_name,
            'bank_account_number': self.bank_account_number,
            'bank_iban': self.bank_iban,
            'profilepic': self.profilepic,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def to_admin_dict(self):
        """For admin user list - includes quote count"""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'is_active': self.is_active,
            'business_name': self.business_name,
            'quote_count': len(self.quotes),
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Settings(db.Model):
    """Global settings (kept for future use)"""
    id = db.Column(db.Integer, primary_key=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ClientCompany(db.Model):
    """Saved client companies per user with contact details"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    address = db.Column(db.Text)
    poc = db.Column(db.String(200))  # Point of contact name
    poc_phone = db.Column(db.String(50))
    poc_email = db.Column(db.String(200))
    venue = db.Column(db.String(300))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('client_companies', lazy=True))

class Quote(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    doc_type = db.Column(db.String(10), default='QUOTE')
    date = db.Column(db.Date, nullable=False)
    invoice_number = db.Column(db.String(50))
    po_number = db.Column(db.String(50))
    job_id = db.Column(db.String(100))
    client_company = db.Column(db.String(200))
    client_address = db.Column(db.Text)
    poc = db.Column(db.String(100))
    poc_phone = db.Column(db.String(50))
    poc_email = db.Column(db.String(100))
    job_company = db.Column(db.String(200))
    venue = db.Column(db.String(200))

    # New fields for hourly system
    job_description = db.Column(db.String(300), default='Sound Operator')
    hourly_rate = db.Column(db.Float, default=200)
    date_from = db.Column(db.Date)
    date_to = db.Column(db.Date)

    # Billing type and rates
    billing_type = db.Column(db.String(10), default='hourly')  # 'hourly' or 'daily'
    daily_rate = db.Column(db.Float, default=1600)
    ot_hourly_rate = db.Column(db.Float, default=220)

    # Overtime and per diem settings
    regular_call_hours = db.Column(db.Integer, default=8)
    overtime_percentage = db.Column(db.Integer, default=10)
    outside_dubai = db.Column(db.Boolean, default=False)
    per_diem_rate = db.Column(db.Float, default=150)

    # Equipment items (stored as JSON)
    equipments_enabled = db.Column(db.Boolean, default=False)
    hide_labor = db.Column(db.Boolean, default=False)  # Hide labor section for equipment-only quotes
    equipment_headers = db.Column(db.Text)  # JSON string
    equipment_items = db.Column(db.Text)  # JSON string

    # Editable bank details (per quote)
    bank_account_holder = db.Column(db.String(200))
    bank_name = db.Column(db.String(200))
    bank_account_number = db.Column(db.String(50))
    bank_iban = db.Column(db.String(50))

    tax_rate = db.Column(db.Float, default=0)
    subtotal = db.Column(db.Float, default=0)
    total = db.Column(db.Float, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = db.Column(db.DateTime, nullable=True)  # Soft delete - when moved to recycle bin
    line_items = db.relationship('LineItem', backref='quote', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'doc_type': self.doc_type,
            'date': self.date.isoformat() if self.date else None,
            'invoice_number': self.invoice_number,
            'po_number': self.po_number,
            'job_id': self.job_id,
            'client_company': self.client_company,
            'client_address': self.client_address,
            'poc': self.poc,
            'poc_phone': self.poc_phone,
            'poc_email': self.poc_email,
            'job_company': self.job_company,
            'venue': self.venue,
            'job_description': self.job_description,
            'hourly_rate': self.hourly_rate,
            'date_from': self.date_from.isoformat() if self.date_from else None,
            'date_to': self.date_to.isoformat() if self.date_to else None,
            'regular_call_hours': self.regular_call_hours,
            'overtime_percentage': self.overtime_percentage,
            'outside_dubai': self.outside_dubai,
            'per_diem_rate': self.per_diem_rate,
            'billing_type': self.billing_type,
            'daily_rate': self.daily_rate,
            'ot_hourly_rate': self.ot_hourly_rate,
            'bank_account_holder': self.bank_account_holder,
            'bank_name': self.bank_name,
            'bank_account_number': self.bank_account_number,
            'bank_iban': self.bank_iban,
            'tax_rate': self.tax_rate,
            'subtotal': self.subtotal,
            'total': self.total,
            'equipments_enabled': self.equipments_enabled,
            'hide_labor': self.hide_labor,
            'equipment_headers': json.loads(self.equipment_headers) if self.equipment_headers else None,
            'equipment_items': json.loads(self.equipment_items) if self.equipment_items else [],
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'line_items': [item.to_dict() for item in self.line_items]
        }

class LineItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.Integer, db.ForeignKey('quote.id'), nullable=False)
    date = db.Column(db.Date)
    time_in = db.Column(db.String(5))
    time_out = db.Column(db.String(5))
    total_hours = db.Column(db.Float, default=0)
    regular_hours = db.Column(db.Float, default=0)
    overtime_hours = db.Column(db.Float, default=0)
    rate = db.Column(db.Float, nullable=False)
    overtime_rate = db.Column(db.Float)
    line_total = db.Column(db.Float)
    job_description = db.Column(db.String(300))  # Per-day job description
    daily_rate = db.Column(db.Float)  # For daily billing mode
    ot_hourly_rate = db.Column(db.Float)  # OT rate for daily billing mode

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date.isoformat() if self.date else None,
            'time_in': self.time_in,
            'time_out': self.time_out,
            'total_hours': self.total_hours,
            'regular_hours': self.regular_hours,
            'overtime_hours': self.overtime_hours,
            'rate': self.rate,
            'overtime_rate': self.overtime_rate,
            'line_total': self.line_total,
            'job_description': self.job_description,
            'daily_rate': self.daily_rate,
            'ot_hourly_rate': self.ot_hourly_rate
        }

# Initialize database
def init_db():
    with app.app_context():
        db.create_all()
        # Create default admin if no users exist
        if User.query.count() == 0:
            admin = User(
                username='admin',
                email='admin@hemant.local',
                password_hash=generate_password_hash('changeme'),
                role='admin',
                must_change_password=True,
                business_name='Admin',
                full_name='Administrator',
                default_hourly_rate=200,
                default_job_description='Sound Operator'
            )
            db.session.add(admin)
            db.session.commit()
            print("=" * 50)
            print("Default admin created:")
            print("  Username: admin")
            print("  Password: changeme")
            print("  (You will be required to change this on first login)")
            print("=" * 50)

# Authentication Routes

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        if current_user.must_change_password:
            return redirect(url_for('change_password'))
        return redirect(url_for('index'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip().lower()
        password = request.form.get('password', '')

        user = User.query.filter_by(username=username).first()

        if user and check_password_hash(user.password_hash, password):
            if not user.is_active:
                return render_template('login.html', error='Account is disabled. Contact admin.')
            login_user(user)
            if user.must_change_password:
                return redirect(url_for('change_password'))
            if not user.is_profile_complete:
                return redirect(url_for('profile', setup=1))
            return redirect(url_for('index'))
        return render_template('login.html', error='Invalid username or password')

    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/change-password', methods=['GET', 'POST'])
@login_required
def change_password():
    if request.method == 'POST':
        new_password = request.form.get('new_password', '')
        confirm_password = request.form.get('confirm_password', '')

        if len(new_password) < 8:
            return render_template('change_password.html', error='Password must be at least 8 characters')
        if new_password != confirm_password:
            return render_template('change_password.html', error='Passwords do not match')

        current_user.password_hash = generate_password_hash(new_password)
        current_user.must_change_password = False
        db.session.commit()
        return redirect(url_for('index'))

    return render_template('change_password.html')

# Main Routes

@app.route('/')
@login_required
def index():
    if current_user.must_change_password:
        return redirect(url_for('change_password'))
    if not current_user.is_profile_complete:
        return redirect(url_for('profile', setup=1))
    return render_template('index.html')

@app.route('/profile')
@login_required
def profile():
    if current_user.must_change_password:
        return redirect(url_for('change_password'))
    return render_template('profile.html')

@app.route('/admin')
@login_required
@admin_required
def admin_dashboard():
    if current_user.must_change_password:
        return redirect(url_for('change_password'))
    return render_template('admin.html')

@app.route('/history')
@login_required
def history():
    if current_user.must_change_password:
        return redirect(url_for('change_password'))
    if not current_user.is_profile_complete:
        return redirect(url_for('profile', setup=1))
    return render_template('history.html')

# Profile API

@app.route('/api/profile', methods=['GET'])
@login_required
def get_profile():
    return jsonify(current_user.to_dict())

@app.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    data = request.json

    # Update profile fields
    if 'email' in data:
        current_user.email = data['email']
    if 'business_name' in data:
        current_user.business_name = data['business_name']
    if 'full_name' in data:
        current_user.full_name = data['full_name']
    if 'address' in data:
        current_user.address = data['address']
    if 'phone' in data:
        current_user.phone = data['phone']
    if 'default_hourly_rate' in data:
        current_user.default_hourly_rate = data['default_hourly_rate']
    if 'default_job_description' in data:
        current_user.default_job_description = data['default_job_description']
    if 'bank_account_holder' in data:
        current_user.bank_account_holder = data['bank_account_holder']
    if 'bank_name' in data:
        current_user.bank_name = data['bank_name']
    if 'bank_account_number' in data:
        current_user.bank_account_number = data['bank_account_number']
    if 'bank_iban' in data:
        current_user.bank_iban = data['bank_iban']

    db.session.commit()
    return jsonify(current_user.to_dict())

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/profile/picture', methods=['POST'])
@login_required
def upload_profile_picture():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if file and allowed_file(file.filename):
        # Create unique filename with user id
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f"user_{current_user.id}_{secrets.token_hex(8)}.{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        # Delete old profile pic if exists
        if current_user.profilepic:
            old_path = os.path.join(app.config['UPLOAD_FOLDER'], os.path.basename(current_user.profilepic))
            if os.path.exists(old_path):
                os.remove(old_path)

        # Save new file
        file.save(filepath)

        # Update user record with relative path
        current_user.profilepic = f"/uploads/profilepics/{filename}"
        db.session.commit()

        return jsonify({
            'success': True,
            'profilepic': current_user.profilepic
        })

    return jsonify({'error': 'Invalid file type. Allowed: png, jpg, jpeg, gif'}), 400

@app.route('/uploads/profilepics/<filename>')
def serve_profile_pic(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/profile/password', methods=['PUT'])
@login_required
def change_password_api():
    data = request.json
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')

    if not check_password_hash(current_user.password_hash, current_password):
        return jsonify({'error': 'Current password is incorrect'}), 400

    if len(new_password) < 8:
        return jsonify({'error': 'New password must be at least 8 characters'}), 400

    current_user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({'success': True})

# Admin API

@app.route('/api/admin/users', methods=['GET'])
@login_required
@admin_required
def get_all_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify([u.to_admin_dict() for u in users])

@app.route('/api/admin/users', methods=['POST'])
@login_required
@admin_required
def create_user():
    data = request.json
    username = data.get('username', '').strip().lower()
    email = data.get('email', '').strip() if data.get('email') else None

    if not username:
        return jsonify({'error': 'Username is required'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400

    # Generate a random temporary password
    temp_password = secrets.token_urlsafe(12)

    user = User(
        username=username,
        email=email,
        password_hash=generate_password_hash(temp_password),
        role=data.get('role', 'user'),
        must_change_password=True,
        business_name=data.get('business_name', ''),
        full_name=data.get('full_name', ''),
        default_hourly_rate=200,
        default_job_description='Sound Operator'
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({
        'user': user.to_admin_dict(),
        'temp_password': temp_password  # Show this to admin to share with user
    }), 201

@app.route('/api/admin/users/<int:user_id>/role', methods=['PUT'])
@login_required
@admin_required
def update_user_role(user_id):
    if user_id == current_user.id:
        return jsonify({'error': 'Cannot change your own role'}), 400

    user = User.query.get_or_404(user_id)
    data = request.json

    if data.get('role') in ['user', 'admin']:
        user.role = data['role']
        db.session.commit()

    return jsonify(user.to_admin_dict())

@app.route('/api/admin/users/<int:user_id>/status', methods=['PUT'])
@login_required
@admin_required
def toggle_user_status(user_id):
    if user_id == current_user.id:
        return jsonify({'error': 'Cannot disable your own account'}), 400

    user = User.query.get_or_404(user_id)
    user.is_active = not user.is_active
    db.session.commit()

    return jsonify(user.to_admin_dict())

@app.route('/api/admin/users/<int:user_id>/reset-password', methods=['POST'])
@login_required
@admin_required
def reset_user_password(user_id):
    user = User.query.get_or_404(user_id)

    # Generate new temporary password
    temp_password = secrets.token_urlsafe(12)
    user.password_hash = generate_password_hash(temp_password)
    user.must_change_password = True
    db.session.commit()

    return jsonify({
        'success': True,
        'temp_password': temp_password
    })

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_user(user_id):
    # Prevent self-deletion
    if user_id == current_user.id:
        return jsonify({'error': 'Cannot delete your own account'}), 400

    user = User.query.get_or_404(user_id)

    # Delete all quotes belonging to this user
    Quote.query.filter_by(user_id=user_id).delete()

    # Delete the user
    db.session.delete(user)
    db.session.commit()

    return jsonify({'success': True})

# Quote API endpoints (with user isolation)

@app.route('/api/quotes', methods=['GET'])
@login_required
def get_quotes():
    # Start with base query
    query = Quote.query.filter_by(user_id=current_user.id)

    # Check if we want trashed items or active items
    show_trash = request.args.get('trash', 'false').lower() == 'true'
    if show_trash:
        query = query.filter(Quote.deleted_at.isnot(None))
    else:
        query = query.filter(Quote.deleted_at.is_(None))

    # Apply filters from query parameters
    company = request.args.get('company')
    if company:
        query = query.filter(Quote.client_company == company)

    doc_type = request.args.get('doc_type')
    if doc_type and doc_type in ['QUOTE', 'INVOICE']:
        query = query.filter(Quote.doc_type == doc_type)

    date_from = request.args.get('date_from')
    if date_from:
        try:
            from_date = datetime.strptime(date_from, '%Y-%m-%d').date()
            query = query.filter(Quote.date >= from_date)
        except ValueError:
            pass

    date_to = request.args.get('date_to')
    if date_to:
        try:
            to_date = datetime.strptime(date_to, '%Y-%m-%d').date()
            query = query.filter(Quote.date <= to_date)
        except ValueError:
            pass

    # Apply sorting
    sort = request.args.get('sort', 'date_desc')
    if sort == 'date_asc':
        query = query.order_by(Quote.date.asc())
    elif sort == 'date_desc':
        query = query.order_by(Quote.date.desc())
    elif sort == 'total_asc':
        query = query.order_by(Quote.total.asc())
    elif sort == 'total_desc':
        query = query.order_by(Quote.total.desc())
    else:
        query = query.order_by(Quote.created_at.desc())

    quotes = query.all()
    return jsonify([{
        'id': q.id,
        'doc_type': q.doc_type,
        'date': q.date.isoformat() if q.date else None,
        'invoice_number': q.invoice_number,
        'client_company': q.client_company,
        'job_description': q.job_description,
        'total': q.total,
        'created_at': q.created_at.isoformat() if q.created_at else None
    } for q in quotes])

# Client Companies API
@app.route('/api/companies')
@login_required
def get_companies():
    """Get all saved companies for current user with contact details"""
    companies = ClientCompany.query.filter_by(user_id=current_user.id).order_by(ClientCompany.name).all()
    return jsonify([{
        'id': c.id,
        'name': c.name,
        'address': c.address or '',
        'poc': c.poc or '',
        'poc_phone': c.poc_phone or '',
        'poc_email': c.poc_email or '',
        'venue': c.venue or ''
    } for c in companies])

@app.route('/api/companies', methods=['POST'])
@login_required
def add_company():
    """Add a new company for current user"""
    data = request.json
    name = data.get('name', '').strip()
    address = data.get('address', '').strip()

    if not name:
        return jsonify({'error': 'Company name is required'}), 400

    # Check if company already exists for this user
    existing = ClientCompany.query.filter_by(user_id=current_user.id, name=name).first()
    if existing:
        return jsonify({'error': 'Company already exists'}), 400

    company = ClientCompany(
        user_id=current_user.id,
        name=name,
        address=address
    )
    db.session.add(company)
    db.session.commit()

    return jsonify({
        'id': company.id,
        'name': company.name,
        'address': company.address
    })

@app.route('/api/companies/<company_name>/next-sequence')
@login_required
def get_next_sequence(company_name):
    """Get the next invoice sequence number for a company"""
    # Count existing quotes for this company
    count = Quote.query.filter_by(
        user_id=current_user.id,
        client_company=company_name
    ).count()
    return jsonify({'next_sequence': count + 1})

@app.route('/api/quotes', methods=['POST'])
@login_required
def create_quote():
    data = request.json

    # Check for duplicate invoice number for same company and doc_type
    invoice_number = data.get('invoice_number')
    client_company = data.get('client_company')
    doc_type = data.get('doc_type', 'QUOTE')

    if invoice_number and client_company:
        existing = Quote.query.filter_by(
            user_id=current_user.id,
            invoice_number=invoice_number,
            client_company=client_company,
            doc_type=doc_type
        ).first()
        if existing:
            return jsonify({
                'error': f'{doc_type} #{invoice_number} already exists for {client_company}'
            }), 400

    quote = Quote(
        user_id=current_user.id,
        doc_type=data.get('doc_type', 'QUOTE'),
        date=datetime.strptime(data['date'], '%Y-%m-%d').date() if data.get('date') else date.today(),
        invoice_number=data.get('invoice_number'),
        po_number=data.get('po_number'),
        job_id=data.get('job_id'),
        client_company=data.get('client_company'),
        client_address=data.get('client_address'),
        poc=data.get('poc'),
        poc_phone=data.get('poc_phone'),
        poc_email=data.get('poc_email'),
        job_company=data.get('job_company'),
        venue=data.get('venue'),
        job_description=data.get('job_description', current_user.default_job_description or 'Sound Operator'),
        hourly_rate=data.get('hourly_rate', current_user.default_hourly_rate or 200),
        date_from=datetime.strptime(data['date_from'], '%Y-%m-%d').date() if data.get('date_from') else None,
        date_to=datetime.strptime(data['date_to'], '%Y-%m-%d').date() if data.get('date_to') else None,
        billing_type=data.get('billing_type', 'hourly'),
        daily_rate=data.get('daily_rate', 1600),
        ot_hourly_rate=data.get('ot_hourly_rate', 220),
        regular_call_hours=data.get('regular_call_hours', 8),
        overtime_percentage=data.get('overtime_percentage', 10),
        outside_dubai=data.get('outside_dubai', False),
        per_diem_rate=data.get('per_diem_rate', 150),
        bank_account_holder=data.get('bank_account_holder', current_user.bank_account_holder),
        bank_name=data.get('bank_name', current_user.bank_name),
        bank_account_number=data.get('bank_account_number', current_user.bank_account_number),
        bank_iban=data.get('bank_iban', current_user.bank_iban),
        tax_rate=data.get('tax_rate', 0),
        subtotal=data.get('subtotal', 0),
        total=data.get('total', 0),
        equipments_enabled=data.get('equipments_enabled', False),
        hide_labor=data.get('hide_labor', False),
        equipment_headers=json.dumps(data.get('equipment_headers')) if data.get('equipment_headers') else None,
        equipment_items=json.dumps(data.get('equipment_items')) if data.get('equipment_items') else None
    )

    for item_data in data.get('line_items', []):
        line_item = LineItem(
            date=datetime.strptime(item_data['date'], '%Y-%m-%d').date() if item_data.get('date') else None,
            time_in=item_data.get('time_in'),
            time_out=item_data.get('time_out'),
            total_hours=item_data.get('total_hours', 0),
            regular_hours=item_data.get('regular_hours', 0),
            overtime_hours=item_data.get('overtime_hours', 0),
            rate=item_data.get('rate', 200),
            overtime_rate=item_data.get('overtime_rate'),
            line_total=item_data.get('line_total', 0),
            job_description=item_data.get('job_description'),
            daily_rate=item_data.get('daily_rate'),
            ot_hourly_rate=item_data.get('ot_hourly_rate')
        )
        quote.line_items.append(line_item)

    db.session.add(quote)
    db.session.commit()

    # Update company contact details if company exists
    if quote.client_company:
        company = ClientCompany.query.filter_by(
            user_id=current_user.id,
            name=quote.client_company
        ).first()
        if company:
            company.address = quote.client_address or company.address
            company.poc = quote.poc or company.poc
            company.poc_phone = quote.poc_phone or company.poc_phone
            company.poc_email = quote.poc_email or company.poc_email
            company.venue = quote.venue or company.venue
            db.session.commit()

    return jsonify(quote.to_dict()), 201

@app.route('/api/quotes/<int:quote_id>', methods=['GET'])
@login_required
def get_quote(quote_id):
    quote = Quote.query.filter_by(id=quote_id, user_id=current_user.id).first_or_404()
    return jsonify(quote.to_dict())

@app.route('/api/quotes/<int:quote_id>', methods=['PUT'])
@login_required
def update_quote(quote_id):
    quote = Quote.query.filter_by(id=quote_id, user_id=current_user.id).first_or_404()
    data = request.json

    # Check for duplicate invoice number for same company and doc_type (exclude current quote)
    invoice_number = data.get('invoice_number', quote.invoice_number)
    client_company = data.get('client_company', quote.client_company)
    doc_type = data.get('doc_type', quote.doc_type)

    if invoice_number and client_company:
        existing = Quote.query.filter(
            Quote.user_id == current_user.id,
            Quote.invoice_number == invoice_number,
            Quote.client_company == client_company,
            Quote.doc_type == doc_type,
            Quote.id != quote_id  # Exclude current quote
        ).first()
        if existing:
            return jsonify({
                'error': f'{doc_type} #{invoice_number} already exists for {client_company}'
            }), 400

    quote.doc_type = data.get('doc_type', quote.doc_type)
    if data.get('date'):
        quote.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    quote.invoice_number = data.get('invoice_number', quote.invoice_number)
    quote.po_number = data.get('po_number', quote.po_number)
    quote.job_id = data.get('job_id', quote.job_id)
    quote.client_company = data.get('client_company', quote.client_company)
    quote.client_address = data.get('client_address', quote.client_address)
    quote.poc = data.get('poc', quote.poc)
    quote.poc_phone = data.get('poc_phone', quote.poc_phone)
    quote.poc_email = data.get('poc_email', quote.poc_email)
    quote.job_company = data.get('job_company', quote.job_company)
    quote.venue = data.get('venue', quote.venue)
    quote.job_description = data.get('job_description', quote.job_description)
    quote.hourly_rate = data.get('hourly_rate', quote.hourly_rate)
    if data.get('date_from'):
        quote.date_from = datetime.strptime(data['date_from'], '%Y-%m-%d').date()
    if data.get('date_to'):
        quote.date_to = datetime.strptime(data['date_to'], '%Y-%m-%d').date()
    quote.billing_type = data.get('billing_type', quote.billing_type)
    quote.daily_rate = data.get('daily_rate', quote.daily_rate)
    quote.ot_hourly_rate = data.get('ot_hourly_rate', quote.ot_hourly_rate)
    quote.regular_call_hours = data.get('regular_call_hours', quote.regular_call_hours)
    quote.overtime_percentage = data.get('overtime_percentage', quote.overtime_percentage)
    quote.outside_dubai = data.get('outside_dubai', quote.outside_dubai)
    quote.per_diem_rate = data.get('per_diem_rate', quote.per_diem_rate)
    quote.bank_account_holder = data.get('bank_account_holder', quote.bank_account_holder)
    quote.bank_name = data.get('bank_name', quote.bank_name)
    quote.bank_account_number = data.get('bank_account_number', quote.bank_account_number)
    quote.bank_iban = data.get('bank_iban', quote.bank_iban)
    quote.tax_rate = data.get('tax_rate', quote.tax_rate)
    quote.subtotal = data.get('subtotal', quote.subtotal)
    quote.total = data.get('total', quote.total)

    # Update equipment data
    quote.equipments_enabled = data.get('equipments_enabled', quote.equipments_enabled)
    quote.hide_labor = data.get('hide_labor', quote.hide_labor)
    if 'equipment_headers' in data:
        quote.equipment_headers = json.dumps(data['equipment_headers']) if data['equipment_headers'] else None
    if 'equipment_items' in data:
        quote.equipment_items = json.dumps(data['equipment_items']) if data['equipment_items'] else None

    # Update line items
    if 'line_items' in data:
        LineItem.query.filter_by(quote_id=quote_id).delete()
        for item_data in data['line_items']:
            line_item = LineItem(
                quote_id=quote_id,
                date=datetime.strptime(item_data['date'], '%Y-%m-%d').date() if item_data.get('date') else None,
                time_in=item_data.get('time_in'),
                time_out=item_data.get('time_out'),
                total_hours=item_data.get('total_hours', 0),
                regular_hours=item_data.get('regular_hours', 0),
                overtime_hours=item_data.get('overtime_hours', 0),
                rate=item_data.get('rate', 200),
                overtime_rate=item_data.get('overtime_rate'),
                line_total=item_data.get('line_total', 0),
                job_description=item_data.get('job_description'),
                daily_rate=item_data.get('daily_rate'),
                ot_hourly_rate=item_data.get('ot_hourly_rate')
            )
            db.session.add(line_item)

    db.session.commit()

    # Update company contact details if company exists
    if quote.client_company:
        company = ClientCompany.query.filter_by(
            user_id=current_user.id,
            name=quote.client_company
        ).first()
        if company:
            company.address = quote.client_address or company.address
            company.poc = quote.poc or company.poc
            company.poc_phone = quote.poc_phone or company.poc_phone
            company.poc_email = quote.poc_email or company.poc_email
            company.venue = quote.venue or company.venue
            db.session.commit()

    return jsonify(quote.to_dict())

@app.route('/api/quotes/<int:quote_id>', methods=['DELETE'])
@login_required
def delete_quote(quote_id):
    quote = Quote.query.filter_by(id=quote_id, user_id=current_user.id).first_or_404()
    db.session.delete(quote)
    db.session.commit()
    return jsonify({'message': 'Quote deleted successfully'})


# Recycle Bin API Endpoints
@app.route('/api/quotes/<int:quote_id>/trash', methods=['POST'])
@login_required
def trash_quote(quote_id):
    """Move a quote to the recycle bin (soft delete)"""
    quote = Quote.query.filter_by(id=quote_id, user_id=current_user.id).first_or_404()
    quote.deleted_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Quote moved to recycle bin', 'id': quote.id})

@app.route('/api/quotes/<int:quote_id>/restore', methods=['POST'])
@login_required
def restore_quote(quote_id):
    """Restore a quote from the recycle bin"""
    quote = Quote.query.filter_by(id=quote_id, user_id=current_user.id).first_or_404()
    quote.deleted_at = None
    db.session.commit()
    return jsonify({'message': 'Quote restored successfully', 'id': quote.id})


@app.route('/api/quotes/<int:quote_id>/invoice-number', methods=['PUT'])
@login_required
def update_invoice_number(quote_id):
    """Update just the invoice number of a quote"""
    quote = Quote.query.filter_by(id=quote_id, user_id=current_user.id).first_or_404()
    data = request.get_json()
    new_number = data.get('invoice_number', '').strip()
    
    if not new_number:
        return jsonify({'error': 'Invoice number is required'}), 400
    
    # Validate it's a reasonable number (1-3 digits)
    if not new_number.isdigit() or len(new_number) > 3:
        return jsonify({'error': 'Invoice number must be 1-3 digits'}), 400
    
    quote.invoice_number = new_number
    db.session.commit()
    return jsonify({'message': 'Invoice number updated', 'id': quote.id, 'invoice_number': new_number})

@app.route('/api/quotes/trash', methods=['DELETE'])
@login_required
def clear_trash():
    """Permanently delete all quotes in the recycle bin"""
    trashed_quotes = Quote.query.filter_by(user_id=current_user.id).filter(Quote.deleted_at.isnot(None)).all()
    count = len(trashed_quotes)
    for quote in trashed_quotes:
        db.session.delete(quote)
    db.session.commit()
    return jsonify({'message': f'{count} quote(s) permanently deleted', 'count': count})

@app.route('/api/quotes/<int:quote_id>/pdf')
@login_required
def generate_pdf(quote_id):
    """Generate PDF for a quote using WeasyPrint"""
    quote = Quote.query.filter_by(id=quote_id, user_id=current_user.id).first_or_404()

    # Get absolute path for profile picture (WeasyPrint needs file:// URLs)
    profile_pic_path = None
    if current_user.profilepic:
        # Convert relative URL to absolute file path
        pic_filename = os.path.basename(current_user.profilepic)
        pic_path = os.path.join(app.config['UPLOAD_FOLDER'], pic_filename)
        if os.path.exists(pic_path):
            profile_pic_path = 'file://' + pic_path

    # Get background image path if specified
    background_path = None
    bg = request.args.get('bg', 'none')
    is_dark_background = request.args.get('isDark', 'false').lower() == 'true'
    if bg != 'none':
        bg_file = os.path.join(os.path.dirname(__file__), 'static', 'images', 'backgrounds', f'{bg}.jpg')
        if os.path.exists(bg_file):
            background_path = 'file://' + bg_file

    # Parse equipment data
    equipment_items = []
    equipment_headers = {'header1': 'Work/Item Description', 'header2': 'Qty/Days', 'header3': 'Price'}
    equipment_total = 0

    if quote.equipments_enabled and quote.equipment_items:
        try:
            equipment_items = json.loads(quote.equipment_items)
            equipment_total = sum(item.get('total', 0) for item in equipment_items)
        except:
            pass

    if quote.equipment_headers:
        try:
            equipment_headers = json.loads(quote.equipment_headers)
        except:
            pass

    # Render HTML template
    html_content = render_template('invoice_pdf.html',
                                   quote=quote,
                                   user=current_user,
                                   profile_pic_path=profile_pic_path,
                                   background_path=background_path,
                                   is_dark_background=is_dark_background,
                                   equipment_items=equipment_items,
                                   equipment_headers=equipment_headers,
                                   equipment_total=equipment_total)

    # Generate PDF
    pdf = HTML(string=html_content, base_url=request.url_root).write_pdf()

    # Create filename
    filename = f"{quote.doc_type}_{quote.invoice_number or quote_id}.pdf"

    return Response(
        pdf,
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5005)
