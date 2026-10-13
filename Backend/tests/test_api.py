import io

def test_health_and_public_lists(client):
    assert client.get("/health").status_code == 200
    assert client.get("/api/reports").json == []

def test_alert_sync_exposes_freshness_metadata(client):
    response = client.get("/api/sync/alerts")
    assert response.status_code == 200
    assert response.json["syncedAt"]
    assert isinstance(response.json["alerts"], list)
    status = client.get("/api/sync/status")
    assert status.status_code == 200
    assert status.json["source"] == "JalRakshak database"

def test_register_login_and_report(client):
    response=client.post("/api/auth/register", json={"name":"Citizen","email":"citizen@example.com","password":"strong-pass"})
    assert response.status_code == 201
    token=response.json["accessToken"]
    response=client.post("/api/reports", headers={"Authorization":f"Bearer {token}"}, json={"hazard":"flood","district":"Kaski","municipality":"Pokhara","location":{"lat":28.2,"lng":83.9},"description":"Water rising"})
    assert response.status_code == 201 and response.json["status"] == "unverified"

def test_report_location_is_optional_and_validated_when_present(client):
    without_location = client.post(
        "/api/reports",
        json={"hazard": "flood", "district": "Kaski", "municipality": "Pokhara", "description": "Water rising"},
    )
    assert without_location.status_code == 201
    assert without_location.json["location"] is None

    invalid = client.post(
        "/api/reports",
        json={"hazard": "flood", "district": "Kaski", "municipality": "Pokhara", "location": {"lat": 91, "lng": 83}, "description": "Water rising"},
    )
    assert invalid.status_code == 400

def test_public_registration_cannot_escalate_role(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Attempted Admin", "email": "attacker@example.com", "password": "strong-pass", "role": "admin"},
    )
    assert response.status_code == 201
    assert response.json["user"]["role"] == "citizen"

def test_rescue_list_does_not_expose_private_records_publicly(client):
    response = client.post(
        "/api/rescue-requests",
        json={
            "category": "medical",
            "urgency": "urgent",
            "district": "Kaski",
            "municipality": "Pokhara",
            "people": 1,
            "description": "Needs medicine",
            "name": "Private Person",
            "phone": "9800000000",
        },
    )
    assert response.status_code == 201
    assert client.get("/api/rescue-requests").json == []

def test_rescue_request_accepts_gps_without_district_or_municipality(client):
    response = client.post(
        "/api/rescue-requests",
        data={
            "category": "immediate_rescue",
            "urgency": "urgent",
            "people": 2,
            "description": "Water has entered the home and two people need evacuation.",
            "medicalConcerns": "One person needs regular medication.",
            "location": '{"lat": 27.7172, "lng": 85.324}',
            "evidence": (io.BytesIO(b"fake image bytes"), "evidence.jpg"),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 201
    with client.application.app_context():
        from app.models import RescueRequest

        saved = RescueRequest.query.one()
        assert saved.district is None
        assert saved.municipality is None
        assert saved.lat == 27.7172
        assert saved.lng == 85.324
        assert saved.medical_concerns == "One person needs regular medication."
        assert saved.evidence_name

def test_admin_protection(client):
    assert client.get("/api/admin/activity").status_code == 401
    response=client.patch("/api/admin/reports/not-found/verify", json={"status":"verified"})
    assert response.status_code == 401

def test_hazard_reports_require_explicit_admin_approval(client):
    created = client.post(
        "/api/reports",
        json={
            "hazard": "flood",
            "district": "Kaski",
            "municipality": "Pokhara",
            "description": "Water rising near homes",
            "status": "verified",
            "source": "official",
        },
    )
    assert created.status_code == 201
    assert created.json["status"] == "unverified"
    assert created.json["source"] == "community"

    citizen = client.post(
        "/api/auth/register",
        json={"name": "Citizen", "email": "approval-citizen@example.com", "password": "strong-pass"},
    )
    citizen_headers = {"Authorization": f"Bearer {citizen.json['accessToken']}"}
    assert client.patch(
        f"/api/admin/reports/{created.json['id']}/verify",
        headers=citizen_headers,
        json={"status": "verified"},
    ).status_code == 403

    with client.application.app_context():
        from app.extensions import db
        from app.models import User

        admin = User(name="Test Admin", email="test-admin@example.com", role="admin")
        admin.set_password("strong-pass")
        db.session.add(admin)
        db.session.commit()

    admin_login = client.post(
        "/api/auth/login",
        json={"email": "test-admin@example.com", "password": "strong-pass"},
    )
    admin_headers = {"Authorization": f"Bearer {admin_login.json['accessToken']}"}
    report_url = f"/api/admin/reports/{created.json['id']}/verify"
    invalid = client.patch(report_url, headers=admin_headers, json={"status": "approved"})
    assert invalid.status_code == 400

    approved = client.patch(report_url, headers=admin_headers, json={"status": "verified"})
    assert approved.status_code == 200
    assert approved.json["status"] == "verified"

def test_notifications_require_authentication(client):
    assert client.get("/api/notifications").status_code == 401
    assert client.patch("/api/notifications/not-found/read").status_code == 401

def test_report_rejects_invalid_evidence_type(client):
    response = client.post(
        "/api/reports",
        data={
            "hazard": "flood",
            "district": "Kaski",
            "municipality": "Pokhara",
            "location": '{"lat": 28.2, "lng": 83.9}',
            "description": "Water rising near homes",
            "evidence": (io.BytesIO(b"not an image"), "evidence.txt"),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 400

def test_shelter_updates_require_provider_role(client):
    response = client.post("/api/auth/register", json={"name": "Shelter Citizen", "email": "shelter@example.com", "password": "strong-pass"})
    token = response.json["accessToken"]
    assert client.patch("/api/shelters/not-found", headers={"Authorization": f"Bearer {token}"}, json={"occupancy": 1}).status_code == 403

def test_weather_validates_coordinates(client):
    assert client.get("/api/weather").status_code == 400
    assert client.get("/api/weather?lat=91&lon=85").status_code == 400

def test_weather_normalizes_provider_response(client, monkeypatch):
    from app.api import routes

    monkeypatch.setattr(routes, "get_weather", lambda *args, **kwargs: {
        "source": "Open-Meteo", "latitude": 27.7, "longitude": 85.3,
        "status": "live", "is_stale": False, "forecast": [],
        "current_conditions": {"temperature": 20, "precipitation": 0, "rain": 0, "weather_code": 1},
        "warning_note": "Forecast data is not a confirmed flood warning.",
    })
    response = client.get("/api/weather?lat=27.7&lon=85.3")
    assert response.status_code == 200
    assert response.json["source"] == "Open-Meteo"
    assert response.json["status"] == "live"


def test_road_conditions_returns_summary_and_filtered_items(client):
    response = client.get("/api/roads")
    assert response.status_code == 200
    payload = response.json
    assert isinstance(payload["items"], list)
    assert payload["items"]
    assert payload["source"].startswith("Department of Roads")

    summary = client.get("/api/roads/summary")
    assert summary.status_code == 200
    summary_json = summary.json
    assert summary_json["total"] >= 1
    assert set(summary_json.keys()) >= {"total", "open", "partially_open", "closed", "unknown", "last_updated", "source"}
