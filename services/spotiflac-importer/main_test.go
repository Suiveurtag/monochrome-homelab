package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestCommunityVerificationBridgesPublicAndLoopbackCallbacks(t *testing.T) {
	verification.Lock()
	verification.token = ""
	verification.challenge = ""
	verification.callbackURL = ""
	verification.Unlock()

	received := make(chan url.Values, 1)
	callback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received <- r.URL.Query()
		w.WriteHeader(http.StatusOK)
	}))
	defer callback.Close()

	loopback := callback.URL + "/session-grant?state=expected-state"
	prepareCommunityVerification("https://verify.example/challenge?cb=" + url.QueryEscape(loopback))
	challenge, err := url.Parse(communityVerificationURL())
	if err != nil {
		t.Fatal(err)
	}
	publicCallback, err := url.Parse(challenge.Query().Get("cb"))
	if err != nil {
		t.Fatal(err)
	}
	if publicCallback.Path != "/api/selfhost/community-verification/callback" {
		t.Fatalf("unexpected public callback %q", publicCallback.String())
	}

	query := publicCallback.Query()
	query.Set("grant", "expected-grant")
	publicCallback.RawQuery = query.Encode()
	recorder := httptest.NewRecorder()
	handleCommunityVerificationCallback(recorder, httptest.NewRequest(http.MethodGet, publicCallback.String(), nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("callback returned %d: %s", recorder.Code, recorder.Body.String())
	}
	values := <-received
	if values.Get("state") != "expected-state" || values.Get("grant") != "expected-grant" {
		t.Fatalf("unexpected callback values: %v", values)
	}
	if communityVerificationURL() != "" {
		t.Fatal("verification state was not cleared")
	}
	if !strings.Contains(recorder.Body.String(), "Download verified") {
		t.Fatal("success page was not returned")
	}
}

func TestCommunityVerificationRejectsInvalidToken(t *testing.T) {
	verification.Lock()
	verification.token = "expected-token"
	verification.callbackURL = "http://127.0.0.1:1234/session-grant?state=test"
	verification.Unlock()
	recorder := httptest.NewRecorder()
	handleCommunityVerificationCallback(recorder, httptest.NewRequest(http.MethodGet, "/api/selfhost/community-verification/callback?token=wrong", nil))
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", recorder.Code)
	}
}
