package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindDownloadedFLAC(t *testing.T) {
	dir := t.TempDir()
	nested := filepath.Join(dir, "album")
	if err := os.Mkdir(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	expected := filepath.Join(nested, "track.flac")
	if err := os.WriteFile(expected, []byte("fLaC-test"), 0o600); err != nil {
		t.Fatal(err)
	}
	actual, err := findDownloadedFLAC(dir)
	if err != nil {
		t.Fatal(err)
	}
	if actual != expected {
		t.Fatalf("expected %q, got %q", expected, actual)
	}
}

func TestFindDownloadedFLACRejectsEmptyOrMissingFiles(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "empty.flac"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := findDownloadedFLAC(dir); err == nil {
		t.Fatal("expected missing FLAC error")
	}
}

func TestHeadlessProvider(t *testing.T) {
	if provider := headlessProvider([]byte("[SOURCE] QOBUZ · qobuz · 6")); provider != "qobuz" {
		t.Fatalf("unexpected provider %q", provider)
	}
	if provider := headlessProvider([]byte("[SOURCE] DEEZER")); provider != "deezer" {
		t.Fatalf("unexpected provider %q", provider)
	}
}

// stableShareID must match the frontend stableId() hash used for
// selfhost-album-* / selfhost-artist-* URLs so the share resolver agrees
// with the SPA router.
func TestStableShareIDMatchesFrontend(t *testing.T) {
	cases := []struct {
		prefix, value, want string
	}{
		{"selfhost-album", "The Beatles|Abbey Road", "selfhost-album-h39baq"},
		{"selfhost-artist", "Daft Punk", "selfhost-artist-s9z821"},
		{"selfhost-album", "Radiohead|In Rainbows", "selfhost-album-lslu53"},
		{"selfhost-artist", "Kendrick Lamar", "selfhost-artist-apomqw"},
		{"selfhost-album", "Led Zeppelin|Led Zeppelin IV", "selfhost-album-amqfcf"},
		{"selfhost-artist", "Beyoncé", "selfhost-artist-o0q4cb"},
	}
	for _, tc := range cases {
		if got := stableShareID(tc.prefix, tc.value); got != tc.want {
			t.Errorf("stableShareID(%q, %q) = %q, want %q", tc.prefix, tc.value, got, tc.want)
		}
	}
}

func TestShareCanonicalPath(t *testing.T) {
	cases := []struct {
		kind, id, want string
	}{
		{"track", "abc123", "/track/abc123"},
		{"album", "selfhost-album-45p4", "/album/selfhost-album-45p4"},
		{"artist", "selfhost-artist-gm3", "/artist/selfhost-artist-gm3"},
		{"userplaylist", "pl-uuid-9", "/userplaylist/pl-uuid-9"},
	}
	for _, tc := range cases {
		if got := shareCanonicalPath(tc.kind, tc.id); got != tc.want {
			t.Errorf("shareCanonicalPath(%q, %q) = %q, want %q", tc.kind, tc.id, got, tc.want)
		}
	}
}
