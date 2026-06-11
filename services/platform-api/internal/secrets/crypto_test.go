package secrets

import (
	"encoding/base64"
	"testing"
)

func TestCipherRoundTrip(t *testing.T) {
	key := base64.StdEncoding.EncodeToString([]byte("0123456789abcdef0123456789abcdef"))
	cipher, err := NewCipher(key)
	if err != nil {
		t.Fatalf("NewCipher() error = %v", err)
	}

	encrypted, err := cipher.Encrypt("DATABASE_URL=postgres://example")
	if err != nil {
		t.Fatalf("Encrypt() error = %v", err)
	}
	if encrypted == "DATABASE_URL=postgres://example" {
		t.Fatal("Encrypt() returned plaintext")
	}

	decrypted, err := cipher.Decrypt(encrypted)
	if err != nil {
		t.Fatalf("Decrypt() error = %v", err)
	}
	if decrypted != "DATABASE_URL=postgres://example" {
		t.Fatalf("Decrypt() = %q, want original plaintext", decrypted)
	}
}

func TestCipherRejectsInvalidKeyLength(t *testing.T) {
	if _, err := NewCipher("short"); err == nil {
		t.Fatal("NewCipher() error = nil, want invalid key length error")
	}
}
