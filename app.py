from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date, timedelta

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///quotes.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Database Models

class Settings(db.Model):
    """Global settings like hourly rate"""
    id = db.Column(db.Integer, primary_key=True)
    hourly_rate = db.Column(db.Float, default=200)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'hourly_rate': self.hourly_rate
        }

class Quote(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    doc_type = db.Column(db.String(10), default='QUOTE')
    date = db.Column(db.Date, nullable=False)
    invoice_number = db.Column(db.String(50))
    po_number = db.Column(db.String(50))
    job_id = db.Column(db.String(100))
    client_company = db.Column(db.String(200))
    client_address = db.Column(db.Text)
    poc = db.Column(db.String(100))
    job_company = db.Column(db.String(200))
    venue = db.Column(db.String(200))

    # New fields for hourly system
    job_description = db.Column(db.String(300), default='Sound Operator')
    hourly_rate = db.Column(db.Float, default=200)
    date_from = db.Column(db.Date)
    date_to = db.Column(db.Date)

    # Editable bank details
    bank_account_holder = db.Column(db.String(200), default='Hemanth Kulamullathil')
    bank_name = db.Column(db.String(200), default='Mashreq Bank')
    bank_account_number = db.Column(db.String(50), default='019010238158')
    bank_iban = db.Column(db.String(50), default='AE750330000019010238158')

    tax_rate = db.Column(db.Float, default=0)
    subtotal = db.Column(db.Float, default=0)
    total = db.Column(db.Float, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    line_items = db.relationship('LineItem', backref='quote', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'doc_type': self.doc_type,
            'date': self.date.isoformat() if self.date else None,
            'invoice_number': self.invoice_number,
            'po_number': self.po_number,
            'job_id': self.job_id,
            'client_company': self.client_company,
            'client_address': self.client_address,
            'poc': self.poc,
            'job_company': self.job_company,
            'venue': self.venue,
            'job_description': self.job_description,
            'hourly_rate': self.hourly_rate,
            'date_from': self.date_from.isoformat() if self.date_from else None,
            'date_to': self.date_to.isoformat() if self.date_to else None,
            'bank_account_holder': self.bank_account_holder,
            'bank_name': self.bank_name,
            'bank_account_number': self.bank_account_number,
            'bank_iban': self.bank_iban,
            'tax_rate': self.tax_rate,
            'subtotal': self.subtotal,
            'total': self.total,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'line_items': [item.to_dict() for item in self.line_items]
        }

class LineItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quote_id = db.Column(db.Integer, db.ForeignKey('quote.id'), nullable=False)
    date = db.Column(db.Date)  # Single date for each day
    hours = db.Column(db.Float, default=0)  # Hours worked that day
    rate = db.Column(db.Float, nullable=False)  # Hourly rate
    line_total = db.Column(db.Float)  # hours * rate

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date.isoformat() if self.date else None,
            'hours': self.hours,
            'rate': self.rate,
            'line_total': self.line_total
        }

# Initialize database
def init_db():
    with app.app_context():
        db.create_all()
        # Create default settings if not exists
        if Settings.query.count() == 0:
            settings = Settings(hourly_rate=200)
            db.session.add(settings)
            db.session.commit()

# Routes
@app.route('/')
def index():
    return render_template('index.html')

# Settings API
@app.route('/api/settings', methods=['GET'])
def get_settings():
    settings = Settings.query.first()
    if not settings:
        settings = Settings(hourly_rate=200)
        db.session.add(settings)
        db.session.commit()
    return jsonify(settings.to_dict())

@app.route('/api/settings', methods=['PUT'])
def update_settings():
    settings = Settings.query.first()
    if not settings:
        settings = Settings(hourly_rate=200)
        db.session.add(settings)

    data = request.json
    if 'hourly_rate' in data:
        settings.hourly_rate = data['hourly_rate']

    db.session.commit()
    return jsonify(settings.to_dict())

# Quote API endpoints
@app.route('/api/quotes', methods=['GET'])
def get_quotes():
    quotes = Quote.query.order_by(Quote.created_at.desc()).all()
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

@app.route('/api/quotes', methods=['POST'])
def create_quote():
    data = request.json

    quote = Quote(
        doc_type=data.get('doc_type', 'QUOTE'),
        date=datetime.strptime(data['date'], '%Y-%m-%d').date() if data.get('date') else date.today(),
        invoice_number=data.get('invoice_number'),
        po_number=data.get('po_number'),
        job_id=data.get('job_id'),
        client_company=data.get('client_company'),
        client_address=data.get('client_address'),
        poc=data.get('poc'),
        job_company=data.get('job_company'),
        venue=data.get('venue'),
        job_description=data.get('job_description', 'Sound Operator'),
        hourly_rate=data.get('hourly_rate', 200),
        date_from=datetime.strptime(data['date_from'], '%Y-%m-%d').date() if data.get('date_from') else None,
        date_to=datetime.strptime(data['date_to'], '%Y-%m-%d').date() if data.get('date_to') else None,
        bank_account_holder=data.get('bank_account_holder', 'Hemanth Kulamullathil'),
        bank_name=data.get('bank_name', 'Mashreq Bank'),
        bank_account_number=data.get('bank_account_number', '019010238158'),
        bank_iban=data.get('bank_iban', 'AE750330000019010238158'),
        tax_rate=data.get('tax_rate', 0),
        subtotal=data.get('subtotal', 0),
        total=data.get('total', 0)
    )

    for item_data in data.get('line_items', []):
        line_item = LineItem(
            date=datetime.strptime(item_data['date'], '%Y-%m-%d').date() if item_data.get('date') else None,
            hours=item_data.get('hours', 0),
            rate=item_data.get('rate', 200),
            line_total=item_data.get('line_total', 0)
        )
        quote.line_items.append(line_item)

    db.session.add(quote)
    db.session.commit()
    return jsonify(quote.to_dict()), 201

@app.route('/api/quotes/<int:quote_id>', methods=['GET'])
def get_quote(quote_id):
    quote = Quote.query.get_or_404(quote_id)
    return jsonify(quote.to_dict())

@app.route('/api/quotes/<int:quote_id>', methods=['PUT'])
def update_quote(quote_id):
    quote = Quote.query.get_or_404(quote_id)
    data = request.json

    quote.doc_type = data.get('doc_type', quote.doc_type)
    if data.get('date'):
        quote.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    quote.invoice_number = data.get('invoice_number', quote.invoice_number)
    quote.po_number = data.get('po_number', quote.po_number)
    quote.job_id = data.get('job_id', quote.job_id)
    quote.client_company = data.get('client_company', quote.client_company)
    quote.client_address = data.get('client_address', quote.client_address)
    quote.poc = data.get('poc', quote.poc)
    quote.job_company = data.get('job_company', quote.job_company)
    quote.venue = data.get('venue', quote.venue)
    quote.job_description = data.get('job_description', quote.job_description)
    quote.hourly_rate = data.get('hourly_rate', quote.hourly_rate)
    if data.get('date_from'):
        quote.date_from = datetime.strptime(data['date_from'], '%Y-%m-%d').date()
    if data.get('date_to'):
        quote.date_to = datetime.strptime(data['date_to'], '%Y-%m-%d').date()
    quote.bank_account_holder = data.get('bank_account_holder', quote.bank_account_holder)
    quote.bank_name = data.get('bank_name', quote.bank_name)
    quote.bank_account_number = data.get('bank_account_number', quote.bank_account_number)
    quote.bank_iban = data.get('bank_iban', quote.bank_iban)
    quote.tax_rate = data.get('tax_rate', quote.tax_rate)
    quote.subtotal = data.get('subtotal', quote.subtotal)
    quote.total = data.get('total', quote.total)

    # Update line items
    if 'line_items' in data:
        LineItem.query.filter_by(quote_id=quote_id).delete()
        for item_data in data['line_items']:
            line_item = LineItem(
                quote_id=quote_id,
                date=datetime.strptime(item_data['date'], '%Y-%m-%d').date() if item_data.get('date') else None,
                hours=item_data.get('hours', 0),
                rate=item_data.get('rate', 200),
                line_total=item_data.get('line_total', 0)
            )
            db.session.add(line_item)

    db.session.commit()
    return jsonify(quote.to_dict())

@app.route('/api/quotes/<int:quote_id>', methods=['DELETE'])
def delete_quote(quote_id):
    quote = Quote.query.get_or_404(quote_id)
    db.session.delete(quote)
    db.session.commit()
    return jsonify({'message': 'Quote deleted successfully'})

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5005)
