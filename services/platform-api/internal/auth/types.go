package auth

type JWKSKey struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	X   string `json:"x"`
}

type JWKS struct {
	Keys []JWKSKey `json:"keys"`
}
