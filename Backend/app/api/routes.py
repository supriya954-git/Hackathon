from datetime import datetime, timezone
from functools import wraps
from flask import Blueprint, current_app, jsonify, request
from pathlib import Path
from werkzeug.utils import secure_filename
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import desc
from ..extensions import db
from ..models import *
from ..services.road_conditions_service import get_road_conditions, summarize_road_conditions
from ..services.weather_service import WeatherProviderError, get_weather

api = Blueprint("api", __name__, url_prefix="/api")
auth = Blueprint("auth", __name__, url_prefix="/api/auth")

def fail(message, status=400): return jsonify({"error": message}), status
def payload(model): return jsonify(model.json())
def required(data, names):
    missing = [n for n in names if data.get(n) in (None, "")]
    return f"Missing fields: {', '.join(missing)}" if missing else None
def parse_dt(value): return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else datetime.now(timezone.utc)
def request_data():
    return request.form.to_dict() if request.content_type and request.content_type.startswith("multipart/form-data") else (request.get_json(silent=True) or {})
def parse_json_field(data, name, default=None):
    import json
    value = data.get(name, default)
    if isinstance(value, str):
        try: return json.loads(value)
        except json.JSONDecodeError: return default
    return value
def save_evidence(file_storage, owner_id):
    if not file_storage or not file_storage.filename: return None
    filename = secure_filename(file_storage.filename)
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed = current_app.config.get("ALLOWED_UPLOAD_EXTENSIONS", {"jpg", "jpeg", "png", "webp", "pdf"})
    if extension not in allowed or file_storage.mimetype not in {"image/jpeg", "image/png", "image/webp", "application/pdf"}:
        raise ValueError("Evidence must be a JPG, PNG, WebP, or PDF file")
    max_bytes = current_app.config.get("MAX_CONTENT_LENGTH", 5 * 1024 * 1024)
    if file_storage.content_length and file_storage.content_length > max_bytes:
        raise ValueError("Evidence file is too large (maximum 5 MB)")
    stored = f"{owner_id or 'anonymous'}-{__import__('secrets').token_hex(12)}.{extension}"
    path = Path(current_app.config.get("UPLOAD_FOLDER", "private_uploads")) / stored
    file_storage.save(path)
    size = path.stat().st_size
    if size > max_bytes:
        path.unlink(missing_ok=True)
        raise ValueError("Evidence file is too large (maximum 5 MB)")
    return {"name": stored, "mime": file_storage.mimetype, "size": size}
def admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapped(*args, **kwargs):
        if get_jwt().get("role") != "admin": return fail("Administrator role required", 403)
        return fn(*args, **kwargs)
    return wrapped
def audit(action, target):
    db.session.add(Activity(actor=str(get_jwt_identity() or "system"), action=action, target=target))
def notify(user_id, title, message, kind="status"):
    if user_id:
        db.session.add(Notification(user_id=user_id, title=title, message=message, kind=kind))

@auth.post("/register")
def register():
    d=request.get_json(silent=True) or {}; err=required(d,["name","email","password"])
    if err: return fail(err)
    if len(d["password"]) < 8: return fail("Password must be at least 8 characters")
    if User.query.filter_by(email=d["email"].lower().strip()).first(): return fail("Email already registered",409)
    # Public registration can only create citizens; elevated roles are assigned
    # by an authorized administrator.
    u=User(name=d["name"].strip(),email=d["email"].lower().strip(),role="citizen"); u.set_password(d["password"]); db.session.add(u); db.session.commit()
    return jsonify({"user":u.json(),"accessToken":create_access_token(identity=u.id, additional_claims={"role":u.role})}),201

@auth.post("/login")
def login():
    d=request.get_json(silent=True) or {}; u=User.query.filter_by(email=str(d.get("email","")).lower().strip()).first()
    if not u or not u.check_password(str(d.get("password",""))): return fail("Invalid email or password",401)
    return jsonify({"user":u.json(),"accessToken":create_access_token(identity=u.id, additional_claims={"role":u.role})})

@auth.get("/me")
@jwt_required()
def me(): return payload(User.query.get(get_jwt_identity()))

@api.get("/alerts")
def alerts(): return jsonify([x.json() for x in Alert.query.order_by(desc(Alert.updated_at)).all()])

@api.get("/sync/alerts")
def sync_alerts():
    """Incremental-friendly alert sync response for offline clients."""
    since = request.args.get("since")
    query = Alert.query.order_by(desc(Alert.updated_at))
    if since:
        try:
            query = query.filter(Alert.updated_at > parse_dt(since))
        except (TypeError, ValueError):
            return fail("Invalid since timestamp")
    return jsonify({"syncedAt": datetime.now(timezone.utc).isoformat(), "alerts": [x.json() for x in query.all()]})

@api.get("/sync/status")
def sync_status():
    latest = Alert.query.order_by(desc(Alert.updated_at)).first()
    return jsonify({
        "syncedAt": datetime.now(timezone.utc).isoformat(),
        "latestAlertAt": latest.updated_at.isoformat() if latest else None,
        "source": "JalRakshak database",
    })
@api.get("/reports")
def reports(): return jsonify([x.json() for x in HazardReport.query.order_by(desc(HazardReport.created_at)).all()])
@api.post("/reports")
@jwt_required(optional=True)
def create_report():
    d=request_data(); d["location"] = parse_json_field(d, "location", {})
    err=required(d,["hazard","district","municipality","description"])
    if err:return fail(err)
    loc=d["location"] or {}
    if not isinstance(loc, dict): return fail("Valid latitude and longitude are required")
    if loc:
        try:
            lat, lng = float(loc.get("lat", 999)), float(loc.get("lng", 999))
        except (TypeError, ValueError):
            return fail("Valid latitude and longitude are required")
        if not (-90 <= lat <= 90 and -180 <= lng <= 180): return fail("Valid latitude and longitude are required")
    else:
        lat = lng = None
    try: evidence = save_evidence(request.files.get("evidence"), get_jwt_identity())
    except ValueError as exc: return fail(str(exc), 400)
    r=HazardReport(hazard=d["hazard"],district=d["district"],municipality=d["municipality"],lat=lat,lng=lng,description=d["description"],observed_at=parse_dt(d.get("observedAt")),reporter_id=get_jwt_identity(),evidence_name=evidence["name"] if evidence else None,evidence_mime=evidence["mime"] if evidence else None,evidence_size=evidence["size"] if evidence else None)
    db.session.add(r); db.session.commit(); return payload(r),201
@api.patch("/admin/reports/<id>/verify")
@admin_required
def verify_report(id):
    d=request.get_json(silent=True) or {}
    status=d.get("status")
    if status not in ("verified", "rejected"):
        return fail("Status must be verified or rejected")
    r=HazardReport.query.get_or_404(id); r.status=status; notify(r.reporter_id, "Report status updated", f"Your hazard report is now {r.status}.", "report"); audit(f"Set report status: {r.status}",id); db.session.commit(); return payload(r)

def rescue_ref(): return f"JR-RQ-{__import__('secrets').token_hex(3).upper()}"
@api.get("/rescue-requests")
@jwt_required(optional=True)
def get_rescues():
    ref=request.args.get("reference")
    identity = get_jwt_identity()
    role = get_jwt().get("role")
    if ref:
        q = RescueRequest.query.filter_by(reference=ref.strip().upper()).all()
    elif role in {"admin", "responder"}:
        q = RescueRequest.query.order_by(desc(RescueRequest.created_at)).all()
    elif identity:
        q = RescueRequest.query.filter_by(owner_id=identity).order_by(desc(RescueRequest.created_at)).all()
    else:
        q = []
    private = bool(identity and q and q[0].owner_id == identity) or role in {"admin", "responder"}
    return (jsonify(q[0].json(private=private)) if ref and q else (jsonify(None) if ref else jsonify([x.json(private=role in {"admin", "responder"}) for x in q])))
@api.post("/rescue-requests")
@jwt_required(optional=True)
def create_rescue():
    d=request_data(); d["location"] = parse_json_field(d, "location", {})
    try: d["people"] = int(d.get("people"))
    except (TypeError, ValueError): pass
    err=required(d,["category","urgency","people","description"])
    if err:return fail(err)
    loc=d.get("location") or {}
    if not isinstance(d["people"], int) or not 1 <= d["people"] <= 10000: return fail("People must be an integer between 1 and 10000")
    if loc:
        try:
            lat, lng = float(loc.get("lat", 999)), float(loc.get("lng", 999))
        except (TypeError, ValueError):
            return fail("Valid latitude and longitude are required")
        if not (-90 <= lat <= 90 and -180 <= lng <= 180): return fail("Valid latitude and longitude are required")
    else:
        lat = lng = None
    try: evidence = save_evidence(request.files.get("evidence"), get_jwt_identity())
    except ValueError as exc: return fail(str(exc), 400)
    r=RescueRequest(reference=rescue_ref(),category=d["category"],urgency=d["urgency"],name=d.get("name"),phone=d.get("phone"),contact_method=d.get("contactMethod","none"),district=d.get("district") or None,municipality=d.get("municipality") or None,lat=lat,lng=lng,people=d["people"],description=d["description"],medical_concerns=d.get("medicalConcerns"),owner_id=get_jwt_identity(),evidence_name=evidence["name"] if evidence else None,evidence_mime=evidence["mime"] if evidence else None,evidence_size=evidence["size"] if evidence else None)
    db.session.add(r); db.session.commit(); return payload(r),201
@api.patch("/admin/rescue-requests/<id>/status")
@admin_required
def rescue_status(id):
    r=RescueRequest.query.get_or_404(id); d=request.get_json(silent=True) or {}; r.status=d.get("status",r.status); r.assigned_to=d.get("assignedTo",r.assigned_to); notify(r.owner_id, "Rescue request updated", f"Request {r.reference} is now {r.status}.", "rescue"); audit(f"Rescue status: {r.status}",r.reference); db.session.commit(); return payload(r)

@api.get("/shelters")
def shelters(): return jsonify([x.json() for x in Shelter.query.order_by(Shelter.name).all()])
@api.patch("/shelters/<id>")
@jwt_required()
def shelter_update(id):
    if get_jwt().get("role") not in {"provider", "admin"}:
        return fail("Shelter provider or administrator role required", 403)
    s=Shelter.query.get_or_404(id); d=request.get_json(silent=True) or {}
    if "occupancy" in d:
        try: occupancy = int(d["occupancy"])
        except (TypeError, ValueError): return fail("Occupancy must be a whole number")
        if occupancy < 0 or s.capacity is not None and occupancy > s.capacity:
            return fail("Occupancy must be between 0 and the reported capacity")
        s.occupancy = occupancy
    for field in ("occupancy","food","water","medical"):
        if field in d and field != "occupancy":
            if not isinstance(d[field], bool): return fail(f"{field} must be true or false")
            setattr(s,field,d[field])
    s.verified=False; db.session.commit(); return payload(s)
@api.patch("/admin/shelters/<id>/verify")
@admin_required
def shelter_verify(id):
    s=Shelter.query.get_or_404(id); s.verified=bool((request.get_json(silent=True) or {}).get("verified",False)); audit("Verified shelter" if s.verified else "Marked shelter unverified",s.name); db.session.commit(); return payload(s)

@api.get("/facilities")
def facilities(): return jsonify([x.json() for x in Facility.query.all()])
@api.get("/relief-requests")
def relief(): return jsonify([x.json() for x in ReliefRequest.query.order_by(desc(ReliefRequest.created_at)).all()])
@api.post("/relief-requests")
@jwt_required(optional=True)
def create_relief():
    d=request.get_json(silent=True) or {}; err=required(d,["item","quantity","area","district","urgency"])
    if err:return fail(err)
    r=ReliefRequest(item=d["item"],quantity=d["quantity"],area=d["area"],district=d["district"],urgency=d["urgency"]); db.session.add(r); db.session.commit(); return payload(r),201
@api.patch("/relief-requests/<id>/status")
@admin_required
def relief_status(id):
    r=ReliefRequest.query.get_or_404(id); d=request.get_json(silent=True) or {}; r.status=d.get("status",r.status); r.provider=d.get("provider",r.provider); audit(f"Relief status: {r.status}",id); db.session.commit(); return payload(r)

@api.get("/inventory")
def inventory(): return jsonify([x.json() for x in InventoryItem.query.order_by(desc(InventoryItem.updated_at)).all()])
@api.post("/inventory")
@jwt_required()
def add_inventory():
    d=request.get_json(silent=True) or {}; loc=d.get("location") or {}; err=required(d,["provider","item","quantity","district","location"])
    if err:return fail(err)
    x=InventoryItem(provider=d["provider"],item=d["item"],quantity=d["quantity"],district=d["district"],lat=loc["lat"],lng=loc["lng"]); db.session.add(x); db.session.commit(); return payload(x),201
@api.patch("/inventory/<id>")
@admin_required
def update_inventory(id):
    x=InventoryItem.query.get_or_404(id); d=request.get_json(silent=True) or {}; x.quantity=d.get("quantity",x.quantity); x.confirmed=d.get("confirmed",x.confirmed); audit("Inventory updated",x.provider); db.session.commit(); return payload(x)

@api.get("/recovery-applications")
@jwt_required(optional=True)
def recovery():
    identity = get_jwt_identity()
    role = get_jwt().get("role")
    query = RecoveryApplication.query.order_by(desc(RecoveryApplication.created_at))
    if role != "admin":
        query = query.filter_by(owner_id=identity) if identity else query.filter_by(id="")
    return jsonify([x.json() for x in query.all()])
@api.post("/recovery-applications")
@jwt_required(optional=True)
def create_recovery():
    d=request_data(); err=required(d,["type","household","district","municipality","description"])
    if err:return fail(err)
    try: evidence = save_evidence(request.files.get("evidence"), get_jwt_identity())
    except ValueError as exc: return fail(str(exc), 400)
    now=datetime.now(timezone.utc); r=RecoveryApplication(reference=f"JR-RC-{__import__('secrets').token_hex(3).upper()}",type=d["type"],household=d["household"],district=d["district"],municipality=d["municipality"],description=d["description"],estimated_loss=float(d["estimatedLoss"]) if d.get("estimatedLoss") else None,has_evidence=bool(d.get("hasEvidence",False)),evidence_name=evidence["name"] if evidence else None,evidence_mime=evidence["mime"] if evidence else None,evidence_size=evidence["size"] if evidence else None,history=[{"status":"submitted","at":now.isoformat()}],owner_id=get_jwt_identity()); db.session.add(r); db.session.commit(); return payload(r),201
@api.patch("/admin/recovery-applications/<id>/decision")
@admin_required
def recovery_decision(id):
    r=RecoveryApplication.query.get_or_404(id); d=request.get_json(silent=True) or {}; status=d.get("status",r.status); note=d.get("note"); r.status=status; r.decision_note=note; r.history=(r.history or [])+[{"status":status,"at":datetime.now(timezone.utc).isoformat(),"note":note}]; notify(r.owner_id, "Recovery application updated", f"Application {r.reference} is now {status}.", "recovery"); audit(f"Recovery decision: {status}",r.reference); db.session.commit(); return payload(r)

@api.get("/notifications")
@jwt_required()
def notifications():
    user_id = get_jwt_identity()
    rows = Notification.query.filter_by(user_id=user_id).order_by(desc(Notification.created_at)).limit(50).all()
    return jsonify([row.json() for row in rows])

@api.patch("/notifications/<id>/read")
@jwt_required()
def mark_notification_read(id):
    row = Notification.query.filter_by(id=id, user_id=get_jwt_identity()).first_or_404()
    row.read = True
    db.session.commit()
    return payload(row)

@api.get("/admin/activity")
@admin_required
def activity(): return jsonify([x.json() for x in Activity.query.order_by(desc(Activity.at)).limit(100).all()])

@api.get("/dashboard")
def dashboard():
    return jsonify({
        "activeAlerts": Alert.query.filter_by(verified=True).count(),
        "pendingReports": HazardReport.query.filter(HazardReport.status.in_(["unverified", "under_review"])).count(),
        "openRescueRequests": RescueRequest.query.filter(RescueRequest.status != "resolved").count(),
        "availableShelters": Shelter.query.filter_by(verified=True).count(),
        "unfulfilledReliefRequests": ReliefRequest.query.filter(ReliefRequest.status.notin_(["delivered", "cancelled"])).count(),
        "recoveryAwaitingReview": RecoveryApplication.query.filter(RecoveryApplication.status.in_(["submitted", "under_review"])).count(),
    })

@api.get("/roads")
def roads():
    payload = get_road_conditions()
    return jsonify(payload)

@api.get("/roads/summary")
def roads_summary():
    payload = get_road_conditions()
    return jsonify(summarize_road_conditions(payload.get("items", [])))

@api.get("/weather")
def weather():
    try:
        latitude = float(request.args["lat"])
        longitude = float(request.args["lon"])
    except (KeyError, TypeError, ValueError):
        return fail("Valid lat and lon query parameters are required", 400)
    try:
        return jsonify(get_weather(
            latitude,
            longitude,
            base_url=current_app.config.get("WEATHER_API_BASE_URL", "https://api.open-meteo.com"),
            timeout_seconds=current_app.config.get("WEATHER_TIMEOUT_SECONDS", 5),
            cache_seconds=current_app.config.get("WEATHER_CACHE_SECONDS", 300),
        ))
    except ValueError as exc:
        return fail(str(exc), 400)
    except WeatherProviderError as exc:
        return jsonify({
            "source": "Open-Meteo",
            "latitude": latitude,
            "longitude": longitude,
            "status": "unavailable",
            "is_stale": False,
            "message": str(exc),
            "forecast": [],
            "current_conditions": None,
            "warning_note": "Forecast data is not a confirmed flood warning.",
        }), 503

@api.get("/map/incidents")
def map_incidents():
    incidents = [r.json() for r in HazardReport.query.all()]
    incidents += [r.json() for r in RescueRequest.query.all()]
    return jsonify({"incidents": incidents, "source": "JalRakshak database", "isDemo": any(x.get("isDemo") for x in incidents)})
