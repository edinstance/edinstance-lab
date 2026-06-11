package auth

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestVerifyJWT(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	server := jwksServer(publicKey)
	defer server.Close()

	keyStore, err := NewKeyStore(server.URL)
	if err != nil {
		t.Fatalf("new key store: %v", err)
	}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "issuer",
			Subject:   "admin",
			Audience:  []string{"platform-api"},
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	token.Header["kid"] = "test-key"
	tokenString, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	claims, err := keyStore.VerifyJWT(context.Background(), tokenString, "issuer", "platform-api")
	if err != nil {
		t.Fatalf("verify token: %v", err)
	}
	if claims.Subject != "admin" {
		t.Fatalf("subject = %q, want admin", claims.Subject)
	}
}

func TestVerifyJWTRejectsUnexpectedSigningMethod(t *testing.T) {
	publicKey, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	server := jwksServer(publicKey)
	defer server.Close()

	keyStore, err := NewKeyStore(server.URL)
	if err != nil {
		t.Fatalf("new key store: %v", err)
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "issuer",
			Subject:   "admin",
			Audience:  []string{"platform-api"},
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	token.Header["kid"] = "test-key"
	tokenString, err := token.SignedString([]byte("secret"))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	if _, err := keyStore.VerifyJWT(context.Background(), tokenString, "issuer", "platform-api"); err == nil {
		t.Fatal("expected HS256 token to be rejected")
	}
}

func TestNewKeyStoreDoesNotFetchJWKS(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		requests++
	}))
	serverURL := server.URL
	server.Close()

	keyStore, err := NewKeyStore(serverURL)
	if err != nil {
		t.Fatalf("new key store: %v", err)
	}
	if keyStore == nil {
		t.Fatal("expected key store")
	}
	if requests != 0 {
		t.Fatalf("JWKS requests = %d, want 0", requests)
	}
}

func jwksServer(publicKey ed25519.PublicKey) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(JWKS{
			Keys: []JWKSKey{{
				Kid: "test-key",
				Kty: "OKP",
				Crv: "Ed25519",
				X:   base64.RawURLEncoding.EncodeToString(publicKey),
			}},
		})
	}))
}
