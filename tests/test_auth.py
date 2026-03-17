"""
Tests for auth routes: /api/auth/register, login, logout, set-username, user.
"""
import json
import pytest
from unittest.mock import patch, MagicMock

from tests.conftest import make_mock_user


class TestRegister:
    def test_missing_name_returns_400(self, client):
        resp = client.post(
            "/api/auth/register",
            json={"email": "a@b.com", "idToken": "tok"},
        )
        assert resp.status_code == 400
        assert "required" in resp.get_json()["error"].lower()

    def test_missing_email_returns_400(self, client):
        resp = client.post(
            "/api/auth/register",
            json={"name": "Alice", "idToken": "tok"},
        )
        assert resp.status_code == 400

    def test_no_id_token_returns_400(self, client):
        resp = client.post(
            "/api/auth/register",
            json={"name": "Alice", "email": "a@b.com"},
        )
        assert resp.status_code == 400
        assert "token" in resp.get_json()["error"].lower()

    def test_valid_id_token_registers_user(self, client):
        user = make_mock_user()
        with patch("app.auth.FirebaseService.authenticate_with_token", return_value=user):
            resp = client.post(
                "/api/auth/register",
                json={"name": "Alice", "email": "a@b.com", "idToken": "valid-tok"},
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["user"]["id"] == "uid-test"
        assert data["user"]["email"] == "test@example.com"

    def test_invalid_firebase_token_returns_400(self, client):
        with patch("app.auth.FirebaseService.authenticate_with_token", return_value=None):
            resp = client.post(
                "/api/auth/register",
                json={"name": "Alice", "email": "a@b.com", "idToken": "bad-tok"},
            )
        assert resp.status_code == 400
        assert "Failed to verify" in resp.get_json()["error"]


class TestLogin:
    def test_no_request_data_returns_400(self, client):
        # Send with correct content-type but no idToken — triggers the "token required" 400
        resp = client.post("/api/auth/login", json={})
        assert resp.status_code == 400

    def test_no_id_token_returns_400(self, client):
        resp = client.post("/api/auth/login", json={"email": "a@b.com"})
        assert resp.status_code == 400
        assert "token" in resp.get_json()["error"].lower()

    def test_invalid_token_returns_401(self, client):
        with patch("app.auth.FirebaseService.authenticate_with_token", return_value=None):
            resp = client.post("/api/auth/login", json={"idToken": "bad"})
        assert resp.status_code == 401

    def test_valid_token_login_succeeds(self, client):
        user = make_mock_user()
        with patch("app.auth.FirebaseService.authenticate_with_token", return_value=user):
            resp = client.post("/api/auth/login", json={"idToken": "valid-tok"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["message"] == "Login successful"
        assert data["user"]["email"] == "test@example.com"

    def test_google_signin_without_username_prompts_username(self, client):
        user = make_mock_user()
        user.username = None
        with patch("app.auth.FirebaseService.authenticate_with_token", return_value=user):
            resp = client.post(
                "/api/auth/login",
                json={"idToken": "valid-tok", "isGoogleSignIn": True},
            )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data.get("needsUsername") is True

    def test_google_signin_with_existing_username_logs_in(self, client):
        user = make_mock_user()
        user.username = "existing_user"
        with patch("app.auth.FirebaseService.authenticate_with_token", return_value=user):
            resp = client.post(
                "/api/auth/login",
                json={"idToken": "valid-tok", "isGoogleSignIn": True},
            )
        assert resp.status_code == 200
        assert resp.get_json()["message"] == "Login successful"


class TestLogout:
    def test_logout_always_succeeds(self, client):
        resp = client.get("/api/auth/logout")
        assert resp.status_code == 200
        assert resp.get_json()["message"] == "Logout successful"


class TestSetUsername:
    def test_no_token_returns_400(self, client):
        resp = client.post("/api/auth/set-username", json={"username": "alice"})
        assert resp.status_code == 400

    def test_missing_username_returns_400(self, client):
        resp = client.post("/api/auth/set-username", json={"idToken": "tok"})
        assert resp.status_code == 400

    def test_too_short_username_returns_400(self, client):
        resp = client.post(
            "/api/auth/set-username",
            json={"idToken": "tok", "username": "ab"},
        )
        assert resp.status_code == 400
        assert "3 characters" in resp.get_json()["error"]

    def test_too_long_username_returns_400(self, client):
        resp = client.post(
            "/api/auth/set-username",
            json={"idToken": "tok", "username": "a" * 21},
        )
        assert resp.status_code == 400
        assert "20 characters" in resp.get_json()["error"]

    def test_invalid_token_returns_401(self, client):
        with patch("app.auth.FirebaseService.authenticate_with_token", return_value=None):
            resp = client.post(
                "/api/auth/set-username",
                json={"idToken": "bad", "username": "alice"},
            )
        assert resp.status_code == 401

    def test_taken_username_returns_400(self, client):
        user = make_mock_user()
        with patch("app.auth.FirebaseService.authenticate_with_token", return_value=user), \
             patch("app.auth.FirebaseService.is_username_taken", return_value=True):
            resp = client.post(
                "/api/auth/set-username",
                json={"idToken": "valid-tok", "username": "taken"},
            )
        assert resp.status_code == 400
        assert "already taken" in resp.get_json()["error"]

    def test_valid_username_set_successfully(self, client):
        user = make_mock_user()
        with patch("app.auth.FirebaseService.authenticate_with_token", return_value=user), \
             patch("app.auth.FirebaseService.is_username_taken", return_value=False), \
             patch("app.auth.FirebaseService.set_user_username", return_value=True):
            resp = client.post(
                "/api/auth/set-username",
                json={"idToken": "valid-tok", "username": "newname"},
            )
        assert resp.status_code == 200
        assert resp.get_json()["message"] == "Username set successfully"


class TestGetUser:
    def test_unauthenticated_returns_401(self, client):
        with patch("app.auth.current_user") as mock_cu:
            mock_cu.is_authenticated = False
            resp = client.get("/api/auth/user")
        assert resp.status_code == 401

    def test_authenticated_returns_user_data(self, client):
        user = make_mock_user()
        with patch("app.auth.current_user", user):
            resp = client.get("/api/auth/user")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["user"]["id"] == "uid-test"
        assert data["user"]["email"] == "test@example.com"
