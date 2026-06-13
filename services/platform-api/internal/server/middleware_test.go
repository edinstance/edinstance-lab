package server

import "testing"

func TestIsAllowedOrigin(t *testing.T) {
	t.Parallel()

	tests := map[string]bool{
		"http://localhost:3000":                true,
		"http://127.0.0.1:3000":                true,
		"https://ui.edinstance.uk":             true,
		"https://ui.local.edinstance.uk":       true,
		"https://other.edinstance.uk":          false,
		"https://ui.edinstance.uk.evil.test":   false,
		"javascript:alert(1)":                  false,
		"":                                     false,
	}

	for origin, expected := range tests {
		origin, expected := origin, expected
		t.Run(origin, func(t *testing.T) {
			t.Parallel()
			if actual := isAllowedOrigin(origin); actual != expected {
				t.Fatalf("isAllowedOrigin(%q) = %t, want %t", origin, actual, expected)
			}
		})
	}
}
