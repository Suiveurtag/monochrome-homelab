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
