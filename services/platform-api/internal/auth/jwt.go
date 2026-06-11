package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

var (
	ErrInvalidToken    = errors.New("invalid token")
	ErrTokenExpired    = errors.New("token expired")
	ErrInvalidIssuer   = errors.New("invalid token issuer")
	ErrInvalidAudience = errors.New("invalid token audience")
)

func (ks *KeyStore) VerifyJWT(ctx context.Context, tokenString string, issuer string, audience string) (*Claims, error) {
	keyFunc := func(token *jwt.Token) (any, error) {
		if token.Method == nil || token.Method.Alg() != jwt.SigningMethodEdDSA.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Method)
		}

		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, errors.New("missing kid")
		}

		ks.mu.RLock()
		key, exists := ks.keys[kid]
		ks.mu.RUnlock()

		if !exists {
			if err := ks.refresh(ctx); err != nil {
				return nil, err
			}

			ks.mu.RLock()
			key = ks.keys[kid]
			ks.mu.RUnlock()

			if key == nil {
				return nil, errors.New("unknown kid")
			}
		}

		return key, nil
	}

	token, err := jwt.ParseWithClaims(
		tokenString,
		&Claims{},
		keyFunc,
		jwt.WithIssuer(issuer),
		jwt.WithAudience(audience),
		jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}),
	)
	if err != nil {
		switch {
		case errors.Is(err, jwt.ErrTokenExpired):
			return nil, ErrTokenExpired
		case errors.Is(err, jwt.ErrTokenInvalidIssuer):
			return nil, ErrInvalidIssuer
		case errors.Is(err, jwt.ErrTokenInvalidAudience):
			return nil, ErrInvalidAudience
		default:
			return nil, ErrInvalidToken
		}
	}
	if !token.Valid {
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok {
		return nil, ErrInvalidToken
	}
	return claims, nil
}
