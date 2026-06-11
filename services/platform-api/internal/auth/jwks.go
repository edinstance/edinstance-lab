package auth

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

type KeyStore struct {
	mu   sync.RWMutex
	keys map[string]ed25519.PublicKey
	url  string
}

var jwksHTTPClient = &http.Client{
	Transport: otelhttp.NewTransport(http.DefaultTransport),
	Timeout:   5 * time.Second,
}

func NewKeyStore(ctx context.Context, jwksURL string) (*KeyStore, error) {
	jwksURL = strings.TrimSpace(jwksURL)
	if jwksURL == "" {
		return nil, errors.New("jwks url is empty")
	}

	ks := &KeyStore{
		keys: make(map[string]ed25519.PublicKey),
		url:  jwksURL,
	}

	if err := ks.refresh(ctx); err != nil {
		return nil, err
	}

	return ks, nil
}

func (ks *KeyStore) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ks.url, nil)
	if err != nil {
		return err
	}

	res, err := jwksHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetch jwks: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("jwks fetch failed: %s", res.Status)
	}

	var jwks JWKS
	if err := json.NewDecoder(res.Body).Decode(&jwks); err != nil {
		return fmt.Errorf("decode jwks: %w", err)
	}

	keys := make(map[string]ed25519.PublicKey)
	for _, k := range jwks.Keys {
		if k.Kty != "OKP" || k.Crv != "Ed25519" {
			continue
		}

		raw, err := base64.RawURLEncoding.DecodeString(k.X)
		if err != nil {
			continue
		}
		if len(raw) != ed25519.PublicKeySize {
			continue
		}

		keys[k.Kid] = ed25519.PublicKey(raw)
	}

	if len(keys) == 0 {
		return errors.New("no valid jwks keys")
	}

	ks.mu.Lock()
	ks.keys = keys
	ks.mu.Unlock()

	return nil
}
